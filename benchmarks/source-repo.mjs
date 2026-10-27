import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { JSDOM } from "jsdom";
import ts from "typescript";
import { build } from "vite";

const args = process.argv.slice(2);
assert(
	args.every(
		(arg) => arg === "--browser" || /^--(repo|tools|runs)=.+$/.test(arg),
	),
	"Usage: node benchmarks/source-repo.mjs --repo=PATH --tools=PATH [--browser] [--runs=15]",
);
const option = (key) =>
	args.find((arg) => arg.startsWith(`--${key}=`))?.slice(key.length + 3);
assert(option("repo") && option("tools"), "--repo and --tools are required");
const repo = path.resolve(option("repo"));
const tools = path.resolve(option("tools"));
const runs = Number(option("runs") ?? 15);
assert(Number.isInteger(runs) && runs >= 1 && runs <= 100);
const output = await mkdtemp(path.join(os.tmpdir(), "cal-diy-icon-benchmark-"));
console.log(`Output: ${output}`);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const bytes = (value) => ({
	raw: Buffer.byteLength(value),
	gzip: gzipSync(value, { level: 9 }).length,
	brotli: brotliCompressSync(value, {
		params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
	}).length,
});
const sum = (values) => values.reduce((a, b) => a + b, 0);
const git = (...args) =>
	execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
const initialStatus = git("status", "--porcelain");
const sources = {};
for (const file of [
	"packages/ui/components/icon/Icon.tsx",
	"packages/ui/components/icon/IconSprites.tsx",
	"packages/ui/components/icon/icon-list.mjs",
	"packages/ui/components/icon/icon-names.ts",
	"packages/ui/classNames.ts",
	"apps/web/app/icons/IconGrid.tsx",
	"apps/web/app/icons/page.tsx",
	"apps/web/app/layout.tsx",
	"apps/web/next.config.ts",
	"apps/web/public/icons/sprite.svg",
	"packages/ui/scripts/build-icons.mjs",
	"packages/ui/scripts/generate-icons.mjs",
	"yarn.lock",
])
	sources[file] = await readFile(path.join(repo, file), "utf8");
const sourceIcon = sources["packages/ui/components/icon/Icon.tsx"];
const sprite = sources["apps/web/public/icons/sprite.svg"];
const dom = new JSDOM(sprite, { contentType: "image/svg+xml" });
const symbols = [...dom.window.document.querySelectorAll("symbol")];
const symbolMap = new Map(symbols.map((symbol) => [symbol.id, symbol]));
const names = [...symbolMap.keys()].sort();
const declarationNames = [
	...sources["packages/ui/components/icon/icon-names.ts"].matchAll(
		/"([^"]+)"/g,
	),
].map((match) => match[1]);
const listSource = ts.createSourceFile(
	"icon-list.mjs",
	sources["packages/ui/components/icon/icon-list.mjs"],
	ts.ScriptTarget.Latest,
	true,
	ts.ScriptKind.JS,
);
const catalogNames = [];
function readCatalog(node) {
	if (ts.isArrayLiteralExpression(node))
		for (const element of node.elements) {
			assert(ts.isStringLiteral(element));
			catalogNames.push(element.text);
		}
	ts.forEachChild(node, readCatalog);
}
readCatalog(listSource);
assert.deepEqual(
	[...new Set(catalogNames)].sort(),
	names,
	"Catalog and checked-in sprite differ",
);
assert.deepEqual(
	declarationNames.sort(),
	names,
	"Generated union and sprite differ",
);
const presentation = (symbol) =>
	Object.fromEntries(
		[...symbol.attributes]
			.filter((attr) => !["id", "class"].includes(attr.name))
			.map((attr) => [attr.name, attr.value]),
	);
const attributes = presentation(symbols[0]);
assert(
	symbols.every(
		(symbol) =>
			JSON.stringify(presentation(symbol)) === JSON.stringify(attributes),
	),
	"Inline baseline requires common presentation attributes",
);

