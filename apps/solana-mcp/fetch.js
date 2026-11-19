import { readResponseText } from "../../shared/response-bytes.ts";

const RPC_URL = "https://api.mainnet.solana.com";
const MAX_BYTES = 1024 * 1024;
const ALLOWED_METHODS = new Set([
    "getAccountInfo", "getTokenSupply", "getTokenLargestAccounts",
    "getSignaturesForAddress", "getTransaction",
]);
const CACHE_TTLS = {
    getAccountInfo: 15, getTokenSupply: 15, getTokenLargestAccounts: 15,
    getSignaturesForAddress: 3, getTransaction: 60,
};
const responseCache = new Map();
let requestId = 0;

export function clearRpcCache() { responseCache.clear(); }

export async function rpcCall(method, params) {
    if (!ALLOWED_METHODS.has(method))
        throw new Error("This Solana RPC method is not enabled.");
    const key = `${method}:${JSON.stringify(params)}`;
    const cached = responseCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    if (cached) responseCache.delete(key);

    requestId += 1;
    const body = JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    let response;
    try {
        response = await fetch(RPC_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body,
            redirect: "error",
            signal: controller.signal,
        });
        if (!response.ok) {
            const retry = response.headers.get("retry-after");
            throw new Error(
                `Solana public RPC returned HTTP ${response.status}${response.status === 429 ? `; rate limited, retry later${retry ? ` (Retry-After: ${retry})` : ""}` : ""}.`,
            );
        }
        const text = await readResponseText(
            response, MAX_BYTES,
            () => new Error("Solana RPC response exceeds 1 MiB; narrow the query."),
        );
        const payload = JSON.parse(text);
        if (payload.error) {
            const code = Number.isInteger(payload.error.code) ? payload.error.code : "unknown";
            const message = String(payload.error.message ?? "RPC error").slice(0, 180);
            throw new Error(`Solana RPC ${method} error ${code}: ${message}`);
        }
        const value = payload.result ?? null;
        responseCache.set(key, { value, expiresAt: Date.now() + (CACHE_TTLS[method] ?? 5) * 1000 });
        if (responseCache.size > 512) {
            const oldest = responseCache.keys().next().value;
            if (oldest) responseCache.delete(oldest);
        }
        return value;
    } catch (error) {
        controller.abort();
        await response?.body?.cancel().catch(() => {});
        if (error?.name === "AbortError")
            throw new Error("Solana public RPC did not respond within 10 seconds; retry later.");
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

export { RPC_URL };
