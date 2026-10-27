# Cal.diy source components: isolated benchmark

Measured on 27 October 2026 using the local Cal.diy checkout at application commit
`56da01b4b1664894b784aca636eccab0c56cc141`. This second experiment uses the
**actual checked-in sprite, Icon, IconSprites, classNames and IconGrid** from the
origin repository. It builds isolated client-rendered fixtures with Vite. It does
not measure a running Cal.diy Next.js application or its complete route bundles.

In the extracted full showcase, the original implementation reduced gzip JS by
**1.38%** versus generated inline components, while increasing total
cold payload by **11.29%**. For the 22-icon diagnostic subset,
the original implementation increased JS by **11.03%** and total
payload by **25.26%**. The runtime sprite loader matters to this
comparison; the claim “one sprite means no icon-related JavaScript” does not hold.

## What the origin actually does

The source checkout has no installed dependencies or Next.js build output. It was
read as input and remained clean throughout the experiment. The generator was
inspected; its **versioned output** was measured without regenerating it from a
new Lucide installation.

| Source file | Observed behavior |
| --- | --- |
| `packages/ui/components/icon/Icon.tsx` | Renders `<svg><use href="#name" /></svg>` with `classNames`/`tailwind-merge`. |
| `packages/ui/components/icon/IconSprites.tsx` | Uses `react-inlinesvg` to fetch a versioned sprite and inject its SVG into the document. |
| `apps/web/public/icons/sprite.svg` | 156 symbols: **56,466 raw bytes**, **7,925 gzip bytes**, **6,843 Brotli bytes**. |
| `apps/web/app/layout.tsx` | Mounts `IconSprites` at the root. |
| `apps/web/app/icons/page.tsx` | Also mounts `IconSprites`, and renders regular and filled grids for the full catalog. |
| `apps/web/next.config.ts` | Configures a one-year immutable cache header for the versioned sprite path. Deployment behavior was not tested. |

The original implementation uses document-local fragments after injection. The
earlier reference project instead uses `sprite.svg#name` directly. These are
different delivery mechanisms, with different runtime and loading costs.

The TypeScript AST inventory found **81 direct Icon JSX callsites in 43 files**:
49 literal callsites, 32 dynamic/other callsites and 22 distinct literal names.
It resolves direct named/default imports and aliases from the icon modules.
It does not trace every wrapper prop, dynamic expression or route import graph.
For example, `Button` accepts `StartIcon`/`EndIcon` values from its consumers.
**The 22 names are not the complete set of icons used by Cal.diy, nor a measured
route footprint.** The catalog and generated union both match the 156 symbols.

## Workloads and alternatives

| Workload | Content | Original sprite mounts |
| --- | --- | ---: |
| Showcase extraction | Actual `IconGrid`, 156 names, regular + filled variants: 312 rendered SVG instances | 2, matching the root + showcase mount sites |
| Literal-subset diagnostic | Actual `IconGrid`, one instance of each of the 22 names found in direct literal callsites | 1 |

Each workload compares:

- **Original injection:** unmodified source `Icon`, `IconSprites`, `classNames`
  and `IconGrid`, including the real `react-inlinesvg` dependency.
- **Inline baseline:** the same symbol children compiled into React glyph
  components, retaining the wrapper and presentation attributes. Only the workload's
  names are present. This is not the exact `lucide-react` implementation.
- **Native external reference:** the same wrapper changed to point directly to
  the same sprite bytes using an external fragment, without `IconSprites`.
  This is an experimental alternative, not a change made to Cal.diy. The isolated
  run uses a stable per-fixture URL; it does not simulate deployment invalidation.

The source TSX files are copied into temporary fixtures. Only the two alternative
strategies transform the copied Icon. Aliases resolve to the copied source files,
and public environment constants point to the local server. A small shared CSS
fixture supplies the grid, fill utilities and SVG reset; the Next.js/Tailwind/font
pipeline and surrounding application providers are not executed.

## Bytes

