import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MAIN_WINDOW_LABEL, OVERLAY_WINDOW_LABEL } from "./surfaces.js";

type TauriWindowConfig = {
  label: string;
  title: string;
  url?: string;
  transparent?: boolean;
  decorations?: boolean;
  alwaysOnTop?: boolean;
  resizable?: boolean;
  visible?: boolean;
  width: number;
  height: number;
};

type TauriConfig = {
  app: {
    windows: TauriWindowConfig[];
  };
};

function readTauriConfig(): TauriConfig {
  return JSON.parse(readFileSync(resolve("src-tauri", "tauri.conf.json"), "utf8")) as TauriConfig;
}

describe("tauri desktop windows", () => {
  it("defines a main application window", () => {
    const config = readTauriConfig();
    const main = config.app.windows.find(
      (windowConfig) => windowConfig.label === MAIN_WINDOW_LABEL,
    );

    expect(main).toMatchObject({
      label: MAIN_WINDOW_LABEL,
      title: "Dokeza",
      width: 900,
      height: 680,
    });
  });

  it("defines a transparent always-on-top overlay window", () => {
    const config = readTauriConfig();
    const overlay = config.app.windows.find(
      (windowConfig) => windowConfig.label === OVERLAY_WINDOW_LABEL,
    );

    expect(overlay).toMatchObject({
      label: OVERLAY_WINDOW_LABEL,
      title: "Dokeza Overlay",
      url: "index.html#/overlay",
      transparent: true,
      decorations: false,
      alwaysOnTop: true,
      resizable: true,
      visible: false,
    });
  });
});
