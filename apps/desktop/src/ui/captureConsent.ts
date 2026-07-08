export const CAPTURE_CONSENT_STORAGE_KEY = "dokeza.captureConsentAccepted";

export interface CaptureConsentStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function readCaptureConsent(storage: CaptureConsentStorage | undefined): boolean {
  if (storage === undefined) {
    return false;
  }

  try {
    return storage.getItem(CAPTURE_CONSENT_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeCaptureConsent(
  storage: CaptureConsentStorage | undefined,
  accepted: boolean,
): void {
  if (storage === undefined) {
    return;
  }

  try {
    if (accepted) {
      storage.setItem(CAPTURE_CONSENT_STORAGE_KEY, "true");
      return;
    }

    storage.removeItem(CAPTURE_CONSENT_STORAGE_KEY);
  } catch {
    // Consent state is a UI preference; storage failures must not expose meeting content.
  }
}
