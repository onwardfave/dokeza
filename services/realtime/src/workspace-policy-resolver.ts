import type { DokezaConfig } from "@dokeza/config";
import { withWorkspaceTransaction, workspacePolicies, type Database } from "@dokeza/db";
import { eq } from "drizzle-orm";

import type { TranscriptRetentionMode } from "./transcript-retention-policy.js";

export interface RealtimeWorkspacePolicy {
  screenContextAllowed: boolean;
  cloudSttAllowed: boolean;
  cloudLlmAllowed: boolean;
  directProviderSttAllowed: boolean;
  retentionMode: TranscriptRetentionMode;
  maxLocalAudioBufferMs: number;
}

export interface WorkspacePolicyResolver {
  resolve(workspaceId: string): Promise<RealtimeWorkspacePolicy>;
}

const DEFAULT_MAX_LOCAL_AUDIO_BUFFER_MS = 300_000;

export function createDefaultRealtimeWorkspacePolicy(
  retentionMode: TranscriptRetentionMode,
): RealtimeWorkspacePolicy {
  return {
    screenContextAllowed: false,
    cloudSttAllowed: true,
    cloudLlmAllowed: true,
    directProviderSttAllowed: false,
    retentionMode,
    maxLocalAudioBufferMs: DEFAULT_MAX_LOCAL_AUDIO_BUFFER_MS,
  };
}

export class StaticWorkspacePolicyResolver implements WorkspacePolicyResolver {
  constructor(private readonly policy: RealtimeWorkspacePolicy) {}

  async resolve(_workspaceId: string): Promise<RealtimeWorkspacePolicy> {
    return { ...this.policy };
  }
}

export class PgWorkspacePolicyResolver implements WorkspacePolicyResolver {
  constructor(
    private readonly db: Database,
    private readonly defaultPolicy: RealtimeWorkspacePolicy,
  ) {}

  async resolve(workspaceId: string): Promise<RealtimeWorkspacePolicy> {
    if (workspaceId.trim().length === 0) {
      throw new Error("workspace_policy_scope_required");
    }

    return withWorkspaceTransaction(this.db, workspaceId, async (tx) => {
      const rows = await tx
        .select({
          retentionMode: workspacePolicies.retentionMode,
          cloudSttAllowed: workspacePolicies.cloudSttAllowed,
          cloudLlmAllowed: workspacePolicies.cloudLlmAllowed,
          screenContextAllowed: workspacePolicies.screenContextAllowed,
          directProviderSttAllowed: workspacePolicies.directProviderSttAllowed,
        })
        .from(workspacePolicies)
        .where(eq(workspacePolicies.workspaceId, workspaceId))
        .limit(2);

      if (rows.length === 0) {
        return { ...this.defaultPolicy };
      }
      if (rows.length !== 1) {
        throw new Error("workspace_policy_ambiguous");
      }

      const row = rows[0];
      if (row === undefined) {
        throw new Error("workspace_policy_unavailable");
      }

      return {
        screenContextAllowed: row.screenContextAllowed,
        cloudSttAllowed: row.cloudSttAllowed,
        cloudLlmAllowed: row.cloudLlmAllowed,
        directProviderSttAllowed: row.directProviderSttAllowed,
        retentionMode: readRetentionMode(row.retentionMode),
        maxLocalAudioBufferMs: this.defaultPolicy.maxLocalAudioBufferMs,
      };
    });
  }
}

export function createDefaultPolicyFromConfig(config: DokezaConfig): RealtimeWorkspacePolicy {
  return createDefaultRealtimeWorkspacePolicy(config.retentionDefaults.individual);
}

function readRetentionMode(value: string): TranscriptRetentionMode {
  if (
    value === "live_only" ||
    value === "local_only" ||
    value === "7_days" ||
    value === "30_days" ||
    value === "1_year" ||
    value === "indefinite"
  ) {
    return value;
  }

  throw new Error("workspace_policy_retention_invalid");
}
