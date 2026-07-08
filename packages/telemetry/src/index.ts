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

export interface TelemetryResourceInput {
  environment: string;
  serviceName: string;
  serviceVersion?: string;
}

const restrictedKeyFragments = [
  "audio",
  "credential",
  "content",
  "document",
  "key",
  "password",
  "prompt",
  "raw",
  "secret",
  "suggestion",
  "text",
  "token",
  "transcript",
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
          : item,
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
    fields: redactTelemetryFields(fields),
  };
}

export function createOtelResourceAttributes(
  input: TelemetryResourceInput,
): Record<string, string> {
  const attributes: Record<string, string> = {
    "deployment.environment.name": input.environment,
    "service.name": input.serviceName,
  };

  if (input.serviceVersion !== undefined) {
    attributes["service.version"] = input.serviceVersion;
  }

  return attributes;
}
