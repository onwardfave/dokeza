export type EnvironmentName = "local" | "test" | "preview" | "staging" | "production";
export type RetentionDefault = "7_days" | "30_days" | "1_year";

export interface DokezaConfig {
  environment: EnvironmentName;
  serviceName: string;
  port: number;
  logLevel: "debug" | "info" | "warn" | "error";
  telemetry: {
    enabled: boolean;
    otlpEndpoint: string;
    tracesSampleRate: number;
    contentLoggingAllowed: boolean;
  };
  providers: {
    stt: "deepgram";
    llm: "openai";
    embeddings: "openai";
  };
  retentionDefaults: {
    individual: RetentionDefault;
    team: RetentionDefault;
    enterprise: RetentionDefault;
  };
}

export interface ConfigParseResult {
  ok: boolean;
  config?: DokezaConfig;
  errors: string[];
}

const environments = new Set<EnvironmentName>([
  "local",
  "test",
  "preview",
  "staging",
  "production",
]);

const logLevels = new Set<DokezaConfig["logLevel"]>(["debug", "info", "warn", "error"]);

function readEnvironment(value: string | undefined): EnvironmentName | undefined {
  if (value === undefined) {
    return "local";
  }
  return environments.has(value as EnvironmentName) ? (value as EnvironmentName) : undefined;
}

function readLogLevel(value: string | undefined): DokezaConfig["logLevel"] | undefined {
  if (value === undefined) {
    return "info";
  }
  return logLevels.has(value as DokezaConfig["logLevel"])
    ? (value as DokezaConfig["logLevel"])
    : undefined;
}

function readPort(value: string | undefined): number | undefined {
  if (value === undefined) {
    return 3000;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : undefined;
}

function readBoolean(value: string | undefined, defaultValue: boolean): boolean | undefined {
  if (value === undefined) {
    return defaultValue;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return undefined;
}

function readSampleRate(value: string | undefined): number | undefined {
  if (value === undefined) {
    return 1;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : undefined;
}

function readOtlpEndpoint(value: string | undefined): string | undefined {
  const endpoint = value ?? "http://localhost:4318";

  try {
    const parsed = new URL(endpoint);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

export function parseConfig(env: NodeJS.ProcessEnv, serviceName: string): ConfigParseResult {
  const errors: string[] = [];
  const environment = readEnvironment(env.DOKEZA_ENV);
  const port = readPort(env.PORT);
  const logLevel = readLogLevel(env.LOG_LEVEL);
  const telemetryEnabled = readBoolean(env.DOKEZA_TELEMETRY_ENABLED, true);
  const tracesSampleRate = readSampleRate(env.OTEL_TRACES_SAMPLER_ARG);
  const otlpEndpoint = readOtlpEndpoint(env.OTEL_EXPORTER_OTLP_ENDPOINT);
  const contentLoggingAllowed = readBoolean(env.DOKEZA_TELEMETRY_CONTENT_LOGGING_ALLOWED, false);

  if (environment === undefined) {
    errors.push("DOKEZA_ENV must be local, test, preview, staging, or production.");
  }
  if (port === undefined) {
    errors.push("PORT must be an integer from 1 to 65535.");
  }
  if (logLevel === undefined) {
    errors.push("LOG_LEVEL must be debug, info, warn, or error.");
  }
  if (telemetryEnabled === undefined) {
    errors.push("DOKEZA_TELEMETRY_ENABLED must be true or false.");
  }
  if (tracesSampleRate === undefined) {
    errors.push("OTEL_TRACES_SAMPLER_ARG must be a number from 0 to 1.");
  }
  if (otlpEndpoint === undefined) {
    errors.push("OTEL_EXPORTER_OTLP_ENDPOINT must be an absolute http or https URL.");
  }
  if (contentLoggingAllowed === undefined) {
    errors.push("DOKEZA_TELEMETRY_CONTENT_LOGGING_ALLOWED must be true or false.");
  }
  if (environment === "production" && contentLoggingAllowed === true) {
    errors.push("DOKEZA_TELEMETRY_CONTENT_LOGGING_ALLOWED cannot be true in production.");
  }
  if (serviceName.trim().length === 0) {
    errors.push("serviceName is required.");
  }

  if (
    errors.length > 0 ||
    environment === undefined ||
    port === undefined ||
    logLevel === undefined ||
    telemetryEnabled === undefined ||
    tracesSampleRate === undefined ||
    otlpEndpoint === undefined ||
    contentLoggingAllowed === undefined
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    config: {
      environment,
      serviceName,
      port,
      logLevel,
      telemetry: {
        enabled: telemetryEnabled,
        otlpEndpoint,
        tracesSampleRate,
        contentLoggingAllowed,
      },
      providers: {
        stt: "deepgram",
        llm: "openai",
        embeddings: "openai",
      },
      retentionDefaults: {
        individual: "7_days",
        team: "30_days",
        enterprise: "30_days",
      },
    },
    errors: [],
  };
}
