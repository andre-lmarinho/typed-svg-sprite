// Smallest check behind the non-trivial bit of build-icons.mjs.
// Run: npm run test:icons   (node --test)
import { test } from "node:test";
import assert from "node:assert/strict";
import { innerOfSvg } from "./build-icons.mjs";

test("innerOfSvg: drops the <svg> wrapper, keeps inner markup", () => {
  const svg = `<svg xmlns="..." viewBox="0 0 24 24"><path d="M1 1"/></svg>`;
  assert.equal(innerOfSvg(svg), `<path d="M1 1"/>`);
});
