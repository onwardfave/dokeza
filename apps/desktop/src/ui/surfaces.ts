export const MAIN_WINDOW_LABEL = "main";
export const OVERLAY_WINDOW_LABEL = "overlay";

export type DesktopSurface = "main" | "overlay" | "qa";

export function selectDesktopSurface(locationHash: string): DesktopSurface {
  if (locationHash === "#/overlay") {
    return "overlay";
  }

  if (locationHash === "#/qa") {
    return "qa";
  }

  return "main";
}
