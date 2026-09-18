/**
 * Live check for one installed server: the same `initialize` handshake an MCP
 * client sends when it starts, so `polli mcp status --verify` reports what the
 * client will actually see instead of only what the config file says.
 */
export type VerifyOutcome = "ok" | "unauthorized" | "invalid" | "unreachable";

export interface VerifyResult {
    outcome: VerifyOutcome;
    /** Server name from the handshake, present when the outcome is `ok`. */
    serverName?: string;
    /** Status code or transport error, for the non-ok outcomes. */
    detail?: string;
}

/** The part of `Response` this check needs, so tests can stand in for it. */
export interface HttpResponse {
    ok: boolean;
    status: number;
    text(): Promise<string>;
}

/** And the part of `RequestInit` it sends, for the same reason. */
export interface HttpRequest {
    method: string;
    headers: Record<string, string>;
    body: string;
}

export type FetchLike = (
    url: string,
    init: HttpRequest,
) => Promise<HttpResponse>;

export interface VerifyOptions {
    fetchImpl?: FetchLike;
}

/** First request of a session; the Pollinations servers are stateless. */
const INITIALIZE = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "polli", version: "1.0.0" },
    },
};

const defaultFetch: FetchLike = (url, init) =>
    fetch(url, init) as unknown as Promise<HttpResponse>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

/** Streamable HTTP answers with JSON, or with SSE frames that carry JSON. */
const readRpc = (text: string): unknown => {
    const trimmed = text.trim();
    if (trimmed === "") return null;
    try {
        return JSON.parse(trimmed);
    } catch {
        // Not a plain JSON body: look at the `data:` frames instead.
    }
    for (const line of trimmed.split("\n")) {
        const payload = line.startsWith("data:") ? line.slice(5).trim() : "";
        if (payload === "") continue;
        try {
            return JSON.parse(payload);
        } catch {
            // Skip frames that are not JSON, e.g. keep-alive comments.
        }
    }
    return null;
};

const serverNameOf = (message: unknown): string | undefined => {
    if (!isRecord(message) || !isRecord(message.result)) return undefined;
    const info = message.result.serverInfo;
    if (!isRecord(info) || typeof info.name !== "string") return undefined;
    return info.name;
};

/** Handshake against one server URL, with the key the client was given. */
export const verifyServer = async (
    url: string,
    secret: string | null,
    options: VerifyOptions = {},
): Promise<VerifyResult> => {
    const send = options.fetchImpl ?? defaultFetch;
    try {
        const response = await send(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json, text/event-stream",
                ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
            },
            body: JSON.stringify(INITIALIZE),
        });
        if (response.status === 401 || response.status === 403) {
            return {
                outcome: "unauthorized",
                detail: `HTTP ${response.status}: the key was rejected`,
            };
        }
        if (!response.ok) {
            return { outcome: "invalid", detail: `HTTP ${response.status}` };
        }
        const message = readRpc(await response.text());
        if (message === null) {
            return { outcome: "invalid", detail: "no JSON-RPC response" };
        }
        if (isRecord(message) && message.error !== undefined) {
            return { outcome: "invalid", detail: "server returned an error" };
        }
        return { outcome: "ok", serverName: serverNameOf(message) };
    } catch (error) {
        return {
            outcome: "unreachable",
            detail: error instanceof Error ? error.message : String(error),
        };
    }
};

const VERIFY_LABELS: Record<VerifyOutcome, string> = {
    ok: "ok",
    unauthorized: "key rejected",
    invalid: "bad response",
    unreachable: "unreachable",
};

/** One line of a verify table: what the server answered, in words. */
export const describeVerify = (result: VerifyResult) => {
    if (result.outcome === "ok") {
        return result.serverName ? `ok (${result.serverName})` : "ok";
    }
    const label = VERIFY_LABELS[result.outcome];
    return `${label}${result.detail ? `: ${result.detail}` : ""}`;
};
