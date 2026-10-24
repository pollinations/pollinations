import { readResponseText } from "../../shared/response-bytes.ts";

// Only tool-owned fixed endpoints reach this helper, never caller URLs/headers.
export async function fetchText(url, body) {
    const response = await fetch(url, {
        method: body === undefined ? "GET" : "POST",
        headers: {
            Accept: "application/json",
            "User-Agent": "Pollinations-Packages/0.1 (hello@pollinations.ai)",
            ...(body === undefined
                ? {}
                : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "manual",
        // OSV may take 20 seconds before returning a continuation token.
        signal: AbortSignal.timeout(25000),
    });
    try {
        if (!response.ok)
            throw new Error(
                `${new URL(url).hostname} returned HTTP ${response.status}`,
            );
        return await readResponseText(
            response,
            8 * 1024 * 1024,
            () =>
                new Error(
                    "Upstream response exceeds 8 MiB; request a specific version or narrower query",
                ),
        );
    } finally {
        await response.body?.cancel();
    }
}
export async function fetchJson(url, body) {
    return JSON.parse(await fetchText(url, body));
}
