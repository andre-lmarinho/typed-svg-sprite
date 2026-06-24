# typed-svg-sprite

A tiny, **type-safe SVG sprite** icon system for React.

You write `<Icon name="calendar" />` — with full TypeScript autocomplete on
`name` — and the whole icon set ships as **one cached `sprite.svg`** instead of
hundreds of inlined SVGs or per-icon JS modules.

You list the icons you want from [Lucide](https://lucide.dev) in
[`src/icon/icon-list.ts`](src/icon/icon-list.ts), run the build, and they're
bundled into the sprite — consumed as `<Icon name="…" />`.

> ### Credit
> The idea and pattern come from **[calcom/cal.diy](https://github.com/calcom/cal.diy)**.
> This repository is **not the original author's work** — it's a minimal,
> standalone showcase of the technique. All credit for the approach goes to the
> Cal.com team.

---

## Why this exists

| Common approach | Cost |
| --- | --- |
| Import each icon as a React component (`import { Calendar } from "lucide-react"`) | Ships JS for every icon; bundles grow with each one you use. |
| Inline `<svg>` everywhere | Markup duplication; the same paths re-shipped on every page. |
| **This sprite approach** | One `sprite.svg` is downloaded **once and cached**. Each `<Icon>` is just a `<use href="…#id">` reference — no per-icon JS, no extra requests. |

On top of that you get a **generated `IconName` union type**, so a typo like
`<Icon name="calender" />` is a compile error, and your editor autocompletes
every available icon.

---

## How it works

Three small pieces and one build step:

```
  src/icon/icon-list.ts  ──►┌─────────────────────────────┐──► public/icons/sprite.svg  (one cached file)
  (the lucide ids)          │   scripts/build-icons.mjs   │
                            │   (pure Node)               │──► src/icon/icon-names.ts
                            └─────────────────────────────┘      iconNames + IconName
                                                                 (one canonical list)
                                                                        │
                                                                        ▼
                                                  <Icon name="…" />  ← type-checked
                                                  renders <use href="/icons/sprite.svg#…">
```

1. **`scripts/build-icons.mjs`** reads the id list, pulls each icon's SVG from
   the `lucide-static` package, then writes:
   - `public/icons/sprite.svg` — a `<symbol id="…">` per icon.
   - `src/icon/icon-names.ts` — `iconNames` (runtime array) + `IconName` (type,
     derived via `as const`). This is the **single canonical list of names**;
     it is generated, never hand-edited.
2. **`src/icon/Icon.tsx`** renders a small `<svg><use href="/icons/sprite.svg#name"/></svg>`.
   The browser fetches the sprite once; every icon after that is a reference.
3. **`src/icon/icon-list.ts`** lists the ids. It's read as *text* by the build
   script, so it never needs to be compiled or executed.

---

## Quick start

```bash
npm install
npm run build:icons   # generate sprite.svg + icon-names.ts
npm run dev           # open the showcase at http://localhost:5173
```

`npm run build` runs the icon build, type-checks, and produces a production bundle.

---

## Usage

```tsx
import { Icon } from "./icon";

// Decorative icon (default): aria-hidden, inherits color & follows `size`.
<Icon name="calendar" />

// Sized + colored via currentColor (set `color` or a text-color class).
<Icon name="check-circle" size={18} style={{ color: "green" }} />

// Inside a button — sits inline with the label.
<button>
  <Icon name="settings" size={16} /> Settings
</button>
```

Because every `<symbol>` uses `stroke="currentColor"`, icons **inherit the
surrounding text color** automatically. `size` sets both width and height.

---

## Adding icons

Make sure `lucide-static` is installed, then add the icon ids to the
`lucideIcons` array in [`src/icon/icon-list.ts`](src/icon/icon-list.ts):

```bash
npm i -D lucide-static   # already a devDependency in this repo
```

```ts
export const lucideIcons = ["search", "heart", "star", "download"] as const;
```

Browse ids at [lucide.dev/icons](https://lucide.dev/icons), then run
`npm run build:icons` and they're bundled into the sprite.

> Want a different library? The adapter is a few lines in
> [`scripts/build-icons.mjs`](scripts/build-icons.mjs) (`readIcons`).
> Point it at any package that exposes raw `.svg` files.

---

## Accessibility

Icons are **decorative by default** (`aria-hidden`, `role="presentation"`), which
is correct when text already conveys the meaning (e.g. an icon next to a label).
When an icon stands alone, give it a label so screen readers announce it:

```tsx
<Icon name="search" aria-label="Search" />
```

---

## Project structure

```
.
├── scripts/
│   ├── build-icons.mjs           # generator: icon-list.ts → sprite.svg + icon-names.ts
│   └── build-icons.test.mjs      # self-check for the generator
├── public/
│   └── icons/
│       └── sprite.svg            # GENERATED — served & cached once
└── src/
    ├── App.tsx                   # the showcase gallery
    └── icon/
        ├── Icon.tsx              # <use href> runtime component
        ├── icon-names.ts         # GENERATED — the one canonical iconNames + IconName
        ├── icon-list.ts          # the lucide ids to bundle
        └── index.ts              # public exports
```

Files marked **GENERATED** are produced by `npm run build:icons`; don't edit
them by hand.

---

## Stack

Intentionally minimal, just enough to run the demo: **Vite + React + TypeScript**.
The icon pattern itself is framework-light — `Icon.tsx` is one small component and
the build script is plain Node, so it ports easily to Next.js, Remix, etc. (serve
`sprite.svg` as a static asset and keep the `<use href>` path in sync).

## Credits & license

- **Pattern:** [calcom/cal.diy](https://github.com/calcom/cal.diy) — original idea and author.
- **Sample icons:** [Lucide](https://lucide.dev) (ISC).

This showcase is provided for educational/demonstration purposes.