const usages = [];
for (const file of git("ls-files", "*.tsx", "*.ts").split("\n")) {
	if (!file.startsWith("apps/web/") && !file.startsWith("packages/")) continue;
	const text = await readFile(path.join(repo, file), "utf8");
	if (!text.includes("icon") && !text.includes("Icon")) continue;
	const source = ts.createSourceFile(
		file,
		text,
		ts.ScriptTarget.Latest,
		true,
		file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
	);
	const localNames = new Set();
	for (const node of source.statements) {
		if (
			!ts.isImportDeclaration(node) ||
			!ts.isStringLiteral(node.moduleSpecifier)
		)
			continue;
		const specifier = node.moduleSpecifier.text;
		const isIconModule =
			/^@calcom\/ui\/components\/icon(?:\/Icon)?$/.test(specifier) ||
			(specifier.startsWith(".") &&
				path
					.resolve(repo, path.dirname(file), specifier)
					.replace(/\.tsx?$/, "") ===
					path.join(repo, "packages/ui/components/icon/Icon"));
		if (!isIconModule) continue;
		if (node.importClause?.name) localNames.add(node.importClause.name.text);
		const bindings = node.importClause?.namedBindings;
		if (bindings && ts.isNamedImports(bindings))
			for (const spec of bindings.elements)
				if ((spec.propertyName?.text ?? spec.name.text) === "Icon")
					localNames.add(spec.name.text);
	}
	function visit(node) {
		if (
			(ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
			localNames.has(node.tagName.getText(source))
		) {
			const prop = node.attributes.properties.find(
				(attr) =>
					ts.isJsxAttribute(attr) && attr.name.getText(source) === "name",
			);
			const value = prop?.initializer;
			const literal =
				value &&
				(ts.isStringLiteral(value)
					? value
					: ts.isJsxExpression(value) &&
							value.expression &&
							ts.isStringLiteralLike(value.expression)
						? value.expression
						: null);
			usages.push({
				file,
				line:
					source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
				name: literal?.text ?? null,
				expression: value?.getText(source) ?? "spread or absent",
			});
		}
		ts.forEachChild(node, visit);
	}
	visit(source);
}
const subset = [
	...new Set(usages.map((usage) => usage.name).filter(Boolean)),
].sort();
assert(
	subset.length > 0 && subset.every((name) => symbolMap.has(name)),
	"A literal icon is absent from the sprite",
);
const lockedTools = JSON.parse(
	await readFile(path.join(tools, "package-lock.json"), "utf8"),
);
const expected = {
	react: "18.2.0",
	"react-dom": "18.2.0",
	"react-inlinesvg": "4.1.3",
	"react-from-dom": "0.7.3",
	"tailwind-merge": "1.13.2",
};
for (const [name, version] of Object.entries(expected))
	assert.equal(
		JSON.parse(
			await readFile(
				path.join(tools, `node_modules/${name}/package.json`),
				"utf8",
			),
		).version,
		version,
		name,
	);
const metadata = {
	date: new Date().toISOString(),
	revision: git("rev-parse", "HEAD"),
	sourceStatus: initialStatus,
	sourceHashes: Object.fromEntries(
		Object.entries(sources).map(([file, text]) => [file, hash(text)]),
	),
	runnerHash: hash(await readFile(import.meta.filename)),
	toolLockHash: hash(await readFile(path.join(tools, "package-lock.json"))),
	runtimeDependencies: Object.fromEntries(
		Object.entries(lockedTools.packages)
			.filter(([file]) => file)
			.map(([file, data]) => [file.replace("node_modules/", ""), data.version]),
	),
	node: process.version,
	vite: JSON.parse(
		await readFile(
			new URL("../node_modules/vite/package.json", import.meta.url),
			"utf8",
		),
	).version,
	platform: `${os.platform()} ${os.release()} ${os.arch()}`,
	cpu: os.cpus()[0]?.model,
	runs,
	network: {
		downloadBytesPerSecond: 200000,
		uploadBytesPerSecond: 93750,
		latencyMs: 150,
		cpuSlowdown: 4,
	},
	viewport: { width: 1440, height: 1000 },
	compression: { gzipLevel: 9, brotliQuality: 11, served: "gzip" },
	transport: "HTTP/1.1 localhost same-origin",
	quantiles: "sorted[floor((n-1)*p)]",
};
const inventory = {
	catalogEntries: catalogNames.length,
	catalogUnique: names.length,
	symbols: symbols.length,
	sprite: bytes(sprite),
	importingFiles: new Set(usages.map((usage) => usage.file)).size,
	directJsxCallsites: usages.length,
	literalCallsites: usages.filter((usage) => usage.name).length,
	distinctLiterals: subset.length,
	usages,
};
console.log(
	`Source inventory: ${names.length} symbols, ${inventory.directJsxCallsites} direct Icon callsites, ${subset.length} distinct literal names`,
);

const css = `:root{font-family:Arial,sans-serif;color:#111827;background:#f8fafc}body{margin:0}svg{display:block;vertical-align:middle}main{padding:32px;max-width:1180px;margin:auto}h1{font-size:28px}h2{font-size:20px;margin-top:24px}.grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}.flex{display:flex}.items-center{align-items:center}.gap-1{gap:4px}.fill-transparent{fill:transparent}.fill-blue-500{fill:#3b82f6}.bg-inverted{background:#111827;padding:8px}.text-inverted{color:#fff}`;
const monitor = `<script>window.bench={lcp:null,lcpElement:null,errors:[]};addEventListener('error',e=>window.bench.errors.push(e.message||'resource error'),true);new PerformanceObserver(list=>{for(const e of list.getEntries()){window.bench.lcp=e.startTime;window.bench.lcpElement=e.element?.tagName+':'+e.element?.textContent?.slice(0,80)}}).observe({type:'largest-contentful-paint',buffered:true});</script>`;
const profiles = [
	{ id: "showcase", icons: names, filled: true, mounts: 2 },
	{ id: "literal-subset", icons: subset, filled: false, mounts: 1 },
];
const fixtures = [];
for (const profile of profiles)
	for (const strategy of ["upstream", "inline", "native-external"]) {
		const id = `${profile.id}-${strategy}`;
		const directory = path.join(output, id);
		await mkdir(directory);
		await symlink(
			path.join(tools, "node_modules"),
			path.join(directory, "node_modules"),
			"dir",
		);
		await writeFile(
			path.join(directory, "classNames.ts"),
			sources["packages/ui/classNames.ts"],
		);
		await writeFile(
			path.join(directory, "icon-names.ts"),
			sources["packages/ui/components/icon/icon-names.ts"],
		);
		await writeFile(
			path.join(directory, "IconGrid.tsx"),
			sources["apps/web/app/icons/IconGrid.tsx"],
		);
		await writeFile(
			path.join(directory, "IconSprites.tsx"),
			sources["packages/ui/components/icon/IconSprites.tsx"],
		);
		let icon = sourceIcon;
		if (strategy === "native-external") {
			icon = icon.replace(
				"<use href={`#${name}`} />",
				"<use href={`${import.meta.env.BASE_URL}icons/sprite.svg#${name}`} />",
			);
			assert.notEqual(
				icon,
				sourceIcon,
				"External reference replacement failed",
			);
		} else if (strategy === "inline") {
			const declarations = [];
			for (const [index, name] of profile.icons.entries()) {
				const jsx = symbolMap
					.get(name)
					.innerHTML.replace(
						/\b([a-z]+)-([a-z-]+)=/g,
						(_, a, b) =>
							a +
							b.replace(/(^|-)([a-z])/g, (_m, _dash, c) => c.toUpperCase()) +
							"=",
					);
				declarations.push(`function Glyph${index}(){return <>${jsx}</>}`);
			}
			const rootAttrs = Object.entries(attributes)
				.map(
					([key, value]) =>
						`${key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())}=${JSON.stringify(value)}`,
				)
				.join(" ");
			icon =
				`${declarations.join("\n")}\nconst glyphs={${profile.icons.map((name, index) => `${JSON.stringify(name)}:Glyph${index}`).join(",")}};\n` +
				icon
					.replace(
						"  return (",
						"  const Glyph = glyphs[name as keyof typeof glyphs];\n  return (",
					)
					.replace("<svg", `<svg ${rootAttrs}`)
					.replace("<use href={`#${name}`} />", "<Glyph />");
			assert(!icon.includes("<use href="), "Inline replacement failed");
		}
		await writeFile(path.join(directory, "Icon.tsx"), icon);
		await writeFile(path.join(directory, "style.css"), css);
		if (strategy !== "inline") {
			await mkdir(path.join(directory, "public/icons"), { recursive: true });
			await writeFile(path.join(directory, "public/icons/sprite.svg"), sprite);
		}
		const inject = strategy === "upstream";
		const spriteMounts = inject ? "<IconSprites />".repeat(profile.mounts) : "";
		await writeFile(
			path.join(directory, "main.tsx"),
			`import {useLayoutEffect} from 'react';import{createRoot}from'react-dom/client';import{IconGrid}from'./IconGrid';${inject ? "import{IconSprites}from'./IconSprites';" : ""}import './style.css';
function App(){useLayoutEffect(()=>{performance.mark('app-commit');function check(){const icons=[...document.querySelectorAll('#icons svg')];if(icons.length&&icons.every(svg=>{const box=svg.getBBox();return box.width>0&&box.height>0})){requestAnimationFrame(()=>performance.mark('geometry-ready'))}else requestAnimationFrame(check)}requestAnimationFrame(check)},[]);return <>${spriteMounts}<main><h1>Icons Showcase</h1><div id="icons"><IconGrid title="Regular Icons" icons={${JSON.stringify(profile.icons)}}/>${profile.filled ? `<IconGrid title="Filled Icons" icons={${JSON.stringify(profile.icons)}} rootClassName="bg-inverted text-inverted" iconClassName="fill-blue-500"/>` : ""}</div></main></>};createRoot(document.getElementById('root')!).render(<App/>);`,
		);
		await writeFile(
			path.join(directory, "index.html"),
			`<!doctype html><html lang="en"><head><meta charset="UTF-8"><link rel="icon" href="data:,"><title>Source icon benchmark</title>${monitor}</head><body><div id="root"></div><script type="module" src="./main.tsx"></script></body></html>`,
		);
		await build({
			configFile: false,
			root: directory,
			base: `/${id}/`,
			logLevel: "error",
			esbuild: { jsx: "automatic" },
			resolve: {
				alias: {
					"@calcom/ui/classNames": path.join(directory, "classNames.ts"),
					"@calcom/ui/components/icon": path.join(directory, "Icon.tsx"),
				},
			},
			define: {
				"process.env.NEXT_PUBLIC_WEBAPP_URL": JSON.stringify(`/${id}`),
				"process.env.NEXT_PUBLIC_CALCOM_VERSION": JSON.stringify("6.2.0"),
				"process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA": JSON.stringify(
					metadata.revision,
				),
			},
			build: { manifest: true, sourcemap: false },
		});
		const dist = path.join(directory, "dist");
		const manifest = JSON.parse(
			await readFile(path.join(dist, ".vite/manifest.json"), "utf8"),
		);
		const files = new Set(["index.html"]);
		function visit(key) {
			const entry = manifest[key];
			files.add(entry.file);
			for (const file of entry.css ?? []) files.add(file);
			for (const key of entry.imports ?? []) visit(key);
		}
		visit("index.html");
		if (strategy !== "inline") files.add("icons/sprite.svg");
		const sizes = Object.fromEntries(
			await Promise.all(
				[...files].map(async (file) => [
					file,
					bytes(await readFile(path.join(dist, file))),
				]),
			),
		);
		const metrics = Object.fromEntries(
			["raw", "gzip", "brotli"].map((encoding) => [
				encoding,
				{
					js: sum(
						[...files]
							.filter((file) => file.endsWith(".js"))
							.map((file) => sizes[file][encoding]),
					),
					total: sum([...files].map((file) => sizes[file][encoding])),
				},
			]),
		);
		const fixture = {
			id,
			profile: profile.id,
			strategy,
			distinctIcons: profile.icons.length,
			instances: profile.icons.length * (profile.filled ? 2 : 1),
			spriteMounts: inject ? profile.mounts : 0,
			sizes,
			metrics,
			dist,
		};
		fixtures.push(fixture);
		console.log(
			`${id}: JS gzip ${metrics.gzip.js} B; total gzip ${metrics.gzip.total} B`,
		);
	}

const samples = [];
if (args.includes("--browser")) {
	const moduleName = process.env.PLAYWRIGHT_MODULE ?? "playwright";
	const { chromium } = await import(
		path.isAbsolute(moduleName) ? pathToFileURL(moduleName).href : moduleName
	);
	const packagePath = path.isAbsolute(moduleName)
		? path.join(path.dirname(moduleName), "package.json")
		: createRequire(import.meta.url).resolve("playwright/package.json");
	metadata.playwright = JSON.parse(await readFile(packagePath, "utf8")).version;
	const resources = new Map();
	for (const fixture of fixtures)
		for (const file of Object.keys(fixture.sizes)) {
			const body = gzipSync(await readFile(path.join(fixture.dist, file)), {
				level: 9,
			});
			assert.equal(body.length, fixture.sizes[file].gzip);
			resources.set(`/${fixture.id}/${file}`, {
				body,
				type: file.endsWith(".html")
					? "text/html"
					: file.endsWith(".js")
						? "text/javascript"
						: file.endsWith(".css")
							? "text/css"
							: "image/svg+xml",
			});
		}
	const server = createServer((req, res) => {
		const resource = resources.get(req.url?.split("?")[0]);
		if (!resource) {
			res.writeHead(404);
			res.end();
			return;
		}
		res.writeHead(200, {
			"Content-Type": resource.type,
			"Content-Encoding": "gzip",
			"Content-Length": resource.body.length,
			"Cache-Control": req.url.includes(".html")
				? "no-store"
				: "public,max-age=31536000,immutable",
			Vary: "Accept-Encoding",
		});
		res.end(resource.body);
	});
	const browser = await chromium.launch();
	metadata.browser = browser.version();
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	const origin = `http://127.0.0.1:${server.address().port}`;
	try {
		for (let round = 0; round < runs; round++) {
			for (const fixture of round % 2 ? [...fixtures].reverse() : fixtures) {
				const context = await browser.newContext({
					viewport: metadata.viewport,
					serviceWorkers: "block",
				});
				const page = await context.newPage();
				const cdp = await context.newCDPSession(page);
				await cdp.send("Network.enable");
				await cdp.send("Network.setCacheDisabled", { cacheDisabled: false });
				await cdp.send("Emulation.setCPUThrottlingRate", {
					rate: metadata.network.cpuSlowdown,
				});
				const rule = {
					urlPattern: "",
					latency: metadata.network.latencyMs,
					downloadThroughput: metadata.network.downloadBytesPerSecond,
					uploadThroughput: metadata.network.uploadBytesPerSecond,
				};
				await cdp.send("Network.emulateNetworkConditionsByRule", {
					offline: false,
					matchedNetworkConditions: [rule],
				});
				await cdp.send("Network.overrideNetworkState", {
					offline: false,
					latency: rule.latency,
					downloadThroughput: rule.downloadThroughput,
					uploadThroughput: rule.uploadThroughput,
					connectionType: "cellular4g",
				});
				for (const state of ["cold", "repeat"]) {
					const errors = [];
					const onError = (error) => errors.push(error.message);
					page.on("pageerror", onError);
					const responses = [];
					const onResponse = (response) =>
						responses.push({
							status: response.status(),
							encoding: response.headers()["content-encoding"],
						});
					page.on("response", onResponse);
					await page.goto(`${origin}/${fixture.id}/index.html`, {
						waitUntil: "load",
					});
					await page.waitForFunction(
						() => performance.getEntriesByName("geometry-ready").length > 0,
					);
					await page.waitForTimeout(250);
					const measurement = await page.evaluate(() => {
						const nav = performance.getEntriesByType("navigation")[0];
						const entries = [nav, ...performance.getEntriesByType("resource")]
							.filter((entry) => !entry.name.endsWith("favicon.ico"))
							.map((entry) => ({
								url: new URL(entry.name).pathname,
								query: new URL(entry.name).search,
								initiator: entry.initiatorType,
								transferSize: entry.transferSize,
								encodedBodySize: entry.encodedBodySize,
								decodedBodySize: entry.decodedBodySize,
								responseEnd: entry.responseEnd,
								protocol: entry.nextHopProtocol,
							}));
						return {
							fcp:
								performance.getEntriesByName("first-contentful-paint")[0]
									?.startTime ?? null,
							lcp: window.bench.lcp,
							lcpElement: window.bench.lcpElement,
							commit: performance.getEntriesByName("app-commit")[0].startTime,
							geometryReady:
								performance.getEntriesByName("geometry-ready")[0].startTime,
							exposedElements: document.querySelectorAll("*").length,
							symbols: document.querySelectorAll("symbol").length,
							iconCount: document.querySelectorAll("#icons svg").length,
							entries,
							errors: window.bench.errors,
						};
					});
					assert.deepEqual(errors, []);
					assert.deepEqual(measurement.errors, []);
					assert(
						responses.every(
							(response) =>
								response.status === 200 && response.encoding === "gzip",
						),
					);
					assert.equal(measurement.iconCount, fixture.instances);
					assert.equal(
						measurement.symbols,
						fixture.spriteMounts * symbols.length,
					);
					assert(measurement.fcp !== null && measurement.lcp !== null);
					assert.deepEqual(
						new Set(measurement.entries.map((entry) => entry.url)),
						new Set(
							Object.keys(fixture.sizes).map(
								(file) => `/${fixture.id}/${file}`,
							),
						),
					);
					const network = measurement.entries.filter(
						(entry) => entry.transferSize > 0,
					);
					const bodyBytes = sum(network.map((entry) => entry.encodedBodySize));
					if (state === "cold")
						assert.equal(bodyBytes, fixture.metrics.gzip.total);
					else
						assert(
							network.every((entry) => entry.url.endsWith("index.html")),
							"Static assets were not reused",
						);
					samples.push({
						round: round + 1,
						fixture: fixture.id,
						state,
						...measurement,
						bodyBytes,
						networkRequests: network.length,
					});
					if (round === 0 && state === "cold")
						await page.screenshot({
							path: path.join(output, `${fixture.id}.png`),
							fullPage: true,
						});
					page.off("pageerror", onError);
					page.off("response", onResponse);
				}
				await context.close();
			}
			await writeFile(
				path.join(output, "samples.json"),
				JSON.stringify(samples, null, 2) + "\n",
			);
			console.log(`Browser round ${round + 1}/${runs} complete`);
		}
	} finally {
		await browser.close();
		await new Promise((resolve) => server.close(resolve));
	}
}
const timings = [];
const distribution = (values) => {
	const sorted = [...values].sort((a, b) => a - b);
	const q = (p) => sorted[Math.floor((sorted.length - 1) * p)];
	return {
		median: q(0.5),
		p25: q(0.25),
		p75: q(0.75),
		min: sorted[0],
		max: sorted.at(-1),
	};
};
for (const fixture of fixtures)
	for (const state of ["cold", "repeat"]) {
		const group = samples.filter(
			(sample) => sample.fixture === fixture.id && sample.state === state,
		);
		if (group.length)
			timings.push({
				fixture: fixture.id,
				state,
				n: group.length,
				...Object.fromEntries(
					[
						"fcp",
						"lcp",
						"commit",
						"geometryReady",
						"exposedElements",
						"bodyBytes",
						"networkRequests",
					].map((key) => [
						key,
						distribution(group.map((sample) => sample[key])),
					]),
				),
			});
	}
for (const [file, source] of Object.entries(sources))
	assert.equal(
		await readFile(path.join(repo, file), "utf8"),
		source,
		`Source changed: ${file}`,
	);
assert.equal(
	git("status", "--porcelain"),
	initialStatus,
	"Source checkout changed",
);
await writeFile(
	path.join(output, "results.json"),
	JSON.stringify(
		{
			metadata,
			inventory,
			profiles,
			builds: fixtures.map(({ dist, ...fixture }) => fixture),
			timings,
			samples,
		},
		null,
		2,
	) + "\n",
);
console.log(`Saved ${output}/results.json`);
