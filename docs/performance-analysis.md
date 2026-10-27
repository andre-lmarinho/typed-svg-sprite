# Bundle size and loading: measured tradeoffs

Measured on 27 October 2026 against application revision
`88dab66d56c6b59de2f39753bc0316f39b596b50`. This is a synthetic experiment built
from this repository, not a result from an enterprise production deployment.

The external sprite reduces JavaScript, but the SVG still has to be delivered.
In this experiment, a shared sprite with 60 icons reduced initial JavaScript by
**6.45%**, while increasing the first page's total compressed payload by
**1.73%**. Loading the next page reused the sprite and made the
two-page journey **1.87% smaller** overall. Shipping a 500-icon sprite
to a page using 40 icons increased initial payload by **42.65%**.

The page's text painted earlier with the sprite, while the icons' geometry became
available later. These results support a measured reduction in JavaScript and a
conditional cache benefit; they do not support a general claim that the application
loads faster.

For a separate experiment using the origin repository’s actual components and
156-symbol artifact, see the [Cal.diy source benchmark](cal-diy-performance-analysis.md).
Its injection mechanism and runtime inputs differ from the external-reference
fixtures measured here.

## What was compared

| Scenario | Icons used | Rendered instances | Alternatives |
| --- | --- | --- | --- |
| Existing demo | All 12 icons | 18 | Inline React components; 12-icon sprite |
| Enterprise simulation, route A | 40 of 500 available icons | 400 | Inline components; shared 60-icon sprite; complete 500-icon sprite |
| Enterprise simulation, route B | 40 icons, 20 shared with A | 400 | Same alternatives, with cache retained after visiting A |

The 60-icon sprite contains the union of A and B. This is a manually scoped fixture,
not an automatic route-splitting feature implemented by the application.

The inline baseline uses the **same Lucide SVG paths**, generated as individually
imported React components. Only the icons needed by each route are imported.
Rollup shares the 20 overlapping glyphs between routes. The icon wrapper retains
the component's dimensions, accessibility behavior and the sprite's stroke style.
This is a controlled inline-components baseline, **not a benchmark of the
`lucide-react` package** or its precise runtime implementation.

The demo reuses `src/App.tsx` and `src/App.css`. Enterprise fixtures reuse the CSS
with a synthetic dashboard. Both use the same instrumented HTML shell, React
runtime and production Vite build. This is a comparison of fixtures, not an audit
of the deployed GitHub Pages site's loading time.

The extra 488 catalog entries are selected by sorting installed SVG filenames by
SHA-256 of their names after the original 12. The selection is deterministic and
recorded in the result file; it is not a sample taken from a real enterprise app.

## Bundle and payload results

Bytes are summed **after compressing each response separately**. “Total” includes
HTML, CSS, JavaScript and the sprite required by route A. React and measurement
instrumentation are included equally. Sourcemaps and files not requested by the
page are excluded. Browser measurements confirmed the cold response bodies matched
the gzip accounting.

| Fixture | Raw JS (B) | gzip JS (B) | gzip total (B) | Brotli total (B) |
| --- | ---: | ---: | ---: | ---: |
| Demo · inline | 149,411 | 48,333 | 49,810 | 43,450 |
| Demo · sprite (12) | 146,385 | 47,360 | 49,994 | 43,597 |
| Enterprise · inline | 156,143 | 50,079 | 51,586 | 44,919 |
| Enterprise · sprite (60) | 144,339 | 46,849 | 52,481 | 45,833 |
| Enterprise · sprite (500) | 144,340 | 46,849 | 73,589 | 63,103 |

The shared sprite moved **3,230 bytes** out of the enterprise route's
compressed JS, but added **895 bytes** to its initial total payload.
The complete sprite added **22,003 bytes** to the initial total.
A smaller JS bundle and a smaller total download answer different questions.

Raw and Brotli sizes, individual files, import dependencies and all samples are in
[the recorded results](performance-results/2026-10-27.json).

## Loading results

Values are milliseconds from navigation start, shown as **median [p25–p75]** over
15 samples per condition. FCP and LCP were equal in every sample in this run. LCP
was the same paragraph in both demo variants, and the dashboard heading in every
enterprise variant. It was not an icon.

