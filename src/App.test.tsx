// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { iconNames } from "./icon";

describe("App", () => {
  it("renders the showcase, every generated icon, and the source credit", () => {
    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "typed-svg-sprite" })).toBeTruthy();
    expect(
      screen.getByText(iconNames.length + " icons in one sprite", { exact: false }),
    ).toBeTruthy();

    const gallery = screen.getByRole("region", { name: "Icons" });
    expect(within(gallery).getAllByRole("listitem")).toHaveLength(iconNames.length);

    const credit = screen.getByRole("link", { name: "calcom/cal.diy" });
    expect(credit.getAttribute("href")).toBe("https://github.com/calcom/cal.diy");
    expect(credit.getAttribute("rel")).toBe("noreferrer");
  });

  it("updates every icon size through the range control", () => {
    render(<App />);

    fireEvent.change(screen.getByRole("slider"), { target: { value: "48" } });

    expect(screen.getByText("Size: 48px")).toBeTruthy();
    const calendarTile = screen.getByText("calendar").closest(".tile")!;
    expect(calendarTile.querySelector("svg")?.getAttribute("width")).toBe("48");
    expect(calendarTile.querySelector("svg")?.getAttribute("height")).toBe("48");
  });

  it("changes the inherited gallery color and selected swatch", () => {
    render(<App />);

    const redSwatch = screen.getByRole("button", { name: "Use color #dc2626" });
    fireEvent.click(redSwatch);

    expect(redSwatch.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("list").style.color).toBe("rgb(220, 38, 38)");
  });
});
