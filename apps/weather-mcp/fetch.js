import { readResponseText } from "../../shared/response-bytes.ts";

const MAX_BYTES = 512 * 1024;
const USER_AGENT =
    "Pollinations-Weather/0.1 (+https://pollinations.ai; hello@pollinations.ai)";

// Open-Meteo is a fixed public host; the only caller input is a place name
// encoded into a query parameter, so no URL validation is needed here.
export async function getJson(url, signal = AbortSignal.timeout(10_000)) {
    const response = await fetch(url, {
        signal,
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!response.ok) {
        await response.body?.cancel();
        throw new Error(
            `${new URL(url).hostname} returned HTTP ${response.status}${response.status === 429 ? "; rate limited, try later" : ""}.`,
        );
    }
    try {
        const text = await readResponseText(
            response,
            MAX_BYTES,
            () => new Error("Upstream response exceeds 512 KiB."),
        );
        return JSON.parse(text);
    } catch (error) {
        if (error instanceof SyntaxError)
            throw new Error(`${new URL(url).hostname} returned non-JSON.`);
        throw error;
    } finally {
        await response.body?.cancel();
    }
}
