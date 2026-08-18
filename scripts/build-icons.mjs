/**
 * build-icons.mjs — turns the icon list into a single typed sprite.
 *
 * Input:
 *   src/icon/icon-list.ts  — the ids to pull from the `lucide-static` package.
 *
 * Outputs:
 *   public/icons/sprite.svg   — <symbol> per icon, served & cached once.
 *   src/icon/icon-names.ts    — `iconNames` (array) + `IconName` (type).
 *
 * No build-time dependencies beyond `lucide-static`: pure Node. icon-list.ts is
 * parsed as text, so it never has to be compiled or executed.
 *
 * Run with: npm run build:icons
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, "..");

const defaultPaths = {
  listSourcePath: path.join(root, "src/icon/icon-list.ts"),
  spriteOutPath: path.join(root, "public/icons/sprite.svg"),
  typesOutPath: path.join(root, "src/icon/icon-names.ts"),
};

const ICON_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Remove JavaScript comments without treating comment markers inside strings as syntax. */
function stripComments(source) {
  let result = "";
  let quote = null;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const nextCharacter = source[index + 1];

    if (quote) {
      result += character;
      if (character === "\\" && nextCharacter !== undefined) {
        result += nextCharacter;
        index += 1;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      result += character;
      continue;
    }

    if (character === "/" && nextCharacter === "/") {
      while (index < source.length && source[index] !== "\n") {
        index += 1;
      }
      result += "\n";
      continue;
    }

    if (character === "/" && nextCharacter === "*") {
      index += 2;
      while (
        index < source.length &&
        !(source[index] === "*" && source[index + 1] === "/")
      ) {
        if (source[index] === "\n") result += "\n";
        index += 1;
      }
      index += 1;
      continue;
    }

    result += character;
  }

  return result;
}

/** Strip the outer <svg ...> wrapper, returning just the inner markup. */
export function innerOfSvg(svg) {
  const openingTag = svg.match(/<svg\b[^>]*>/i);
  const closingTag = svg.match(/<\/svg>\s*$/i);

  if (!openingTag || openingTag.index === undefined || !closingTag) {
    throw new Error("Invalid SVG: expected a complete <svg> wrapper.");
  }

  const inner = svg.slice(openingTag.index + openingTag[0].length, closingTag.index).trim();
  if (inner.length === 0) {
    throw new Error("Invalid SVG: the <svg> wrapper is empty.");
  }

  return inner;
}

/** Parse and validate the `lucideIcons` string array from its TypeScript source. */
export function parseIconIds(source) {
  const uncommentedSource = stripComments(source);
  const match = uncommentedSource.match(
    /^\s*export const lucideIcons\s*=\s*\[([\s\S]*?)\]/m,
  );
  if (!match) {
    throw new Error('Invalid icon list: expected `export const lucideIcons = [...]`.');
  }

  const entries = match[1]
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (entries.length === 0) {
    throw new Error("Invalid icon list: add at least one icon id.");
  }

  const ids = entries.map((entry) => {
    const stringLiteral = entry.match(/^(["'])([^"'\\]+)\1$/);
    if (!stringLiteral) {
      throw new Error(`Invalid icon list entry: ${entry}`);
    }

    const id = stringLiteral[2];
    if (!ICON_ID_PATTERN.test(id)) {
      throw new Error(`Invalid icon id "${id}": use lowercase kebab-case.`);
    }
    return id;
  });

  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length > 0) {
    throw new Error(`Duplicate icon ids: ${[...new Set(duplicates)].join(", ")}`);
  }

  return ids;
}

/** Read and validate the icon ids without executing the TypeScript file. */
export async function readIconIds(listSourcePath = defaultPaths.listSourcePath) {
  return parseIconIds(await readFile(listSourcePath, "utf8"));
}

/** Resolve the raw SVG directory supplied by `lucide-static`. */
export function resolveLucideIconsDirectory() {
  const require = createRequire(import.meta.url);
  return path.join(path.dirname(require.resolve("lucide-static/package.json")), "icons");
}

/** Read every selected SVG and sort the result for stable generated files. */
export async function readIcons(ids, iconsDirectory = resolveLucideIconsDirectory()) {
  const results = await Promise.all(
    ids.map(async (id) => {
      const iconPath = path.join(iconsDirectory, `${id}.svg`);
      try {
        return { id, inner: innerOfSvg(await readFile(iconPath, "utf8")) };
      } catch (error) {
        return { id, error };
      }
    }),
  );

  const failures = results.filter((result) => "error" in result);
  if (failures.length > 0) {
    const details = failures
      .map(({ id, error }) => {
        const reason = error instanceof Error ? error.message : String(error);
        return `${id} (${reason})`;
      })
      .join(", ");
    throw new Error(`Could not read icons: ${details}`);
  }

  return results
    .map(({ id, inner }) => ({ id, inner }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function renderSprite(icons) {
  const symbols = icons.map(({ id, inner }) =>
    [
      `  <symbol id="${id}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">`,
      `    ${inner.replace(/\n\s*/g, "\n    ")}`,
      "  </symbol>",
    ].join("\n"),
  );

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!-- Generated by npm run build:icons — do not edit by hand. -->`,
    `<!-- Icon licenses: see THIRD_PARTY_NOTICES.txt in this distribution. -->`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="display:none">`,
    "  <defs>",
    ...symbols,
    "  </defs>",
    "</svg>",
    "",
  ].join("\n");
}

export function renderTypes(icons) {
  const all = icons.map(({ id }) => `  "${id}",`).join("\n");
  return [
    "// Generated by npm run build:icons — do not edit by hand.",
    "// The single, canonical list of every icon in the sprite.",
    "",
    "export const iconNames = [",
    all,
    "] as const;",
    "",
    "export type IconName = (typeof iconNames)[number];",
    "",
  ].join("\n");
}

/** Build both generated files. Paths are injectable so the whole pipeline is testable. */
export async function buildIcons({
  listSourcePath = defaultPaths.listSourcePath,
  iconsDirectory = resolveLucideIconsDirectory(),
  spriteOutPath = defaultPaths.spriteOutPath,
  typesOutPath = defaultPaths.typesOutPath,
} = {}) {
  const ids = await readIconIds(listSourcePath);
  const icons = await readIcons(ids, iconsDirectory);

  await Promise.all([
    mkdir(path.dirname(spriteOutPath), { recursive: true }),
    mkdir(path.dirname(typesOutPath), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(spriteOutPath, renderSprite(icons), "utf8"),
    writeFile(typesOutPath, renderTypes(icons), "utf8"),
  ]);

  return icons;
}

async function main() {
  const icons = await buildIcons();
  console.log(
    `Generated ${icons.length} icons → public/icons/sprite.svg + src/icon/icon-names.ts`,
  );
}

const isDirectRun = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isDirectRun) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
