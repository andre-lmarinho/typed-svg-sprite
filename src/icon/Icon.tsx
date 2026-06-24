import type React from "react";
import type { IconName } from "./icon-names";

/**
 * Where the generated sprite lives. Vite serves files in /public at the site
 * root, so /public/icons/sprite.svg is reachable at /icons/sprite.svg.
 */
const SPRITE_URL = "/icons/sprite.svg";

type IconProps = React.SVGProps<SVGSVGElement> & {
  /** Sprite id — autocompleted and type-checked against the generated union. */
  name: IconName;
  size?: number | string;
};

/**
 * Icon renders a single <use> that points into the cached sprite. The whole
 * icon set is downloaded once (and cached) as /icons/sprite.svg; every <Icon>
 * after that is just a reference — no per-icon JS, no extra requests.
 *
 * Color follows `currentColor`, so `style={{ color }}` or a text color class
 * tints the icon. Size is a single prop applied to width/height.
 */
export function Icon({ name, size = 24, className, ...props }: IconProps) {
  const isDecorative = !props["aria-label"] && !props["aria-labelledby"];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      {...props}
      aria-hidden={props["aria-hidden"] ?? (isDecorative ? true : undefined)}
      focusable={props.focusable ?? (isDecorative ? "false" : undefined)}
      role={props.role ?? (isDecorative ? "presentation" : "img")}>
      <use href={`${SPRITE_URL}#${name}`} />
    </svg>
  );
}
