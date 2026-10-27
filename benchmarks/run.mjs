/** Production-build comparison. Writes fixtures/results to a temporary directory only. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { build } from "vite";
import { readIconIds, readIcons, renderSprite, resolveLucideIconsDirectory } from "../scripts/build-icons.mjs";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
assert(args.every((arg) => arg === "--browser" || /^--runs=\d+$/.test(arg)), "Usage: node benchmarks/run.mjs [--browser] [--runs=15]");
const runs = Number(args.find((arg) => arg.startsWith("--runs="))?.split("=")[1] ?? 15);
assert(runs >= 1 && runs <= 100, "runs must be between 1 and 100");
const output = await mkdtemp(path.join(os.tmpdir(), "typed-svg-benchmark-"));
console.log(`Output: ${output}`);
const bytes = (content) => ({
  raw: Buffer.byteLength(content),
  gzip: gzipSync(content, { level: 9 }).length,
  brotli: brotliCompressSync(content, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
});
const sum = (values) => values.reduce((a, b) => a + b, 0);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const demoIds = (await readIconIds()).sort();
const available = (await readdir(resolveLucideIconsDirectory())).filter((name) => name.endsWith(".svg")).map((name) => name.slice(0, -4));
const selected = [...demoIds, ...available.filter((id) => !demoIds.includes(id)).sort((a, b) => hash(a).localeCompare(hash(b)))].slice(0, 500);
assert.equal(new Set(selected).size, 500);
const icons = await readIcons(selected);
const byId = new Map(icons.map((icon) => [icon.id, icon]));
const routeA = selected.slice(0, 40);
const routeB = selected.slice(20, 60);
const sharedIds = selected.slice(0, 60);
assert.equal(routeA.filter((id) => routeB.includes(id)).length, 20);
const sourceIcon = await readFile(path.join(root, "src/icon/Icon.tsx"), "utf8");
const app = await readFile(path.join(root, "src/App.tsx"), "utf8");
const css = await readFile(path.join(root, "src/App.css"), "utf8");
const versions = {};
for (const name of ["react", "react-dom", "vite", "lucide-static"]) {
  versions[name] = JSON.parse(await readFile(path.join(root, `node_modules/${name}/package.json`), "utf8")).version;
}
let revision = null;
try { revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch {}
const metadata = {
  date: new Date().toISOString(), revision, versions, node: process.version,
  platform: `${os.platform()} ${os.release()} ${os.arch()}`, cpu: os.cpus()[0]?.model,
  compression: { gzipLevel: 9, brotliQuality: 11, browserEncoding: "gzip" },
  network: { downloadBytesPerSecond: 200000, uploadBytesPerSecond: 93750, latencyMs: 150, cpuSlowdown: 4 },
  viewport: { width: 1440, height: 1000 }, runs,
  selection: { algorithm: "demo ids first, remaining SVG filenames sorted by SHA-256(id)", catalog: selected, routeA, routeB },
  sourceHashes: { runner: hash(await readFile(import.meta.filename)), generator: hash(await readFile(path.join(root, "scripts/build-icons.mjs"))), component: hash(sourceIcon), app: hash(app), css: hash(css), lockfile: hash(await readFile(path.join(root, "package-lock.json"))) },
};

const monitor = `<script>
window.bench = { lcp: null, lcpElement: null, errors: [] };
addEventListener('error', event => window.bench.errors.push(event.message || 'resource error'), true);
new PerformanceObserver(list => { for (const entry of list.getEntries()) {
  window.bench.lcp = entry.startTime;
  window.bench.lcpElement = entry.element?.tagName + ':' + entry.element?.textContent?.slice(0, 80);
} }).observe({ type: 'largest-contentful-paint', buffered: true });
</script>`;
const enterpriseApp = `import type { ComponentType } from 'react';
export function Dashboard({ Icon, names }: { Icon: ComponentType<any>; names: string[] }) {
  return <main className="page"><h1>Operations dashboard</h1><p>Team activity, tasks and scheduled work.</p>
    <section aria-label="Activity" className="grid">{Array.from({ length: 400 }, (_, i) =>
      <article className="tile" key={i}><Icon name={names[i % names.length]} size={24} />
        <span>Task {i + 1}</span></article>)}</section></main>;
}`;

async function createFixture(scenario, strategy, spriteIds) {
  const id = `${scenario}-${strategy}`;
  const directory = path.join(output, id);
  await mkdir(path.join(directory, "icon"), { recursive: true });
  await symlink(path.join(root, "node_modules"), path.join(directory, "node_modules"), "dir");
  await writeFile(path.join(directory, "style.css"), css);
  await writeFile(path.join(directory, "App.tsx"), app);
  await writeFile(path.join(directory, "Dashboard.tsx"), enterpriseApp);
  const routes = scenario === "demo" ? { a: demoIds } : { a: routeA, b: routeB };
  if (spriteIds) {
    await mkdir(path.join(directory, "public/icons"), { recursive: true });
    await writeFile(path.join(directory, "public/icons/sprite.svg"), renderSprite([...spriteIds].sort().map((name) => byId.get(name))));
    await writeFile(path.join(directory, "public/THIRD_PARTY_NOTICES.txt"), await readFile(path.join(root, "public/THIRD_PARTY_NOTICES.txt")));
    await writeFile(path.join(directory, "icon/Icon.tsx"), sourceIcon);
  } else {
    await mkdir(path.join(directory, "glyphs"));
    for (const name of new Set(Object.values(routes).flat())) {
      const jsx = byId.get(name).inner.replace(/\b([a-z]+)-([a-z-]+)=/g, (_, a, b) => a + b.replace(/(^|-)([a-z])/g, (_m, _dash, c) => c.toUpperCase()) + "=");
      await writeFile(path.join(directory, `glyphs/${name}.tsx`), `export default function Glyph() { return <>${jsx}</>; }\n`);
    }
  }
  // IconName is erased. Separate route registries let Rollup share overlapping glyphs.
  await writeFile(path.join(directory, "icon/icon-names.ts"), `export type IconName = string;\n`);
  for (const [route, names] of Object.entries(routes)) {
    let iconModule;
    if (spriteIds) {
      iconModule = `export { Icon } from './Icon';\n`;
    } else {
      const imports = names.map((name, index) => `import Glyph${index} from '../glyphs/${name}';`).join("\n");
      const registry = `const glyphs = {${names.map((name, index) => `${JSON.stringify(name)}: Glyph${index}`).join(",")}};\n`;
      iconModule = imports + "\n" + registry + sourceIcon
        .replace(/const SPRITE_URL = [^;]+;/, "")
        .replace("const isDecorative =", "const Glyph = glyphs[name as keyof typeof glyphs];\n  const isDecorative =")
        .replace('stroke="currentColor"', 'stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"')
        .replace('<use href={`${SPRITE_URL}#${name}`} />', "<Glyph />");
      assert(!iconModule.includes('<use href='), "Inline fixture still references sprite");
    }
    iconModule += `\nexport const iconNames = ${JSON.stringify(names)};\n`;
    await writeFile(path.join(directory, `icon/route-${route}.tsx`), iconModule);
    if (scenario === "demo") await writeFile(path.join(directory, "icon/index.ts"), `export { Icon, iconNames } from './route-a';\n`);
    const render = scenario === "demo" ? "<App />" : "<Dashboard Icon={Icon} names={iconNames} />";
    const imports = scenario === "demo" ? "import { App } from './App';" : `import { Dashboard } from './Dashboard'; import { Icon, iconNames } from './icon/route-${route}';`;
    await writeFile(path.join(directory, `route-${route}.tsx`), `import { useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
${imports}
function MeasuredApp() {
  useLayoutEffect(() => {
    performance.mark('app-commit');
    function check() {
      const svgs = [...document.querySelectorAll('svg')];
      if (svgs.length && svgs.every(svg => { const box = svg.getBBox(); return box.width > 0 && box.height > 0; })) {
        requestAnimationFrame(() => performance.mark('geometry-ready'));
      } else requestAnimationFrame(check);
    }
    requestAnimationFrame(check);
  }, []);
  return ${render};
}
createRoot(document.getElementById('root')!).render(<MeasuredApp />);\n`);
    await writeFile(path.join(directory, `${route}.html`), `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>Icon benchmark</title>${monitor}</head><body><div id="root"></div><script type="module" src="./route-${route}.tsx"></script></body></html>`);
  }
  await build({
    configFile: false, root: directory, base: `/${id}/`, logLevel: "error",
    esbuild: { jsx: "automatic" },
    build: { manifest: true, sourcemap: false, assetsInlineLimit: 0, rollupOptions: { input: Object.fromEntries(Object.keys(routes).map((route) => [route, path.join(directory, `${route}.html`)])) } },
  });
  const dist = path.join(directory, "dist");
  const manifest = JSON.parse(await readFile(path.join(dist, ".vite/manifest.json"), "utf8"));
  const files = {};
  for (const entry of Object.values(manifest)) {
    for (const file of [entry.file, ...(entry.css ?? [])]) files[file] = bytes(await readFile(path.join(dist, file)));
  }
  for (const route of Object.keys(routes)) files[`${route}.html`] = bytes(await readFile(path.join(dist, `${route}.html`)));
  if (spriteIds) files["icons/sprite.svg"] = bytes(await readFile(path.join(dist, "icons/sprite.svg")));
  const routeFiles = {};
  for (const route of Object.keys(routes)) {
    const needed = new Set([`${route}.html`]);
    function visit(key) {
      const entry = manifest[key];
      needed.add(entry.file);
      for (const file of entry.css ?? []) needed.add(file);
      for (const dependency of entry.imports ?? []) visit(dependency);
    }
    visit(`${route}.html`);
    if (spriteIds) needed.add("icons/sprite.svg");
    routeFiles[route] = [...needed];
  }
  const metrics = (paths) => Object.fromEntries(["raw", "gzip", "brotli"].map((encoding) => [encoding, {
    js: sum(paths.filter((file) => file.endsWith(".js")).map((file) => files[file][encoding])),
    total: sum(paths.map((file) => files[file][encoding])),
  }]));
  const journeyFiles = [...new Set(Object.values(routeFiles).flat())];
  const result = { id, scenario, strategy, spriteCount: spriteIds?.length ?? 0, instances: scenario === "demo" ? 18 : 400, files, routeFiles, routeA: metrics(routeFiles.a), journey: metrics(journeyFiles) };
  return { ...result, dist };
}

const fixtures = [];
for (const spec of [
  ["demo", "inline", null], ["demo", "sprite", demoIds],
  ["enterprise", "inline", null], ["enterprise", "sprite-scoped", sharedIds], ["enterprise", "sprite-catalog", selected],
]) {
  const fixture = await createFixture(...spec);
  fixtures.push(fixture);
  console.log(`${fixture.id}: JS gzip ${fixture.routeA.gzip.js} B; total gzip ${fixture.routeA.gzip.total} B`);
}

const samples = [];
if (args.includes("--browser")) {
  const moduleName = process.env.PLAYWRIGHT_MODULE ?? "playwright";
  const { chromium } = await import(path.isAbsolute(moduleName) ? pathToFileURL(moduleName).href : moduleName);
  const cache = new Map();
  for (const fixture of fixtures) {
    for (const [file, sizes] of Object.entries(fixture.files)) {
      const raw = await readFile(path.join(fixture.dist, file));
      const compressed = gzipSync(raw, { level: 9 });
      assert.equal(compressed.length, sizes.gzip);
      cache.set(`/${fixture.id}/${file}`, { compressed, type: file.endsWith(".html") ? "text/html" : file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "image/svg+xml", html: file.endsWith(".html") });
    }
  }
  const server = createServer((request, response) => {
    const resource = cache.get(request.url?.split("?")[0]);
    if (!resource) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { "Content-Type": resource.type, "Content-Encoding": "gzip", "Content-Length": resource.compressed.length, "Cache-Control": resource.html ? "no-store" : "public,max-age=31536000,immutable", Vary: "Accept-Encoding" });
    response.end(resource.compressed);
  });
  const browser = await chromium.launch({ headless: true });
  metadata.browser = browser.version();
  const packagePath = path.isAbsolute(moduleName) ? path.join(path.dirname(moduleName), "package.json") : createRequire(import.meta.url).resolve("playwright/package.json");
  metadata.playwright = JSON.parse(await readFile(packagePath, "utf8")).version;
  metadata.transport = "HTTP/1.1, localhost, same-origin, all bodies gzip";
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    // Round-robin, reversed on alternate rounds. Each fixture journey has its own fresh context.
    for (let round = 0; round < runs; round++) {
      for (const fixture of round % 2 ? [...fixtures].reverse() : fixtures) {
        const context = await browser.newContext({ viewport: metadata.viewport, serviceWorkers: "block" });
        const page = await context.newPage();
        const cdp = await context.newCDPSession(page);
        await cdp.send("Network.enable");
        await cdp.send("Network.setCacheDisabled", { cacheDisabled: false });
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: metadata.network.cpuSlowdown });
        const rule = { urlPattern: "", latency: metadata.network.latencyMs, downloadThroughput: metadata.network.downloadBytesPerSecond, uploadThroughput: metadata.network.uploadBytesPerSecond };
        await cdp.send("Network.emulateNetworkConditionsByRule", { offline: false, matchedNetworkConditions: [rule] });
        await cdp.send("Network.overrideNetworkState", { offline: false, latency: rule.latency, downloadThroughput: rule.downloadThroughput, uploadThroughput: rule.uploadThroughput, connectionType: "cellular4g" });
        for (const [state, route] of [["cold", "a"], ["repeat", "a"], ...(fixture.scenario === "enterprise" ? [["next-route", "b"]] : [])]) {
          const errors = [];
          const headers = [];
          const onError = (error) => errors.push(error.message);
          const onResponse = (response) => { if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`); headers.push({ url: new URL(response.url()).pathname, encoding: response.headers()["content-encoding"] }); };
          page.on("pageerror", onError);
          page.on("response", onResponse);
          await page.goto(`${origin}/${fixture.id}/${route}.html`, { waitUntil: "load" });
          await page.waitForFunction(() => performance.getEntriesByName("geometry-ready").length > 0);
          await page.waitForTimeout(250);
          const measurement = await page.evaluate(() => {
            const nav = performance.getEntriesByType("navigation")[0];
            const resources = performance.getEntriesByType("resource").filter((entry) => !entry.name.endsWith("favicon.ico"));
            const entries = [nav, ...resources].map((entry) => ({ url: new URL(entry.name).pathname, transferSize: entry.transferSize, encodedBodySize: entry.encodedBodySize, decodedBodySize: entry.decodedBodySize, responseEnd: entry.responseEnd, protocol: entry.nextHopProtocol }));
            return { fcp: performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null, lcp: window.bench.lcp, lcpElement: window.bench.lcpElement, commit: performance.getEntriesByName("app-commit")[0].startTime, geometryReady: performance.getEntriesByName("geometry-ready")[0].startTime, load: nav.loadEventEnd, exposedElements: document.querySelectorAll("*").length, icons: document.querySelectorAll("svg").length, entries, clientErrors: window.bench.errors };
          });
          assert.equal(errors.length, 0, JSON.stringify(errors));
          assert.equal(measurement.clientErrors.length, 0, JSON.stringify(measurement.clientErrors));
          assert.equal(measurement.icons, fixture.instances);
          assert(measurement.fcp !== null && measurement.lcp !== null, "Missing paint metrics");
          assert(headers.every((header) => header.encoding === "gzip"), "An uncompressed response was served");
          const expected = new Set(fixture.routeFiles[route].map((file) => `/${fixture.id}/${file}`));
          assert.deepEqual(new Set(measurement.entries.map((entry) => entry.url)), expected, "Browser resources differ from manifest accounting");
          const networkEntries = measurement.entries.filter((entry) => entry.transferSize > 0);
          const bodyBytes = sum(networkEntries.map((entry) => entry.encodedBodySize));
          if (state === "cold") assert.equal(bodyBytes, fixture.routeA.gzip.total, "Cold body bytes differ from build accounting");
          if (state === "repeat") assert(networkEntries.every((entry) => entry.url.endsWith(".html")), "Warm assets were not reused");
          const sample = { round: round + 1, fixture: fixture.id, state, ...measurement, bodyBytes, transferSize: sum(measurement.entries.map((entry) => entry.transferSize)), networkRequests: networkEntries.length };
          samples.push(sample);
          if (round === 0 && state === "cold") await page.screenshot({ path: path.join(output, `${fixture.id}.png`) });
          page.off("pageerror", onError);
          page.off("response", onResponse);
        }
        await context.close();
      }
      await writeFile(path.join(output, "samples.json"), JSON.stringify(samples, null, 2) + "\n");
      console.log(`Browser round ${round + 1}/${runs} complete`);
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const q = (fraction) => sorted[Math.floor((sorted.length - 1) * fraction)];
  return { median: q(0.5), p25: q(0.25), p75: q(0.75), min: sorted[0], max: sorted.at(-1) };
}
const timings = [];
for (const fixture of fixtures) for (const state of ["cold", "repeat", "next-route"]) {
  const subset = samples.filter((sample) => sample.fixture === fixture.id && sample.state === state);
  if (!subset.length) continue;
  timings.push({ fixture: fixture.id, state, n: subset.length, ...Object.fromEntries(["fcp", "lcp", "commit", "geometryReady", "load", "bodyBytes", "transferSize", "networkRequests", "exposedElements"].map((metric) => [metric, distribution(subset.map((sample) => sample[metric]))])) });
}
await writeFile(path.join(output, "results.json"), JSON.stringify({ metadata, builds: fixtures.map(({ dist, ...fixture }) => fixture), timings, samples }, null, 2) + "\n");
console.log(`Saved ${output}/results.json`);