All values below are compressed response bodies in bytes. JS includes React,
`tailwind-merge`, instrumentation and any loader code retained by that strategy.
Total includes HTML, CSS, JS and the SVG when requested. Responses are compressed
individually; sourcemaps and unrequested files are excluded.

| Workload / strategy | gzip JS (B) | gzip total (B) | Brotli total (B) |
| --- | ---: | ---: | ---: |
| Showcase · original injection | 60,994 | 69,712 | 60,667 |
| Showcase · inline | 61,848 | 62,639 | 54,428 |
| Showcase · native external | 53,682 | 62,406 | 54,493 |
| Subset (22) · original injection | 60,320 | 69,044 | 60,077 |
| Subset (22) · inline | 54,326 | 55,121 | 48,043 |
| Subset (22) · native external | 53,034 | 61,761 | 53,945 |

In the showcase, native external references reduced JS by **11.99%**
relative to original injection, a difference of **7,312 gzip bytes**.
Both strategies delivered the exact same 7,925-byte gzip SVG. This difference
includes the omitted loader/wrapper path and resulting bundling changes; it is
not an isolated measurement of a single package's published size.

In the subset, the sprite strategies still fetch all 156 symbols. Inline only
includes the 22 selected drawings. A shared file can be useful across a navigation
journey; this experiment does not establish where that cost amortizes for real
Cal.diy routes.

## Loading and cache

Values are **median [p25–p75]**, in milliseconds from navigation start, over 15
samples per condition. The six fixtures produce **180 measured navigations**.

| Workload / strategy | Cache | FCP (ms) | LCP (ms) | Geometry ready (ms) |
| --- | --- | ---: | ---: | ---: |
| Showcase · original injection | cold | 792 [784–796] | 792 [784–796] | 1120 [1114–1127] |
| Showcase · original injection | repeat | 296 [268–312] | 296 [268–312] | 412 [402–428] |
| Showcase · inline | cold | 844 [840–844] | 844 [840–844] | 836 [834–839] |
| Showcase · inline | repeat | 320 [292–324] | 320 [292–324] | 315 [313–317] |
| Showcase · native external | cold | 772 [764–772] | 772 [764–772] | 913 [912–922] |
| Showcase · native external | repeat | 352 [324–360] | 352 [324–360] | 352 [345–358] |
| Subset (22) · original injection | cold | 732 [724–732] | 732 [724–732] | 969 [962–971] |
| Subset (22) · original injection | repeat | 244 [236–244] | 244 [236–244] | 295 [293–298] |
| Subset (22) · inline | cold | 696 [692–700] | 696 [692–700] | 697 [692–698] |
| Subset (22) · inline | repeat | 240 [212–240] | 240 [212–240] | 238 [234–238] |
| Subset (22) · native external | cold | 692 [688–692] | 692 [688–692] | 856 [854–859] |
| Subset (22) · native external | repeat | 244 [240–244] | 244 [240–244] | 241 [239–244] |

In the showcase, earlier text paint (792 vs 844 ms) coexisted with later icon
geometry (1,120 vs 836 ms) for original injection versus inline. With warm cache,
geometry was still later (412 vs 315 ms), while only HTML bodies transferred.
The native external alternative resolved geometry at 913 ms cold, between the
original and inline results. These are combined-path observations, not an
isolated CPU profile of the loader.

`geometryReady` uses the same proxy as the first experiment: after commit, poll
all rendered icon SVGs, including those below the fold, with `getBBox()` and mark
the following frame once all boxes are nonempty. It is not an exact painting timestamp or a standard Web Vital.
Polling itself can trigger layout. FCP/LCP concern the page's text and do not
guarantee that the sprite has been injected or the icons have resolved.

| Workload / strategy | Cold body bytes | Repeat body bytes |
| --- | ---: | ---: |
| Showcase · original injection | 69,712 | 474 |
| Showcase · inline | 62,639 | 472 |
| Showcase · native external | 62,406 | 480 |
| Subset (22) · original injection | 69,044 | 480 |
| Subset (22) · inline | 55,121 | 476 |
| Subset (22) · native external | 61,761 | 483 |

