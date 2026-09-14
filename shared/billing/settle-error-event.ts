import type { Logger } from "@logtape/logtape";
import {
    getTinybirdDatasourceIngestUrl,
    sendErrorEventToTinybird,
    type TinybirdErrorEvent,
} from "@shared/events.ts";
import type { SettlementError } from "./track-helpers.ts";

const SETTLEMENT_MESSAGES: Record<SettlementError, string> = {
    api_key_reconciliation:
        "API key budget reconciliation failed after committed debit",
    dev_credit: "Dev markup credit failed after committed debit",
    community_reward_credit:
        "Community model reward credit failed after committed debit",
};

export type SettlementErrorEventInput = {
    settlementError: SettlementError;
    requestId: string;
    environment?: string;
    requestPath?: string;
    method: string;
    startTime: Date;
    endTime: Date;
    modelRequested?: string;
    resolvedModelRequested?: string;
    userId?: string;
    userTier?: string;
    apiKeyId?: string;
    edgeColo?: string;
    requestInputs?: string;
    tinybirdIngestUrl: string;
    tinybirdIngestToken: string;
    log: Logger;
};

export async function emitSettlementErrorEvent(
    input: SettlementErrorEventInput,
): Promise<void> {
    const {
        settlementError,
        requestId,
        environment,
        requestPath,
        method,
        startTime,
        endTime,
        modelRequested,
        resolvedModelRequested,
        userId,
        userTier,
        apiKeyId,
        edgeColo,
        requestInputs,
        tinybirdIngestUrl,
        tinybirdIngestToken,
        log,
    } = input;

    const event: TinybirdErrorEvent = {
        timestamp: endTime.toISOString(),
        kind: "server_error",
        severity: "error",
        request_id: requestId,
        environment,
        route_path: requestPath,
        method,
        status: 200,
        duration_ms: endTime.getTime() - startTime.getTime(),
        error_class: "SettlementFailure",
        error_code: `settlement_${settlementError}`,
        message: SETTLEMENT_MESSAGES[settlementError],
        edge_colo: edgeColo,
        model_requested: modelRequested,
        resolved_model_requested: resolvedModelRequested,
        request_inputs: requestInputs,
        user_id: userId,
        user_tier: userTier,
        api_key_id: apiKeyId,
    };

    await sendErrorEventToTinybird(
        event,
        getTinybirdDatasourceIngestUrl(tinybirdIngestUrl, "error_event"),
        tinybirdIngestToken,
        log,
    );
}
