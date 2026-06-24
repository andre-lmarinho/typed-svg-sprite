/**
 * icon-list.ts — the icons in the sprite.
 *
 * List the ids you want from Lucide. At build time, scripts/build-icons.mjs
 * reads each icon's SVG from the `lucide-static` package and bundles them into
 * one sprite, consumed as <Icon name="…" />.
 *
 * Browse ids at https://lucide.dev/icons. Add/remove an entry, then run
 * `npm run build:icons`. Requires: npm i -D lucide-static (already a devDep).
 */
export const lucideIcons = [
  "search",
  "heart",
  "star",
  "download",
  "upload",
  "lock",
  "globe",
  "zap",
  "bell",
  "calendar",
  "users",
  "file-text",
  "settings",
  "sun",
  "moon",
  "check-circle",
  "pencil",
  "log-out",
  "layout-dashboard",
] as const;