Cold visits use a fresh browser context. Repeat visits are ordinary document
navigations with cache retained; they reload the JavaScript runtime. Static
resources are reused by **all** strategies. An SPA keeping its JavaScript module
cache and mounted layout alive could behave differently.

For the original showcase, the real library made **one sprite fetch** and inserted
**312 symbol elements**, representing two copies of the 156-symbol sprite. Its
request cache avoids the second download; it does not remove the second injected
SVG tree in this fixture. The one-mount subset inserted 156 symbols. Native
external references inserted no document-local symbols.

All three strategies produced identical first-round full-page screenshot pixels
within each workload after geometry resolved, including the filled-icon grid. Screenshots
were captured outside the timed section. DOM element counts are recorded, but no
memory, internal SVG tree size or isolated rendering-cost claim follows from them.

## Reproduce

Use Node 24 from the `typed-svg-sprite` repository root. The source checkout is an
input; do not run the commands from Cal.diy:

```sh
npm ci
source_tools=$(mktemp -d /tmp/cal-icon-tools-XXXXXX)
cp benchmarks/source-tools/package.json benchmarks/source-tools/package-lock.json "$source_tools/"
npm ci --prefix "$source_tools" --ignore-scripts
node benchmarks/source-repo.mjs \
  --repo=/path/to/cal.diy \
  --tools="$source_tools"
```

This inventories source and produces raw, gzip and Brotli sizes without launching
a browser. The isolated tool lock pins React/React DOM **18.2.0**,
`react-inlinesvg` **4.1.3**, `react-from-dom` **0.7.3** and `tailwind-merge`
**1.13.2**, matching the relevant origin lockfile entries.

For browser timing, use the Playwright 1.62.0 installation procedure from the
[first report](performance-analysis.md#reproduce), then run:

```sh
PLAYWRIGHT_MODULE="$benchmark_tools/node_modules/playwright/index.mjs" \
  node benchmarks/source-repo.mjs \
    --repo=/path/to/cal.diy \
    --tools="$source_tools" --browser --runs=15
```

The runner prints a unique temporary output directory with builds, screenshots and
`results.json`. It verifies source hashes and the source worktree status again at
the end, and closes the server and browser. It does not install dependencies or
write build outputs in Cal.diy. The source import paths and presentation attributes
are checked; a different source revision may require adapting the fixture.

## Environment, checks and limits

The run used Vite **7.3.5**, Node **v24.18.0**, Playwright **1.62.0**,
headless Chromium **151.0.7922.34**, Linux x64 on AMD Ryzen 5 5600G, viewport
1440×1000. Network emulation: download 200,000 B/s, upload 93,750 B/s, latency
parameter 150 ms; CPU slowdown 4×. HTTP/1.1 localhost responses use gzip level 9.
Brotli quality 11 is artifact accounting only. HTML uses `no-store`; static
resources use the same one-year immutable policy for every strategy. The fixture
order reverses on alternate rounds; no tests ran concurrently with collection.

Checks include catalog/union/symbol agreement, pinned runtime dependency versions,
resource list versus the Vite manifest, real gzip headers and cold body sizes,
cache reuse, rendered SVG counts and expected injected symbol counts, geometry,
runtime/resource errors, screenshot equality, source hashes and unchanged worktree.
[Recorded results](performance-results/cal-diy-2026-10-27.json) include the complete
inventory with file/line evidence, build sizes, resource timings and all samples.

The full Cal.diy application, its type checks and E2E suite were not run. Neither
were Next.js compilation/chunking, server-rendered HTML/hydration/RSC payloads,
database-backed pages, production cache/CDN behavior, generator performance,
mobile hardware or Safari/Firefox tested. No statistical significance test was
performed. The first and second experiments use different artwork/runtime inputs,
so their absolute totals and percentages should not be treated as one A/B test.

These results establish the behavior of the **extracted source components under
the recorded conditions**. An enterprise production improvement still requires
measurement of the application's real compiled routes and user journeys.
