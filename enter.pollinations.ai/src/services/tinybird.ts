import { HTTPException } from "hono/http-exception";

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

    const response = await fetch(url.toString(), {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });

    if (!response.ok) {
        const errorText = await response.text();
        const message = `Tinybird error: ${response.status} ${errorText || "(empty response)"}`;
        if (response.status === 429) {
            throw new TinybirdRateLimitError(message);
        }
        throw new Error(message);
    }

    const data = (await response.json()) as { data: T[] };
    return data.data;
}

export function requireTinybirdReadToken(env: CloudflareBindings): string {
    if (!env.TINYBIRD_READ_TOKEN) {
        throw new HTTPException(500, {
            message: "Tinybird read token is not configured",
        });
    }
    return env.TINYBIRD_READ_TOKEN;
}
