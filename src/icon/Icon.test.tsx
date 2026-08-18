// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, expectTypeOf, it } from "vitest";
import { Icon } from "./Icon";
import type { IconName } from "./icon-names";

describe("Icon", () => {
  it("renders a decorative icon with safe accessibility defaults", () => {
    const { container } = render(<Icon name="calendar" />);
    const svg = container.querySelector("svg");
    const uses = container.querySelectorAll("use");

    expect(svg?.getAttribute("width")).toBe("24");
    expect(svg?.getAttribute("height")).toBe("24");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg?.getAttribute("fill")).toBe("none");
    expect(svg?.getAttribute("stroke")).toBe("currentColor");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("focusable")).toBe("false");
    expect(svg?.getAttribute("role")).toBe("presentation");
    expect(uses).toHaveLength(1);
    expect(uses[0].getAttribute("href")).toBe(
      "/typed-svg-sprite/icons/sprite.svg#calendar",
    );
  });

  it("uses a label to expose a standalone icon as an image", () => {
    const { getByRole } = render(<Icon name="search" aria-label="Search" />);
    const svg = getByRole("img", { name: "Search" });

    expect(svg.hasAttribute("aria-hidden")).toBe(false);
    expect(svg.hasAttribute("focusable")).toBe(false);
  });

  it("supports aria-labelledby as an accessible name source", () => {
    const { getByRole } = render(
      <>
        <span id="calendar-title">Calendar</span>
        <Icon name="calendar" aria-labelledby="calendar-title" />
      </>,
    );

    expect(getByRole("img", { name: "Calendar" })).toBeTruthy();
  });

  it("forwards SVG props and accepts CSS sizes", () => {
    const { container } = render(
      <Icon
        name="heart"
        size="2rem"
        className="favorite"
        data-testid="heart"
        strokeWidth={3}
        style={{ color: "red" }}
      />,
    );
    const svg = container.querySelector("svg");

    expect(svg?.getAttribute("width")).toBe("2rem");
    expect(svg?.getAttribute("height")).toBe("2rem");
    expect(svg?.getAttribute("class")).toBe("favorite");
    expect(svg?.getAttribute("data-testid")).toBe("heart");
    expect(svg?.getAttribute("stroke-width")).toBe("3");
    expect(svg?.getAttribute("style")).toContain("color: red");
  });

  it("honors explicit accessibility overrides", () => {
    const { container } = render(
      <Icon
        name="bell"
        aria-hidden={false}
        focusable="true"
        role="graphics-symbol"
      />,
    );
    const svg = container.querySelector("svg");

    expect(svg?.getAttribute("aria-hidden")).toBe("false");
    expect(svg?.getAttribute("focusable")).toBe("true");
    expect(svg?.getAttribute("role")).toBe("graphics-symbol");
  });

  it("keeps the name prop constrained to the generated union", () => {
    expectTypeOf<Parameters<typeof Icon>[0]["name"]>().toEqualTypeOf<IconName>();
  });
});
