export const MAIN_WINDOW_LABEL = "main";
export const OVERLAY_WINDOW_LABEL = "overlay";

export type DesktopSurface = "main" | "overlay";

export function selectDesktopSurface(locationHash: string): DesktopSurface {
  return locationHash === "#/overlay" ? "overlay" : "main";
}