| Fixture | Condition | FCP / LCP (ms) | Geometry ready (ms) |
| --- | --- | ---: | ---: |
| Demo · inline | First visit A | 700 [696–700] | 696 [691–697] |
| Demo · inline | Repeat A | 240 [240–244] | 238 [236–240] |
| Demo · sprite (12) | First visit A | 692 [688–696] | 778 [771–782] |
| Demo · sprite (12) | Repeat A | 244 [240–244] | 239 [236–240] |
| Enterprise · inline | First visit A | 796 [788–800] | 791 [787–797] |
| Enterprise · inline | Repeat A | 348 [332–356] | 342 [332–351] |
| Enterprise · inline | Next route B | 488 [484–496] | 482 [478–487] |
| Enterprise · sprite (60) | First visit A | 768 [764–772] | 872 [862–873] |
| Enterprise · sprite (60) | Repeat A | 352 [348–380] | 376 [372–382] |
| Enterprise · sprite (60) | Next route B | 524 [520–536] | 529 [523–538] |
| Enterprise · sprite (500) | First visit A | 772 [768–776] | 1019 [1018–1022] |
| Enterprise · sprite (500) | Repeat A | 388 [352–396] | 390 [377–398] |
| Enterprise · sprite (500) | Next route B | 532 [524–536] | 534 [528–539] |

