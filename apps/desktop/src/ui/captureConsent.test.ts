import { describe, expect, it } from "vitest";
import {
  CAPTURE_CONSENT_STORAGE_KEY,
  readCaptureConsent,
  writeCaptureConsent,
} from "./captureConsent.js";

describe("captureConsent", () => {
  it("reads and writes the capture consent preference", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };

    expect(readCaptureConsent(storage)).toBe(false);

    writeCaptureConsent(storage, true);
    expect(values.get(CAPTURE_CONSENT_STORAGE_KEY)).toBe("true");
    expect(readCaptureConsent(storage)).toBe(true);

    writeCaptureConsent(storage, false);
    expect(readCaptureConsent(storage)).toBe(false);
  });

  it("fails closed when preference storage is unavailable", () => {
    expect(readCaptureConsent(undefined)).toBe(false);

    const throwingStorage = {
      getItem: () => {
        throw new Error("storage_unavailable");
      },
      setItem: () => {
        throw new Error("storage_unavailable");
      },
      removeItem: () => {
        throw new Error("storage_unavailable");
      },
    };

    expect(readCaptureConsent(throwingStorage)).toBe(false);
    expect(() => writeCaptureConsent(throwingStorage, true)).not.toThrow();
  });
});
