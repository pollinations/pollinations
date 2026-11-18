import { readResponseText } from "../../shared/response-bytes.ts";

const ORIGIN = "https://api.dexscreener.com";
const MAX_BYTES = 1024 * 1024;

export async function fetchJson(url) {
    const parsed = new URL(url);
    if (parsed.origin !== ORIGIN)
        throw new Error("Only the public DexScreener API is supported.");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    let response;
    try {
        response = await fetch(parsed, {
            headers: {
                "User-Agent": "Pollinations-Solana-MCP/0.1 (hello@pollinations.ai)",
                Accept: "application/json",
            },
            redirect: "error",
            signal: controller.signal,
            cf: { cacheTtl: 10, cacheEverything: true },
        });
        if (!response.ok) {
            const retry = response.headers.get("retry-after");
            throw new Error(
                \`DexScreener returned HTTP \${response.status}\${response.status === 429 ? \`; rate limited, retry later\${retry ? \` (Retry-After: \${retry})\` : ""}\` : ""}.\`,
            );
        }
        const text = await readResponseText(
            response,
            MAX_BYTES,
            () => new Error("DexScreener response exceeds 1 MiB; narrow the query."),
        );
        return JSON.parse(text);
    } catch (error) {
        controller.abort();
        await response?.body?.cancel().catch(() => {});
        if (error?.name === "AbortError")
            throw new Error("DexScreener did not respond within 10 seconds; retry later.");
        throw error;
    } finally {
        clearTimeout(timer);
    }
}