`geometryReady` is a custom proxy: after the React commit, the fixture checks on
animation frames until every rendered SVG has a nonempty `getBBox()`, then records
the following frame. It confirms resolved geometry, **not exact pixel visibility**.
The polling can trigger synchronous layout and affects the workload. It must not
be presented as a standardized loading metric. See the definitions of
[`getBBox()`](https://developer.mozilla.org/en-US/docs/Web/API/SVGGraphicsElement/getBBox)
and [`requestAnimationFrame()`](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame).

All five first-visit screenshots were checked. The demo pair and all three
enterprise variants had identical screenshot pixels at the recorded viewport.
Screenshots are taken after measurement, so they validate eventual rendering,
not the exact time at which icons became visible.

SVG `<use>` references are discovered when the client renders. The first page
therefore has an additional resource dependency. A text-based LCP can improve
while icons still wait for the sprite. The supported LCP candidates are described
in [web.dev's LCP documentation](https://web.dev/articles/lcp).

## What cache changes

Each fixture journey starts in a fresh browser context with an empty HTTP cache.
The second visit is another ordinary document navigation to A; it is not a forced
reload. The third visit is document navigation to B in that same context. This is
not a measurement of client-side SPA routing.

| Enterprise alternative | First A body bytes | Repeat A body bytes | New B body bytes |
| --- | ---: | ---: | ---: |
| inline | 51,586 | 569 | 3,110 |
| sprite (60) | 52,481 | 570 | 1,193 |
| sprite (500) | 73,589 | 574 | 1,194 |

All alternatives reuse their static resources on the repeated visit. The inline
baseline also caches React, CSS and shared icon modules. On B, a scoped sprite
avoids downloading definitions for the 20 new icons; the inline baseline downloads
only its new route chunk. A cached sprite does not eliminate all route requests.

For the two-page A→B journey, counting each required response once:

| Enterprise alternative | A→B total gzip bodies (B) | Change from inline |
| --- | ---: | ---: |
| inline | 54,696 | +0.00% |
| sprite (60) | 53,674 | -1.87% |
| sprite (500) | 74,783 | +36.72% |

This experiment's scoped sprite amortizes its initial overhead by the second
distinct route. Repeated visits to A alone do not produce that benefit: both
implementations already cache A's static assets. Caching is a property of the
HTTP delivery policy, [not exclusive to sprites](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching).

## Environment and controls

- Node v24.18.0, React 18.3.1, Vite 7.3.5, `lucide-static` 1.21.0.
- Playwright 1.62.0, headless Chromium 151.0.7922.34, Linux x64,
  AMD Ryzen 5 5600G; viewport 1440×1000.
- Chrome CDP emulation: download 200,000 B/s (1.6 Mbit/s), upload 93,750 B/s,
  latency parameter 150 ms, CPU slowdown 4×. This does not reproduce a particular
  phone or real network. The runner uses
  [`emulateNetworkConditionsByRule` and `overrideNetworkState`](https://chromedevtools.github.io/devtools-protocol/tot/Network/).
- A local HTTP/1.1 server, same-origin resources, real gzip responses at level 9.
  Brotli quality 11 is calculated for artifacts only, not used for timing runs.
- HTML: `Cache-Control: no-store`. Static resources, including JS and SVG:
  `public,max-age=31536000,immutable`. The sprite URL is stable only within this
  isolated run. A real deployment needs a versioned URL before using that policy;
  the application's current sprite filename is not content hashed.
- Fifteen sequential rounds; fixture order reverses on alternate rounds. Each
  fixture gets a fresh context, followed by its cold, repeat and next-route visits.
  No tests or production builds ran concurrently with collection.
- The runner verifies icon counts, nonempty geometry, compression headers, absence
  of resource/runtime errors, the complete resource list against the build manifest,
  cold body-byte totals and reuse of static assets on repeated visits.

`bodyBytes` sums `encodedBodySize` only for responses with network transfer,
including the HTML document via Navigation Timing. Cached resources can still
report their original encoded size, so blindly summing that field over all entries
would overcount traffic. `transferSize` is also recorded, but is browser API
accounting with standardized overhead, not an exact packet capture. See
[W3C Resource Timing](https://www.w3.org/TR/resource-timing/).

## Reproduce

From the repository root with Node 24:

```sh
npm ci
node benchmarks/run.mjs
```

That builds all five fixtures and records raw, gzip and Brotli sizes without a
browser dependency. For timing, install an isolated, pinned browser toolchain:

```sh
benchmark_tools=$(mktemp -d /tmp/typed-svg-tools-XXXXXX)
npm install --prefix "$benchmark_tools" --no-save --package-lock=false playwright@1.62.0
"$benchmark_tools/node_modules/.bin/playwright" install chromium
PLAYWRIGHT_MODULE="$benchmark_tools/node_modules/playwright/index.mjs" \
  node benchmarks/run.mjs --browser --runs=15
```

The runner prints a unique temporary output directory containing `results.json`,
production fixtures, raw samples and first-visit screenshots. It shuts down its
server and browser. It does not overwrite application artifacts. If Playwright
is already installed in the project, `--browser` also works without the environment
variable. Browser binaries and system libraries must be available before running.

Timing values will vary with the host and browser. To reproduce the source inputs,
use the application revision above and compare the source hashes in the recorded
result. New runs should be saved as new dated observations, not overwrite this run.

## Applying this to an enterprise repository

Repository size alone does not determine runtime benefit. The relevant inputs are
the icons reachable by each shipped route, rendered instances, route overlap,
existing chunking, cache headers, client CPU and the timing of resource discovery.
Rendering an icon ten times reuses its JS definition; it does not ship that
definition ten times.

For an actual adoption decision, use the real route imports and common navigation
journeys in the same harness, then measure the deployed delivery path. Preserve
the current baseline's tree shaking and code splitting. Evaluate scoped sprites
if most of the catalog is unused on the entry route. Measure FCP/LCP separately
from icon availability and include total compressed bytes, not just JS.

Not measured here: SSR/hydration, Next.js payloads, an entire enterprise codebase,
HTTP/2 or HTTP/3/CDN delivery, Safari/Firefox, mobile hardware, deployment updates
and cache invalidation, SVG optimization, individual SVG `<img>` files, memory,
isolated JS parse/compile time, INP or maintenance savings. No statistical
significance test was performed; the reported percent changes are descriptive.

The exposed DOM count is recorded but is not a memory or rendering-cost claim:
[`<use>` duplicates graphics into a non-exposed tree](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/use).
Type safety is a separate development benefit;
[TypeScript types are erased](https://www.typescriptlang.org/docs/handbook/2/basic-types.html#erased-types)
and do not explain a runtime speedup.

## Wording supported by this evidence

> I measured the tradeoff in a reproducible synthetic benchmark. With 40 icons per
> page, a shared 60-icon sprite reduced gzip JavaScript by 6.45% and reduced
> the total bytes across two pages by 1.87%. The first visit downloaded
> more bytes, and icon geometry resolved later despite earlier text paint.
> I would describe that as a bundle and caching benefit under those conditions,
> rather than claim a general loading-time improvement or an enterprise production result.
