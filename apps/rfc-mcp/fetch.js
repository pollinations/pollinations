import { readResponseText } from "../../shared/response-bytes.ts";

// Only tool-owned fixed endpoints reach this helper, never caller URLs/headers.
export async function fetchText(url, accept = "application/json") {
    const response = await fetch(url, {
        method: "GET",
        headers: {
            Accept: accept,
            "User-Agent": "Pollinations-RFC/0.1 (hello@pollinations.ai)",
        },
        redirect: "manual",
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
                    "Upstream response exceeds 8 MiB; request a narrower section or query",
                ),
        );
    } finally {
        await response.body?.cancel();
    }
}

export async function fetchJson(url) {
    return JSON.parse(await fetchText(url, "application/json"));
}
