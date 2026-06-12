type TelemetryValue =
  | string
  | number
  | boolean
  | null
  | TelemetryValue[]
  | { [key: string]: TelemetryValue };

export type TelemetryFields = Record<string, TelemetryValue>;

export interface TelemetryEvent {
  name: string;
  fields: TelemetryFields;
}

const restrictedKeyFragments = [
  "audio",
  "content",
  "document",
  "prompt",
  "raw",
  "suggestion",
  "text",
  "transcript"
];

function isRestrictedKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[_-]/g, "");
  return restrictedKeyFragments.some((fragment) => normalized.includes(fragment));
}

export function redactTelemetryFields(fields: TelemetryFields): TelemetryFields {
  const redacted: TelemetryFields = {};

  for (const [key, value] of Object.entries(fields)) {
    if (isRestrictedKey(key)) {
      redacted[key] = "[REDACTED]";
      continue;
    }

    if (Array.isArray(value)) {
      redacted[key] = value.map((item) =>
        typeof item === "object" && item !== null && !Array.isArray(item)
          ? redactTelemetryFields(item)
          : item
      ) as TelemetryValue[];
      continue;
    }

    if (typeof value === "object" && value !== null) {
      redacted[key] = redactTelemetryFields(value);
      continue;
    }

    redacted[key] = value;
  }

  return redacted;
}

export function createTelemetryEvent(name: string, fields: TelemetryFields): TelemetryEvent {
  return {
    name,
    fields: redactTelemetryFields(fields)
  };
}
