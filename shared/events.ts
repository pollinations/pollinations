import type { Logger } from "@logtape/logtape";
import { removeUnset } from "./util.ts";

export type TinybirdErrorEvent = {
    timestamp: string;
    kind: "server_error";
    severity: "error";
    request_id?: string;
    environment?: string;
    route_path?: string;
    method?: string;
    status: number;
    duration_ms?: number;
    error_code?: string;
    error_class?: string;
    message?: string;
    stack?: string;
    upstream_host?: string;
    upstream_status?: number;
    upstream_body?: string;
    edge_colo?: string;
    upstream_headers?: string;
    model_requested?: string;
    resolved_model_requested?: string;
    request_inputs?: string;
    user_id?: string;
    user_tier?: string;
    api_key_id?: string;
};

export async function sendErrorEventToTinybird(
    event: TinybirdErrorEvent,
    tinybirdIngestUrl: string,
    tinybirdIngestToken: string,
    log: Logger,
): Promise<void> {
    const body = JSON.stringify(removeUnset(event));

    try {
        const response = await fetch(tinybirdIngestUrl, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${tinybirdIngestToken}`,
                "Content-Type": "application/x-ndjson",
            },
            body,
            signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) {
            log.warn("Tinybird error event ingest failed: status={status}", {
                status: response.status,
            });
        }
    } catch (error) {
        log.warn("Tinybird error event ingest failed: {error}", { error });
    }
}

export function getTinybirdDatasourceIngestUrl(
    referenceIngestUrl: string,
    datasourceName: string,
): string {
    const url = new URL(referenceIngestUrl);
    url.searchParams.set("name", datasourceName);
    return url.toString();
}
