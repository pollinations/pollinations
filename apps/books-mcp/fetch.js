import { readResponseText } from "../../shared/response-bytes.ts";

// URLs are built by tools from fixed public API origins, never caller headers.
export async function fetchText(
    url,
    accept = "application/json",
    maxBytes = 512 * 1024,
) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    let response;
    try {
        response = await fetch(url, {
            headers: {
                "User-Agent": "Pollinations-Books/0.1 (hello@pollinations.ai)",
                Accept: accept,
            },
            redirect: "follow",
            signal: controller.signal,
        });
        if (!response.ok)
            throw new Error(
                `${new URL(url).hostname} returned HTTP ${response.status}${response.status === 429 ? "; rate limited, retry later" : ""}.`,
            );
        return await readResponseText(
            response,
            maxBytes,
            () =>
                new Error(
                    `Source response exceeds ${maxBytes / 1024} KiB; narrow the query.`,
                ),
        );
    } finally {
        controller.abort();
        clearTimeout(timer);
        await response?.body?.cancel().catch(() => {});
    }
}
export async function fetchJson(url) {
    return JSON.parse(await fetchText(url));
}
