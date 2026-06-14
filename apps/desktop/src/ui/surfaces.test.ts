import { describe, expect, it } from "vitest";
import { MAIN_WINDOW_LABEL, OVERLAY_WINDOW_LABEL, selectDesktopSurface } from "./surfaces.js";

describe("desktop surfaces", () => {
  it("uses the main surface by default", () => {
    expect(selectDesktopSurface("")).toBe("main");
    expect(MAIN_WINDOW_LABEL).toBe("main");
  });

  it("selects the overlay surface from the overlay route hash", () => {
    expect(selectDesktopSurface("#/overlay")).toBe("overlay");
    expect(OVERLAY_WINDOW_LABEL).toBe("overlay");
  });
});
