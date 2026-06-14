import { readFile } from "node:fs/promises";

const CONFIG_PATH = new URL("../../apps/desktop/release.desktop.json", import.meta.url);
const REQUIRED_CHANNELS = ["stable", "beta"];
const REQUIRED_UPDATER_VARS = ["TAURI_SIGNING_PRIVATE_KEY", "TAURI_SIGNING_PRIVATE_KEY_PASSWORD"];
const REQUIRED_WINDOWS_VARS = ["WINDOWS_CERTIFICATE_PATH", "WINDOWS_CERTIFICATE_PASSWORD"];
const REQUIRED_MACOS_VARS = [
  "APPLE_ID",
  "APPLE_ID_PASSWORD",
  "APPLE_TEAM_ID",
  "APPLE_SIGNING_IDENTITY",
  "APPLE_NOTARIZATION_KEYCHAIN_PROFILE",
];
const FORBIDDEN_VALUE_MARKERS = [
  "BEGIN PRIVATE KEY",
  "BEGIN CERTIFICATE",
  "TAURI_SIGNING_PRIVATE_KEY=",
  "WINDOWS_CERTIFICATE_PASSWORD=",
  "APPLE_ID_PASSWORD=",
];

const config = JSON.parse(await readFile(CONFIG_PATH, "utf8"));

const failures = [
  ...validateChannels(config),
  ...validateRequiredEnvironment(config),
  ...validatePolicy(config),
  ...validateNoSecretMaterial(config),
];

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`release-config: ${failure}`);
  }
  process.exit(1);
}

console.log("release-config: ok");

function validateChannels(value) {
  const failures = [];
  const channels = value.channels;

  if (!isRecord(channels)) {
    return ["channels must be an object"];
  }

  for (const channel of REQUIRED_CHANNELS) {
    const channelConfig = channels[channel];

    if (!isRecord(channelConfig)) {
      failures.push(`channels.${channel} must be an object`);
      continue;
    }

    if (typeof channelConfig.identifier !== "string" || channelConfig.identifier.length === 0) {
      failures.push(`channels.${channel}.identifier must be a non-empty string`);
    }

    if (
      typeof channelConfig.updaterEndpoint !== "string" ||
      !channelConfig.updaterEndpoint.startsWith("https://")
    ) {
      failures.push(`channels.${channel}.updaterEndpoint must use https`);
    }

    for (const token of ["{{target}}", "{{arch}}", "{{current_version}}"]) {
      if (
        typeof channelConfig.updaterEndpoint !== "string" ||
        !channelConfig.updaterEndpoint.includes(token)
      ) {
        failures.push(`channels.${channel}.updaterEndpoint must include ${token}`);
      }
    }

    if (channelConfig.rollbackMode !== "previous_known_good") {
      failures.push(`channels.${channel}.rollbackMode must be previous_known_good`);
    }
  }

  return failures;
}

function validateRequiredEnvironment(value) {
  const requiredEnvironment = value.requiredEnvironment;

  if (!isRecord(requiredEnvironment)) {
    return ["requiredEnvironment must be an object"];
  }

  return [
    ...validateStringArray(
      "requiredEnvironment.updater",
      requiredEnvironment.updater,
      REQUIRED_UPDATER_VARS,
    ),
    ...validateStringArray(
      "requiredEnvironment.windows",
      requiredEnvironment.windows,
      REQUIRED_WINDOWS_VARS,
    ),
    ...validateStringArray(
      "requiredEnvironment.macos",
      requiredEnvironment.macos,
      REQUIRED_MACOS_VARS,
    ),
  ];
}

function validateStringArray(path, actual, expected) {
  const failures = [];

  if (!Array.isArray(actual)) {
    return [`${path} must be an array`];
  }

  for (const expectedValue of expected) {
    if (!actual.includes(expectedValue)) {
      failures.push(`${path} must include ${expectedValue}`);
    }
  }

  for (const actualValue of actual) {
    if (typeof actualValue !== "string" || actualValue.length === 0) {
      failures.push(`${path} values must be non-empty strings`);
    }
  }

  return failures;
}

function validatePolicy(value) {
  const policy = value.policy;

  if (!isRecord(policy)) {
    return ["policy must be an object"];
  }

  const failures = [];

  if (policy.deferInstallDuringActiveSession !== true) {
    failures.push("policy.deferInstallDuringActiveSession must be true");
  }
  if (policy.requireSignedUpdaterArtifacts !== true) {
    failures.push("policy.requireSignedUpdaterArtifacts must be true");
  }
  if (policy.requireSignedInstallers !== true) {
    failures.push("policy.requireSignedInstallers must be true");
  }
  if (policy.privateKeyMaterialCommitted !== false) {
    failures.push("policy.privateKeyMaterialCommitted must be false");
  }

  return failures;
}

function validateNoSecretMaterial(value) {
  const serialized = JSON.stringify(value);

  return FORBIDDEN_VALUE_MARKERS.filter((marker) => serialized.includes(marker)).map(
    (marker) => `config must not contain secret material marker ${marker}`,
  );
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
