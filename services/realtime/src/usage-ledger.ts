import type { LiveSuggestionUsage } from "@dokeza/ai-orchestrator";
import { and, eq, sql } from "drizzle-orm";
import { usageEvents, withWorkspaceTransaction, type Database } from "@dokeza/db";
import { createTelemetryEvent, type TelemetryEvent } from "@dokeza/telemetry";

export interface UsagePricing {
  inputMicrousdPerMillionTokens?: number;
  outputMicrousdPerMillionTokens?: number;
}

export interface LiveSuggestionUsageWriteInput {
  workspaceId: string;
  sessionId: string;
  requestId: string;
  actorUserId: string;
  usage: LiveSuggestionUsage;
}

export interface UsageLedgerRecord extends LiveSuggestionUsage {
  workspaceId: string;
  sessionId: string;
  requestId: string;
  actorUserId: string;
  feature: "live_suggestion";
  estimatedCostMicrousd?: number;
  costEstimateStatus: "priced" | "unpriced";
  createdAt: string;
}

export interface UsageWriteResult {
  status: "recorded";
  estimatedCostMicrousd?: number;
  telemetry: TelemetryEvent[];
}

export interface UsageLedger {
  recordLiveSuggestionUsage(input: LiveSuggestionUsageWriteInput): Promise<UsageWriteResult>;
  getSessionEstimatedCostMicrousd(
    workspaceId: string,
    sessionId: string,
  ): Promise<number | undefined>;
}

export class InMemoryUsageLedger implements UsageLedger {
  private readonly records = new Map<string, UsageLedgerRecord>();
  private readonly pricing: UsagePricing;
  private readonly now: () => Date;

  constructor(pricing: UsagePricing = {}, now: () => Date = () => new Date()) {
    this.pricing = pricing;
    this.now = now;
  }

  async recordLiveSuggestionUsage(input: LiveSuggestionUsageWriteInput): Promise<UsageWriteResult> {
    const cost = estimateUsageCostMicrousd(input.usage, this.pricing);
    const key = usageKey(input.workspaceId, input.sessionId, input.requestId);
    const existing = this.records.get(key);
    this.records.set(key, {
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      requestId: input.requestId,
      actorUserId: input.actorUserId,
      feature: "live_suggestion",
      ...input.usage,
      ...(cost === undefined ? {} : { estimatedCostMicrousd: cost }),
      costEstimateStatus: cost === undefined ? "unpriced" : "priced",
      createdAt: existing?.createdAt ?? this.now().toISOString(),
    });
    return usageWriteResult(input, cost);
  }

  async getSessionEstimatedCostMicrousd(
    workspaceId: string,
    sessionId: string,
  ): Promise<number | undefined> {
    if (!hasPricing(this.pricing)) {
      return undefined;
    }
    return this.getSnapshot(workspaceId, sessionId).reduce(
      (total, record) => total + (record.estimatedCostMicrousd ?? 0),
      0,
    );
  }

  getSnapshot(workspaceId: string, sessionId: string): UsageLedgerRecord[] {
    return [...this.records.values()].filter(
      (record) => record.workspaceId === workspaceId && record.sessionId === sessionId,
    );
  }
}

export interface PgUsageLedgerOptions {
  db: Database;
  pricing?: UsagePricing;
}

export class PgUsageLedger implements UsageLedger {
  private readonly db: Database;
  private readonly pricing: UsagePricing;

  constructor(options: PgUsageLedgerOptions) {
    this.db = options.db;
    this.pricing = options.pricing ?? {};
  }

  async recordLiveSuggestionUsage(input: LiveSuggestionUsageWriteInput): Promise<UsageWriteResult> {
    const cost = estimateUsageCostMicrousd(input.usage, this.pricing);
    await withWorkspaceTransaction(this.db, input.workspaceId, async (tx) => {
      const values = {
        provider: input.usage.provider,
        model: input.usage.model,
        promptVersion: input.usage.promptVersion,
        status: input.usage.status,
        tokenEstimationMethod: input.usage.tokenEstimationMethod,
        inputTokens: input.usage.inputTokens,
        outputTokens: input.usage.outputTokens,
        transcriptTokens: input.usage.transcriptTokens,
        sourceTokens: input.usage.sourceTokens,
        userPromptTokens: input.usage.userPromptTokens,
        systemTokens: input.usage.systemTokens,
        sourceCount: input.usage.sourceCount,
        estimatedCostMicrousd: cost ?? null,
        costEstimateStatus: cost === undefined ? "unpriced" : "priced",
        createdBy: input.actorUserId,
        updatedAt: new Date(),
      };
      await tx
        .insert(usageEvents)
        .values({
          workspaceId: input.workspaceId,
          meetingSessionId: input.sessionId,
          requestId: input.requestId,
          feature: "live_suggestion",
          ...values,
        })
        .onConflictDoUpdate({
          target: [
            usageEvents.workspaceId,
            usageEvents.meetingSessionId,
            usageEvents.requestId,
            usageEvents.feature,
          ],
          set: values,
        });
    });
    return usageWriteResult(input, cost);
  }

  async getSessionEstimatedCostMicrousd(
    workspaceId: string,
    sessionId: string,
  ): Promise<number | undefined> {
    if (!hasPricing(this.pricing)) {
      return undefined;
    }
    return withWorkspaceTransaction(this.db, workspaceId, async (tx) => {
      const rows = await tx
        .select({
          total: sql<number>`coalesce(sum(${usageEvents.estimatedCostMicrousd}), 0)::integer`,
        })
        .from(usageEvents)
        .where(
          and(
            eq(usageEvents.workspaceId, workspaceId),
            eq(usageEvents.meetingSessionId, sessionId),
          ),
        );
      return rows[0]?.total ?? 0;
    });
  }
}

export function estimateUsageCostMicrousd(
  usage: Pick<LiveSuggestionUsage, "inputTokens" | "outputTokens">,
  pricing: UsagePricing,
): number | undefined {
  if (!hasPricing(pricing)) {
    return undefined;
  }
  const numerator =
    usage.inputTokens * pricing.inputMicrousdPerMillionTokens +
    usage.outputTokens * pricing.outputMicrousdPerMillionTokens;
  return Math.ceil(numerator / 1_000_000);
}

function hasPricing(
  pricing: UsagePricing,
): pricing is Required<Pick<UsagePricing, keyof UsagePricing>> {
  return (
    pricing.inputMicrousdPerMillionTokens !== undefined &&
    pricing.outputMicrousdPerMillionTokens !== undefined
  );
}

function usageWriteResult(
  input: LiveSuggestionUsageWriteInput,
  cost: number | undefined,
): UsageWriteResult {
  return {
    status: "recorded",
    ...(cost === undefined ? {} : { estimatedCostMicrousd: cost }),
    telemetry: [
      createTelemetryEvent("realtime.usage_recorded", {
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        requestId: input.requestId,
        feature: "live_suggestion",
        provider: input.usage.provider,
        model: input.usage.model,
        templateVersion: input.usage.promptVersion,
        status: input.usage.status,
        inputTokenCount: input.usage.inputTokens,
        outputTokenCount: input.usage.outputTokens,
        ...(cost === undefined ? {} : { estimatedCostMicrousd: cost }),
        costEstimateStatus: cost === undefined ? "unpriced" : "priced",
      }),
    ],
  };
}

function usageKey(workspaceId: string, sessionId: string, requestId: string): string {
  return `${workspaceId}\0${sessionId}\0${requestId}`;
}
