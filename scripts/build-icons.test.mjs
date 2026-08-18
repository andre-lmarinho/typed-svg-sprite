import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildIcons,
  innerOfSvg,
  parseIconIds,
  readIconIds,
  readIcons,
  renderSprite,
  renderTypes,
  resolveLucideIconsDirectory,
} from "./build-icons.mjs";

const temporaryDirectories = [];

async function makeFixture({
  list = 'export const lucideIcons = ["zebra", "alpha"] as const;\n',
  icons = {
    alpha: '<svg viewBox="0 0 24 24"><path d="alpha" /></svg>',
    zebra: '<svg viewBox="0 0 24 24"><path d="zebra" /></svg>',
  },
} = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "typed-svg-sprite-"));
  temporaryDirectories.push(directory);

  const iconsDirectory = path.join(directory, "icons");
  const listSourcePath = path.join(directory, "src/icon/icon-list.ts");
  const spriteOutPath = path.join(directory, "public/icons/sprite.svg");
  const typesOutPath = path.join(directory, "src/icon/icon-names.ts");

  await mkdir(iconsDirectory, { recursive: true });
  await mkdir(path.dirname(listSourcePath), { recursive: true });
  await writeFile(listSourcePath, list, "utf8");
  await Promise.all(
    Object.entries(icons).map(([id, svg]) =>
      writeFile(path.join(iconsDirectory, `${id}.svg`), svg, "utf8"),
    ),
  );

  return { iconsDirectory, listSourcePath, spriteOutPath, typesOutPath };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("innerOfSvg", () => {
  it("removes a multiline SVG wrapper while preserving its child markup", () => {
    const svg = `<!-- license -->
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
      >
        <path d="M1 1" />
        <circle cx="2" cy="2" r="1" />
      </svg>
    `;

    expect(innerOfSvg(svg)).toBe(
      '<path d="M1 1" />\n        <circle cx="2" cy="2" r="1" />',
    );
  });

  it.each([
    ["a closing tag", "<svg><path /></g>"],
    ["an opening tag", "<path /></svg>"],
    ["the wrapper", "<path />"],
  ])("rejects SVG input without %s", (_case, svg) => {
    expect(() => innerOfSvg(svg)).toThrow("expected a complete <svg> wrapper");
  });

  it("rejects an empty SVG", () => {
    expect(() => innerOfSvg("<svg> \n </svg>")).toThrow("wrapper is empty");
  });
});

describe("parseIconIds", () => {
  it("parses quoted ids, comments, whitespace, and a trailing comma", () => {
    const source = `
      export const lucideIcons = [
        "calendar", // used in the hero
        // "alarm-clock",
        /* actions */ 'check-circle',
      ] as const;
    `;

    expect(parseIconIds(source)).toEqual(["calendar", "check-circle"]);
  });

  it("ignores a commented-out declaration before the real list", () => {
    const source = `
      // export const lucideIcons = ["old-icon"];
      /* export const lucideIcons = ["also-old"]; */
      export const lucideIcons = ["calendar"];
    `;

    expect(parseIconIds(source)).toEqual(["calendar"]);
  });

  it("ignores closing brackets inside comments without truncating the list", () => {
    const source = `
      export const lucideIcons = [
        "calendar",
        // ] as const;
        "search",
      ] as const;
    `;

    expect(parseIconIds(source)).toEqual(["calendar", "search"]);
  });

  it("does not remove comment markers inside string literals", () => {
    expect(() =>
      parseIconIds('export const lucideIcons = ["calendar/*comment*/"];'),
    ).toThrow("use lowercase kebab-case");
  });

  it("rejects a missing declaration", () => {
    expect(() => parseIconIds('export const icons = ["calendar"];')).toThrow(
      "expected `export const lucideIcons",
    );
  });

  it("rejects an empty list", () => {
    expect(() => parseIconIds("export const lucideIcons = [];")).toThrow(
      "add at least one icon id",
    );
  });

  it.each([
    ["expressions", '"calendar", getIconName()'],
    ["template literals", "`calendar`"],
    ["escaped literals", '"calendar\\n"'],
  ])("rejects non-plain string entries: %s", (_case, entry) => {
    expect(() => parseIconIds(`export const lucideIcons = [${entry}];`)).toThrow(
      "Invalid icon list entry",
    );
  });

  it.each(["Calendar", "calendar_icon", "../calendar", "calendar.svg", "-calendar"])(
    "rejects an unsafe or non-kebab-case id: %s",
    (id) => {
      expect(() => parseIconIds(`export const lucideIcons = ["${id}"];`)).toThrow(
        "use lowercase kebab-case",
      );
    },
  );

  it("reports every duplicated id once", () => {
    expect(() =>
      parseIconIds(
        'export const lucideIcons = ["calendar", "calendar", "search", "search"];',
      ),
    ).toThrow("Duplicate icon ids: calendar, search");
  });
});

