import { readResponseText } from "../../shared/response-bytes.ts";

// URLs are constructed by tools from the fixed Nager.Date origin, never caller headers.
export async function fetchText(url, accept = "application/json") {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    let response;
    try {
        response = await fetch(url, {
            headers: {
                "User-Agent":
                    "Pollinations-Holidays/0.1 (hello@pollinations.ai)",
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
            512 * 1024,
            () =>
                new Error("Source response exceeds 512 KiB; narrow the query."),
        );
    } catch (error) {
        // Stop reading a body we are abandoning so the socket is not left half-used.
        controller.abort();
        await response?.body?.cancel().catch(() => {});
        if (error?.name === "AbortError")
            throw new Error(
                "date.nager.at did not respond within 10 seconds; retry later.",
            );
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

export async function fetchJson(url) {
    const text = await fetchText(url);
    // Nager.Date replies 204 No Content for a year that has no listed holidays.
    if (!text.trim()) return null;
    return JSON.parse(text);
}
