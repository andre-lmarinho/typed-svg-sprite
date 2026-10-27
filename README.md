# typed-svg-sprite

A tiny, **type-safe SVG sprite** icon system for React.

You write `<Icon name="calendar" />` — with full TypeScript autocomplete on
`name` — and the selected icon set ships as **one cacheable `sprite.svg`** instead of
hundreds of inlined SVGs or per-icon JS modules.

You list the icons you want from [Lucide](https://lucide.dev) in
[`src/icon/icon-list.ts`](src/icon/icon-list.ts), run the build, and they're
bundled into the sprite — consumed as `<Icon name="…" />`.

> ### Inspiration
> This is an independent reference implementation inspired by the typed SVG
> sprite approach used by **[calcom/cal.diy](https://github.com/calcom/cal.diy)**.
> The code in this repository was written independently; credit for the
> inspiration goes to the Cal.com team.

---

## Why this exists

| Common approach | Cost |
| --- | --- |
| Import each icon as a React component (`import { Calendar } from "lucide-react"`) | Ships JS for the icons retained after tree shaking; shared modules can be cached. |
| Inline `<svg>` in server-rendered HTML | Repeats markup in the document; its transfer cost depends on compression and page caching. |
| **This sprite approach** | A small React wrapper references one shared `sprite.svg`. The first use downloads the selected set; later uses can reuse it when HTTP caching permits. |

On top of that you get a **generated `IconName` union type**, so a typo like
`<Icon name="calender" />` is a compile error, and your editor autocompletes
every available icon.

---

## Performance measurements

A [reproducible benchmark](docs/performance-analysis.md) compares the demo and a
synthetic enterprise workload against inline React components, including cold and
warm cache conditions. With 40 icons per page, a shared 60-icon sprite reduced gzip
JavaScript by **6.45%** and total bytes across two pages by **1.87%**, but increased
first-visit bytes by **1.73%**. Icon geometry resolved later despite earlier text
paint; this is not evidence of a general loading-time improvement.

The report includes raw data, environment details, limitations and reproduction
commands. These are laboratory results, not measurements from enterprise production.

A [second benchmark of the Cal.diy source components](docs/cal-diy-performance-analysis.md)
uses its real 156-symbol sprite and `react-inlinesvg` loader in isolated fixtures.
In the extracted showcase, original injection reduced gzip JS by **1.38%** but
increased cold payload by **11.29%** versus inline components. It also compares
native external references and records the source commit, dependency lock and
180 measured navigations. This does not measure Cal.diy’s complete Next.js routes.

## How it works

Three small pieces and one build step:

```
  src/icon/icon-list.ts  ──►┌─────────────────────────────┐──► public/icons/sprite.svg  (one cacheable file)
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
   All icons reference the same sprite resource. Reuse across visits depends on
   HTTP cache headers and URL versioning.
3. **`src/icon/icon-list.ts`** lists the ids. It's read as *text* by the build
   script, so it never needs to be compiled or executed.

---

## Quick start

```bash
npm install
npm run build:icons   # generate sprite.svg + icon-names.ts
npm test              # run the complete test suite once
npm run dev           # open the showcase at http://localhost:5173
```

`npm run build` runs the icon build, type-checks, and produces a production bundle.
`npm run test:coverage` runs the same suite and enforces the configured coverage
thresholds.

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
The build rejects malformed lists, duplicate ids, and missing Lucide icons
before either generated file is changed.

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
│   ├── THIRD_PARTY_NOTICES.txt   # licenses for the bundled icon artwork
│   └── icons/
│       └── sprite.svg            # GENERATED — shared, cacheable resource
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

- **Inspiration:** the typed SVG sprite approach used by
  [calcom/cal.diy](https://github.com/calcom/cal.diy).
- **Icons:** [Lucide](https://lucide.dev) (ISC), including icons derived from
  Feather (MIT). See
  [`public/THIRD_PARTY_NOTICES.txt`](public/THIRD_PARTY_NOTICES.txt).
- **Source code:** [MIT](LICENSE) © 2026 André Marinho.
