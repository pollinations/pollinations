import { getLogger } from "@logtape/logtape";
import { HTTPException } from "hono/http-exception";

// The bearer token travels in the Authorization HEADER, never in the URL or any
// logged field — keep it that way so logs are always safe to emit.
const log = getLogger(["enter", "tinybird"]);

/**
 * Thrown when Tinybird returns 429 (rate limit / vCPU budget exceeded). This is
 * transient, so read-only usage endpoints should degrade gracefully rather than
 * surface it as a 5xx with the raw upstream message.
 */
export class TinybirdRateLimitError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "TinybirdRateLimitError";
    }
}

export async function fetchTinybirdRows<T>(
    origin: string,
    path: string,
    token: string,
    params: Record<string, string | undefined>,
): Promise<T[]> {
    const url = new URL(path, origin);
    for (const [key, value] of Object.entries(params)) {
        if (value) {
            url.searchParams.set(key, value);
        }
    }

    // Log the request (pipe + params + host) BEFORE the call. The URL is safe to
    // log: the token is in the Authorization header, not the query string.
    const startedAt = Date.now();
    // debug level: fetchTinybirdRows is shared by high-traffic usage/earnings
    // endpoints too, so keep the per-call request/response lines off the default
    // info stream (errors below stay at error). Callers that need per-quest
    // visibility log their own info lines.
    log.debug("TINYBIRD_REQUEST: pipe={pipe} host={host} params={params}", {
        pipe: path,
        host: url.host,
        params: Object.fromEntries(url.searchParams.entries()),
    });

    const response = await fetch(url.toString(), {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });
    const durationMs = Date.now() - startedAt;

    if (!response.ok) {
        const errorText = await response.text();
        const message = `Tinybird error: ${response.status} ${errorText || "(empty response)"}`;
        log.error(
            "TINYBIRD_ERROR: pipe={pipe} status={status} durationMs={durationMs} body={body}",
            {
                pipe: path,
                status: response.status,
                durationMs,
                // Truncate the upstream body so a verbose error page can't flood logs.
                body: (errorText || "(empty response)").slice(0, 500),
            },
        );
        if (response.status === 429) {
            throw new TinybirdRateLimitError(message);
        }
        throw new Error(message);
    }

    const body = (await response.json()) as { data: T[] };
    const rows = body.data;
    // Log the row count the PIPE returned (before any caller-side filtering), so
    // "pipe returned N but caller matched 0" is diagnosable from the logs.
    log.debug(
        "TINYBIRD_RESPONSE: pipe={pipe} status={status} durationMs={durationMs} rows={rows}",
        {
            pipe: path,
            status: response.status,
            durationMs,
            rows: rows.length,
        },
    );
    return rows;
}

export function requireTinybirdReadToken(env: CloudflareBindings): string {
    if (!env.TINYBIRD_READ_TOKEN) {
        throw new HTTPException(500, {
            message: "Tinybird read token is not configured",
        });
    }
    return env.TINYBIRD_READ_TOKEN;
}
