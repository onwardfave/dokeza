export type EnvironmentName = "local" | "test" | "preview" | "staging" | "production";
export type RetentionDefault = "7_days" | "30_days" | "1_year";
export type DeepgramEncoding = "linear16";
export type RealtimePersistenceMode = "memory" | "postgres";

export interface DeepgramSttConfig {
  apiKey?: string;
  endpoint: string;
  model: string;
  language: string;
  interimResults: boolean;
  punctuate: boolean;
  smartFormat: boolean;
  encoding: DeepgramEncoding;
  sampleRateHz: number;
  channels: number;
  timeoutMs: number;
}

export interface DokezaConfig {
  environment: EnvironmentName;
  serviceName: string;
  port: number;
  logLevel: "debug" | "info" | "warn" | "error";
  auth: {
    issuer: string;
    audience: string;
    signingSecret: string;
    apiTokenTtlSeconds: number;
    realtimeTokenTtlSeconds: number;
    developmentAuthEnabled: boolean;
  };
  telemetry: {
    enabled: boolean;
    otlpEndpoint: string;
    tracesSampleRate: number;
    contentLoggingAllowed: boolean;
  };
  providers: {
    stt: {
      provider: "deepgram";
      deepgram: DeepgramSttConfig;
    };
    llm: "openai";
    embeddings: "openai";
  };
  retentionDefaults: {
    individual: RetentionDefault;
    team: RetentionDefault;
    enterprise: RetentionDefault;
  };
  database: {
    realtimePersistence: RealtimePersistenceMode;
    url?: string;
    poolMax: number;
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

function readWebSocketEndpoint(value: string | undefined): string | undefined {
  const endpoint = value ?? "wss://api.deepgram.com/v1/listen";

  try {
    const parsed = new URL(endpoint);
    return parsed.protocol === "ws:" || parsed.protocol === "wss:" ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

function readRequiredString(value: string | undefined, defaultValue: string): string | undefined {
  const resolved = value ?? defaultValue;
  return resolved.trim().length > 0 ? resolved : undefined;
}

function readDeepgramEncoding(value: string | undefined): DeepgramEncoding | undefined {
  if (value === undefined || value === "linear16") {
    return "linear16";
  }

  return undefined;
}

function readRealtimePersistenceMode(
  value: string | undefined,
  environment: EnvironmentName | undefined,
): RealtimePersistenceMode | undefined {
  if (value === undefined) {
    return environment === "production" ? "postgres" : "memory";
  }

  return value === "memory" || value === "postgres" ? value : undefined;
}

function readPositiveInteger(value: string | undefined, defaultValue: number): number | undefined {
  if (value === undefined) {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function readSigningSecret(
  value: string | undefined,
  environment: EnvironmentName | undefined,
): string | undefined {
  const secret = value?.trim();
  if (secret !== undefined && secret.length > 0) {
    return secret.length >= 32 ? secret : undefined;
  }

  if (environment === "local" || environment === "test") {
    return "dev_only_dokeza_auth_secret_do_not_use";
  }

  return undefined;
}

function readDevelopmentAuthEnabled(
  value: string | undefined,
  environment: EnvironmentName | undefined,
): boolean | undefined {
  if (value === undefined) {
    return environment === "local" || environment === "test";
  }

  return readBoolean(value, false);
}

function readPostgresUrl(value: string | undefined): string | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "postgres:" || parsed.protocol === "postgresql:"
      ? value.trim()
      : undefined;
  } catch {
    return undefined;
  }
}

function createDeepgramConfig(input: {
  apiKey: string | undefined;
  endpoint: string;
  model: string;
  language: string;
  interimResults: boolean;
  punctuate: boolean;
  smartFormat: boolean;
  encoding: DeepgramEncoding;
  sampleRateHz: number;
  channels: number;
  timeoutMs: number;
}): DeepgramSttConfig {
  const config: DeepgramSttConfig = {
    endpoint: input.endpoint,
    model: input.model,
    language: input.language,
    interimResults: input.interimResults,
    punctuate: input.punctuate,
    smartFormat: input.smartFormat,
    encoding: input.encoding,
    sampleRateHz: input.sampleRateHz,
    channels: input.channels,
    timeoutMs: input.timeoutMs,
  };

  if (input.apiKey !== undefined) {
    config.apiKey = input.apiKey;
  }

  return config;
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
  const authIssuer = readRequiredString(
    env.DOKEZA_AUTH_ISSUER,
    "https://auth.local.dokeza.dev",
  );
  const authAudience = readRequiredString(env.DOKEZA_AUTH_AUDIENCE, "dokeza");
  const authSigningSecret = readSigningSecret(env.DOKEZA_AUTH_SIGNING_SECRET, environment);
  const apiTokenTtlSeconds = readPositiveInteger(env.DOKEZA_AUTH_API_TOKEN_TTL_SECONDS, 3600);
  const realtimeTokenTtlSeconds = readPositiveInteger(
    env.DOKEZA_AUTH_REALTIME_TOKEN_TTL_SECONDS,
    300,
  );
  const developmentAuthEnabled = readDevelopmentAuthEnabled(
    env.DOKEZA_DEV_AUTH_ENABLED,
    environment,
  );
  const deepgramApiKey = env.DEEPGRAM_API_KEY?.trim();
  const deepgramEndpoint = readWebSocketEndpoint(env.DEEPGRAM_ENDPOINT);
  const deepgramModel = readRequiredString(env.DEEPGRAM_MODEL, "nova-3");
  const deepgramLanguage = readRequiredString(env.DEEPGRAM_LANGUAGE, "en");
  const deepgramInterimResults = readBoolean(env.DEEPGRAM_INTERIM_RESULTS, true);
  const deepgramPunctuate = readBoolean(env.DEEPGRAM_PUNCTUATE, true);
  const deepgramSmartFormat = readBoolean(env.DEEPGRAM_SMART_FORMAT, true);
  const deepgramEncoding = readDeepgramEncoding(env.DEEPGRAM_ENCODING);
  const deepgramSampleRateHz = readPositiveInteger(env.DEEPGRAM_SAMPLE_RATE_HZ, 16000);
  const deepgramChannels = readPositiveInteger(env.DEEPGRAM_CHANNELS, 1);
  const deepgramTimeoutMs = readPositiveInteger(env.DEEPGRAM_TIMEOUT_MS, 5000);
  const realtimePersistence = readRealtimePersistenceMode(
    env.DOKEZA_REALTIME_PERSISTENCE,
    environment,
  );
  const databaseUrl = readPostgresUrl(env.DATABASE_URL);
  const databasePoolMax = readPositiveInteger(env.DATABASE_POOL_MAX, 10);

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
  if (authIssuer === undefined) {
    errors.push("DOKEZA_AUTH_ISSUER is required.");
  }
  if (authAudience === undefined) {
    errors.push("DOKEZA_AUTH_AUDIENCE is required.");
  }
  if (authSigningSecret === undefined) {
    errors.push("DOKEZA_AUTH_SIGNING_SECRET must be at least 32 characters outside local/test.");
  }
  if (apiTokenTtlSeconds === undefined) {
    errors.push("DOKEZA_AUTH_API_TOKEN_TTL_SECONDS must be a positive integer.");
  }
  if (realtimeTokenTtlSeconds === undefined) {
    errors.push("DOKEZA_AUTH_REALTIME_TOKEN_TTL_SECONDS must be a positive integer.");
  }
  if (developmentAuthEnabled === undefined) {
    errors.push("DOKEZA_DEV_AUTH_ENABLED must be true or false.");
  }
  if (
    developmentAuthEnabled === true &&
    environment !== undefined &&
    environment !== "local" &&
    environment !== "test"
  ) {
    errors.push("DOKEZA_DEV_AUTH_ENABLED can only be true in local or test.");
  }
  if (
    environment === "production" &&
    (deepgramApiKey === undefined || deepgramApiKey.length === 0)
  ) {
    errors.push("DEEPGRAM_API_KEY is required in production.");
  }
  if (deepgramEndpoint === undefined) {
    errors.push("DEEPGRAM_ENDPOINT must be an absolute ws or wss URL.");
  }
  if (environment === "production" && deepgramEndpoint !== undefined) {
    const parsedDeepgramEndpoint = new URL(deepgramEndpoint);
    if (parsedDeepgramEndpoint.protocol !== "wss:") {
      errors.push("DEEPGRAM_ENDPOINT must use wss in production.");
    }
  }
  if (deepgramModel === undefined) {
    errors.push("DEEPGRAM_MODEL is required.");
  }
  if (deepgramLanguage === undefined) {
    errors.push("DEEPGRAM_LANGUAGE is required.");
  }
  if (deepgramInterimResults === undefined) {
    errors.push("DEEPGRAM_INTERIM_RESULTS must be true or false.");
  }
  if (deepgramPunctuate === undefined) {
    errors.push("DEEPGRAM_PUNCTUATE must be true or false.");
  }
  if (deepgramSmartFormat === undefined) {
    errors.push("DEEPGRAM_SMART_FORMAT must be true or false.");
  }
  if (deepgramEncoding === undefined) {
    errors.push("DEEPGRAM_ENCODING must be linear16.");
  }
  if (deepgramSampleRateHz === undefined) {
    errors.push("DEEPGRAM_SAMPLE_RATE_HZ must be a positive integer.");
  }
  if (deepgramChannels === undefined) {
    errors.push("DEEPGRAM_CHANNELS must be a positive integer.");
  }
  if (deepgramTimeoutMs === undefined) {
    errors.push("DEEPGRAM_TIMEOUT_MS must be a positive integer.");
  }
  if (realtimePersistence === undefined) {
    errors.push("DOKEZA_REALTIME_PERSISTENCE must be memory or postgres.");
  }
  if (env.DATABASE_URL !== undefined && databaseUrl === undefined) {
    errors.push("DATABASE_URL must be a postgres connection URL.");
  }
  if (realtimePersistence === "postgres" && databaseUrl === undefined) {
    errors.push("DATABASE_URL is required when DOKEZA_REALTIME_PERSISTENCE is postgres.");
  }
  if (databasePoolMax === undefined) {
    errors.push("DATABASE_POOL_MAX must be a positive integer.");
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
    contentLoggingAllowed === undefined ||
    authIssuer === undefined ||
    authAudience === undefined ||
    authSigningSecret === undefined ||
    apiTokenTtlSeconds === undefined ||
    realtimeTokenTtlSeconds === undefined ||
    developmentAuthEnabled === undefined ||
    deepgramEndpoint === undefined ||
    deepgramModel === undefined ||
    deepgramLanguage === undefined ||
    deepgramInterimResults === undefined ||
    deepgramPunctuate === undefined ||
    deepgramSmartFormat === undefined ||
    deepgramEncoding === undefined ||
    deepgramSampleRateHz === undefined ||
    deepgramChannels === undefined ||
    deepgramTimeoutMs === undefined ||
    realtimePersistence === undefined ||
    databasePoolMax === undefined ||
    (realtimePersistence === "postgres" && databaseUrl === undefined)
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
      auth: {
        issuer: authIssuer,
        audience: authAudience,
        signingSecret: authSigningSecret,
        apiTokenTtlSeconds,
        realtimeTokenTtlSeconds,
        developmentAuthEnabled,
      },
      telemetry: {
        enabled: telemetryEnabled,
        otlpEndpoint,
        tracesSampleRate,
        contentLoggingAllowed,
      },
      providers: {
        stt: {
          provider: "deepgram",
          deepgram: createDeepgramConfig({
            apiKey:
              deepgramApiKey !== undefined && deepgramApiKey.length > 0
                ? deepgramApiKey
                : undefined,
            endpoint: deepgramEndpoint,
            model: deepgramModel,
            language: deepgramLanguage,
            interimResults: deepgramInterimResults,
            punctuate: deepgramPunctuate,
            smartFormat: deepgramSmartFormat,
            encoding: deepgramEncoding,
            sampleRateHz: deepgramSampleRateHz,
            channels: deepgramChannels,
            timeoutMs: deepgramTimeoutMs,
          }),
        },
        llm: "openai",
        embeddings: "openai",
      },
      retentionDefaults: {
        individual: "7_days",
        team: "30_days",
        enterprise: "30_days",
      },
      database: {
        realtimePersistence,
        ...(databaseUrl === undefined ? {} : { url: databaseUrl }),
        poolMax: databasePoolMax,
      },
    },
    errors: [],
  };
}