describe("reading icons", () => {
  it("reads the list from disk", async () => {
    const fixture = await makeFixture({
      list: 'export const lucideIcons = ["alpha", "zebra"] as const;',
    });

    await expect(readIconIds(fixture.listSourcePath)).resolves.toEqual(["alpha", "zebra"]);
  });

  it("resolves the installed lucide-static icon directory", async () => {
    const iconsDirectory = resolveLucideIconsDirectory();

    await expect(access(path.join(iconsDirectory, "calendar.svg"))).resolves.toBeUndefined();
  });

  it("reads icons in parallel and returns them in stable lexical order", async () => {
    const fixture = await makeFixture({
      icons: {
        "icon-2": '<svg><path d="two" /></svg>',
        alpha: '<svg><path d="alpha" /></svg>',
        "icon-10": '<svg><path d="ten" /></svg>',
      },
    });

    await expect(
      readIcons(["icon-2", "alpha", "icon-10"], fixture.iconsDirectory),
    ).resolves.toEqual([
      { id: "alpha", inner: '<path d="alpha" />' },
      { id: "icon-10", inner: '<path d="ten" />' },
      { id: "icon-2", inner: '<path d="two" />' },
    ]);
  });

  it("reports all missing or invalid icon files together", async () => {
    const fixture = await makeFixture({
      icons: {
        broken: "<svg></svg>",
        valid: '<svg><path d="valid" /></svg>',
      },
    });

    await expect(
      readIcons(["missing", "valid", "broken"], fixture.iconsDirectory),
    ).rejects.toThrow(/Could not read icons: missing \(.+\), broken \(.+wrapper is empty/);
  });
});

describe("generated output", () => {
  const icons = [
    { id: "alpha", inner: '<path d="alpha" />' },
    { id: "zebra", inner: '<path d="zebra" />\n<circle r="2" />' },
  ];

  it("renders a complete sprite with shared presentation attributes and license pointer", () => {
    const sprite = renderSprite(icons);

    expect(sprite).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    expect(sprite).toContain("Icon licenses: see THIRD_PARTY_NOTICES.txt");
    expect(sprite).toContain('<symbol id="alpha" viewBox="0 0 24 24" fill="none"');
    expect(sprite).toContain('stroke="currentColor" stroke-width="1.5"');
    expect(sprite).toContain('    <circle r="2" />');
    expect(sprite).toMatch(/<defs>[\s\S]*id="alpha"[\s\S]*id="zebra"[\s\S]*<\/defs>/);
    expect(sprite.endsWith("\n")).toBe(true);
  });

  it("renders the runtime list and derives the union type from it", () => {
    expect(renderTypes(icons)).toBe(`// Generated by npm run build:icons — do not edit by hand.
// The single, canonical list of every icon in the sprite.

export const iconNames = [
  "alpha",
  "zebra",
] as const;

export type IconName = (typeof iconNames)[number];
`);
  });
});

describe("buildIcons", () => {
  it("creates both output directories and returns the generated icons", async () => {
    const fixture = await makeFixture();

    await expect(buildIcons(fixture)).resolves.toEqual([
      { id: "alpha", inner: '<path d="alpha" />' },
      { id: "zebra", inner: '<path d="zebra" />' },
    ]);
    await expect(readFile(fixture.spriteOutPath, "utf8")).resolves.toContain(
      '<symbol id="alpha"',
    );
    await expect(readFile(fixture.typesOutPath, "utf8")).resolves.toContain('"zebra",');
  });

  it("does not write either artifact when any selected icon is missing", async () => {
    const fixture = await makeFixture({
      list: 'export const lucideIcons = ["alpha", "missing"] as const;',
    });

    await expect(buildIcons(fixture)).rejects.toThrow(/Could not read icons: missing \(/);
    await expect(access(fixture.spriteOutPath)).rejects.toThrow();
    await expect(access(fixture.typesOutPath)).rejects.toThrow();
  });

  it("leaves existing artifacts untouched when validation fails", async () => {
    const fixture = await makeFixture({
      list: 'export const lucideIcons = ["alpha", "missing"] as const;',
    });
    await mkdir(path.dirname(fixture.spriteOutPath), { recursive: true });
    await mkdir(path.dirname(fixture.typesOutPath), { recursive: true });
    await writeFile(fixture.spriteOutPath, "existing sprite", "utf8");
    await writeFile(fixture.typesOutPath, "existing types", "utf8");

    await expect(buildIcons(fixture)).rejects.toThrow(/Could not read icons: missing \(/);
    await expect(readFile(fixture.spriteOutPath, "utf8")).resolves.toBe("existing sprite");
    await expect(readFile(fixture.typesOutPath, "utf8")).resolves.toBe("existing types");
  });

  it("does not write either artifact when the list is invalid", async () => {
    const fixture = await makeFixture({ list: "export const lucideIcons = [];" });

    await expect(buildIcons(fixture)).rejects.toThrow("add at least one icon id");
    await expect(access(fixture.spriteOutPath)).rejects.toThrow();
    await expect(access(fixture.typesOutPath)).rejects.toThrow();
  });
});

describe("checked-in artifacts", () => {
  it("keeps the source list, generated names, and sprite symbols synchronized", async () => {
    const repositoryRoot = path.resolve(import.meta.dirname, "..");
    const [source, generatedTypes, sprite] = await Promise.all([
      readFile(path.join(repositoryRoot, "src/icon/icon-list.ts"), "utf8"),
      readFile(path.join(repositoryRoot, "src/icon/icon-names.ts"), "utf8"),
      readFile(path.join(repositoryRoot, "public/icons/sprite.svg"), "utf8"),
    ]);

    const sourceIds = parseIconIds(source).sort();
    const generatedIds = [...generatedTypes.matchAll(/^\s+"([^"]+)",$/gm)].map(
      ([, id]) => id,
    );
    const symbolIds = [...sprite.matchAll(/<symbol id="([^"]+)"/g)].map(([, id]) => id);

    expect(generatedIds).toEqual(sourceIds);
    expect(symbolIds).toEqual(sourceIds);
    expect(new Set(symbolIds).size).toBe(symbolIds.length);
  });

  it("matches a fresh generation from the real source list and Lucide package", async () => {
    const repositoryRoot = path.resolve(import.meta.dirname, "..");
    const directory = await mkdtemp(path.join(os.tmpdir(), "typed-svg-sprite-real-"));
    temporaryDirectories.push(directory);
    const spriteOutPath = path.join(directory, "public/icons/sprite.svg");
    const typesOutPath = path.join(directory, "src/icon/icon-names.ts");

    await buildIcons({
      listSourcePath: path.join(repositoryRoot, "src/icon/icon-list.ts"),
      iconsDirectory: resolveLucideIconsDirectory(),
      spriteOutPath,
      typesOutPath,
    });

    const [freshSprite, freshTypes, checkedInSprite, checkedInTypes] = await Promise.all([
      readFile(spriteOutPath, "utf8"),
      readFile(typesOutPath, "utf8"),
      readFile(path.join(repositoryRoot, "public/icons/sprite.svg"), "utf8"),
      readFile(path.join(repositoryRoot, "src/icon/icon-names.ts"), "utf8"),
    ]);

    expect(freshSprite).toBe(checkedInSprite);
    expect(freshTypes).toBe(checkedInTypes);
  });

  it("keeps the distributed icon notice identical to the installed Lucide license", async () => {
    const repositoryRoot = path.resolve(import.meta.dirname, "..");
    const lucideRoot = path.resolve(resolveLucideIconsDirectory(), "..");
    const [distributedNotice, installedLicense] = await Promise.all([
      readFile(path.join(repositoryRoot, "public/THIRD_PARTY_NOTICES.txt"), "utf8"),
      readFile(path.join(lucideRoot, "LICENSE"), "utf8"),
    ]);

    expect(distributedNotice).toBe(installedLicense);
  });
});
