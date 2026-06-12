export type EnvironmentName = "local" | "test" | "preview" | "staging" | "production";
export type RetentionDefault = "7_days" | "30_days" | "1_year";

export interface DokezaConfig {
  environment: EnvironmentName;
  serviceName: string;
  port: number;
  logLevel: "debug" | "info" | "warn" | "error";
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
  "production"
]);

const logLevels = new Set<DokezaConfig["logLevel"]>([
  "debug",
  "info",
  "warn",
  "error"
]);

function readEnvironment(value: string | undefined): EnvironmentName | undefined {
  if (value === undefined) {
    return "local";
  }
  return environments.has(value as EnvironmentName) ? value as EnvironmentName : undefined;
}

function readLogLevel(value: string | undefined): DokezaConfig["logLevel"] | undefined {
  if (value === undefined) {
    return "info";
  }
  return logLevels.has(value as DokezaConfig["logLevel"]) ? value as DokezaConfig["logLevel"] : undefined;
}

function readPort(value: string | undefined): number | undefined {
  if (value === undefined) {
    return 3000;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : undefined;
}

export function parseConfig(env: NodeJS.ProcessEnv, serviceName: string): ConfigParseResult {
  const errors: string[] = [];
  const environment = readEnvironment(env.DOKEZA_ENV);
  const port = readPort(env.PORT);
  const logLevel = readLogLevel(env.LOG_LEVEL);

  if (environment === undefined) {
    errors.push("DOKEZA_ENV must be local, test, preview, staging, or production.");
  }
  if (port === undefined) {
    errors.push("PORT must be an integer from 1 to 65535.");
  }
  if (logLevel === undefined) {
    errors.push("LOG_LEVEL must be debug, info, warn, or error.");
  }
  if (serviceName.trim().length === 0) {
    errors.push("serviceName is required.");
  }

  if (errors.length > 0 || environment === undefined || port === undefined || logLevel === undefined) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    config: {
      environment,
      serviceName,
      port,
      logLevel,
      providers: {
        stt: "deepgram",
        llm: "openai",
        embeddings: "openai"
      },
      retentionDefaults: {
        individual: "7_days",
        team: "30_days",
        enterprise: "30_days"
      }
    },
    errors: []
  };
}
