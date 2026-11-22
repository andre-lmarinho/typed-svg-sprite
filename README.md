# typed-svg-sprite

A small **reference implementation** of a type-safe SVG sprite icon system for
React. It shows how `<Icon name="calendar" />` can use a generated TypeScript
union and one shared `sprite.svg`.

This repository is a runnable example, **not a published, installable npm
package**. Its manifest sets `"private": true`, and the public npm registry
returns 404 for this package name. Use Node 24 and run the commands below from a
local checkout.

**[Open the live showcase](https://andre-lmarinho.github.io/typed-svg-sprite/)** to
browse the icon gallery and try its size and color controls.

## Quick start

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite (usually `http://localhost:5173`). To build
and test the reference implementation, run `npm run build` and `npm test`.
Edit [`src/icon/icon-list.ts`](src/icon/icon-list.ts) and run
`npm run build:icons` to change the generated sprite and icon types.

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

The generated `IconName` union catches typos such as
`<Icon name="calender" />`. Editors also suggest each available icon name.

---

## Performance measurements

A [reproducible benchmark](docs/performance-analysis.md) compares this demo with
inline React components. It also tests a synthetic enterprise workload under cold
and warm cache conditions. Each page uses 40 icons and a shared 60-icon sprite.

The sprite reduced gzip JavaScript by **6.45%** and two-page total bytes by **1.87%**.
First-visit bytes rose by **1.73%**. Icons rendered later, even though text painted
earlier. These results do not show a general loading-time improvement.

The report links raw data and lists the environment, limits, and reproduction steps.
These are lab results, not results from enterprise production.

A [second benchmark of the Cal.diy source components](docs/cal-diy-performance-analysis.md)
uses its 156-symbol sprite and `react-inlinesvg` loader in isolated fixtures.
Injection reduced gzip JavaScript by **1.38%** in the extracted showcase.
Cold payload rose by **11.29%** against inline components. The report compares
native external references. It records the source commit, dependency lock, and
180 measured navigations. It does not measure Cal.diy’s full Next.js routes.

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
    - `public/icons/sprite.svg` — a `<symbol id="…">` for each icon.
    - `src/icon/icon-names.ts` — `iconNames` (runtime array) + `IconName` (type,
      derived from `as const`). The build script generates this canonical list.
      Do not edit it by hand.
2. **`src/icon/Icon.tsx`** renders a small `<svg><use href="/icons/sprite.svg#name"/></svg>`.
   All icons reference the same sprite resource. Reuse across visits depends on
   HTTP cache headers and URL versioning.
3. **`src/icon/icon-list.ts`** lists the ids. The build script reads it as text.
   It does not compile or execute the file.

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

Install `lucide-static` if needed. Then add icon ids to the `lucideIcons` array
in [`src/icon/icon-list.ts`](src/icon/icon-list.ts):

```bash
npm i -D lucide-static   # already a devDependency in this repo
```

```ts
export const lucideIcons = ["search", "heart", "star", "download"] as const;
```

Find icon names in the [Lucide icon catalog](https://lucide.dev/icons).
Run `npm run build:icons` to add them to the sprite.
The build checks for malformed lists, duplicate ids, and missing Lucide icons.
It writes neither output file until every check passes.

> Want a different library? The adapter is a few lines in
> [`scripts/build-icons.mjs`](scripts/build-icons.mjs) (`readIcons`).
> Point it at any package that exposes raw `.svg` files.

---

## Accessibility

Icons are **decorative by default** (`aria-hidden`, `role="presentation"`).
Use this default when text conveys the meaning, such as an icon next to a label.
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

Run `npm run build:icons` to generate these files. Do not edit them by hand.

---

## Stack

The demo uses **Vite + React + TypeScript**. The icon pattern can run with other
frameworks. `Icon.tsx` is one component, and the build script uses plain Node.
To port it, serve `sprite.svg` as a static asset and keep the `<use href>` path
in sync.

## Credits & license

- **Inspiration:** the typed SVG sprite approach used by
  [calcom/cal.diy](https://github.com/calcom/cal.diy).
- **Icons:** [Lucide](https://lucide.dev) (ISC), including icons derived from
  Feather (MIT). See
  [`public/THIRD_PARTY_NOTICES.txt`](public/THIRD_PARTY_NOTICES.txt).
- **Source code:** [MIT](LICENSE) © 2026 André Marinho.
