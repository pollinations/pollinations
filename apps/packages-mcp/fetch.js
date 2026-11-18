import { readResponseText } from "../../shared/response-bytes.ts";

// Only tool-owned fixed endpoints reach this helper, never caller URLs/headers.
// `headers` is for fixed tool-owned headers a fixed endpoint requires
// (e.g. Snapcraft's Snap-Device-Series, Chocolatey's Atom Accept), never caller-supplied values.
export async function fetchText(url, body, headers) {
    const response = await fetch(url, {
        method: body === undefined ? "GET" : "POST",
        headers: {
            Accept: "application/json",
            "User-Agent": "Pollinations-Packages/0.1 (hello@pollinations.ai)",
            ...headers,
            ...(body === undefined
                ? {}
                : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "follow",
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
export async function fetchJson(url, body, headers) {
    return JSON.parse(await fetchText(url, body, headers));
}
