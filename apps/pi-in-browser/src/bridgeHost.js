// Host side of the bridge: receives request frames from the guest pump,
// validates them against the allowlist, executes them with the real API
// key (which lives only on the trusted side), and streams response bytes
// back into the sandbox. Fail closed everywhere: a request that fails any
// check gets an error response, never an exception path around the caps.

import { GEN_BASE_URL } from "./piConfig.js";

export const ID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const MAX_CONCURRENT = 4;
const REQUEST_TIMEOUT_MS = 120000;
const MAX_REQ_BODY = 4 * 1024 * 1024;
const MAX_RESP_TOTAL = 32 * 1024 * 1024;

const ALLOWED_PATHS = new Set(["/v1/chat/completions", "/v1/models"]);

// Parses the length-prefixed frame stream coming from the pump's stdout.
export function createFrameParser(onFrame) {
    let buffer = new Uint8Array(0);
    return (chunk) => {
        const merged = new Uint8Array(buffer.length + chunk.length);
        merged.set(buffer);
        merged.set(chunk, buffer.length);
        buffer = merged;
        for (;;) {
            if (buffer.length < 4) return;
            const view = new DataView(
                buffer.buffer,
                buffer.byteOffset,
                buffer.byteLength,
            );
            const len = view.getUint32(0);
            if (len > MAX_REQ_BODY + 1024) {
                onFrame({ type: "fatal", reason: "frame too large" });
                return;
            }
            if (buffer.length < 4 + len) return;
            const payload = buffer.subarray(4, 4 + len);
            buffer = buffer.subarray(4 + len);
            try {
                onFrame(JSON.parse(new TextDecoder().decode(payload)));
            } catch {
                onFrame({ type: "invalid", reason: "unparseable frame" });
            }
        }
    };
}

export function validateEnvelope(envelope) {
    if (!envelope || typeof envelope !== "object") return null;
    if (typeof envelope.id !== "string" || !ID_RE.test(envelope.id))
        return null;
    if (typeof envelope.url !== "string") return null;
    let url;
    try {
        url = new URL(envelope.url);
    } catch {
        return null;
    }
    if (url.origin !== GEN_BASE_URL) return null;
    if (!ALLOWED_PATHS.has(url.pathname)) return null;
    const method =
        envelope.method === "POST"
            ? "POST"
            : envelope.method === "GET"
              ? "GET"
              : null;
    if (!method) return null;
    if (envelope.body != null && typeof envelope.body !== "string") return null;
    if (envelope.body && envelope.body.length > MAX_REQ_BODY) return null;
    return {
        id: envelope.id,
        url,
        method,
        body: envelope.body,
        headers: envelope.headers ?? {},
    };
}

// Bounded base64 encoder for streaming chunks back over pump stdin.
export function encodeChunk(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    return btoa(binary);
}

export function createBridgeHost({
    apiKey,
    sendFrame,
    fetchImpl = fetch,
    log = () => {},
}) {
    let active = 0;
    let respTotal = 0;

    async function respond(_id, frame) {
        sendFrame(frame);
    }

    async function failRequest(id, status, message) {
        await respond(id, {
            type: "head",
            id,
            status,
            statusText: message,
            headers: { "content-type": "text/plain" },
        });
        await respond(id, {
            type: "end",
            id,
            error: undefined,
        });
    }

    async function handle(envelope) {
        const valid = validateEnvelope(envelope);
        if (!valid) {
            if (typeof envelope?.id === "string") {
                await failRequest(envelope.id, 403, "forbidden");
            }
            log(`rejected envelope for ${envelope?.url ?? "unknown url"}`);
            return;
        }
        if (active >= MAX_CONCURRENT) {
            await failRequest(valid.id, 429, "too many concurrent requests");
            return;
        }
        active++;
        try {
            const controller = new AbortController();
            const timer = setTimeout(
                () => controller.abort(),
                REQUEST_TIMEOUT_MS,
            );
            const headers = {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`,
                ...(valid.headers["user-agent"]
                    ? { "user-agent": valid.headers["user-agent"] }
                    : {}),
            };
            const response = await fetchImpl(valid.url, {
                method: valid.method,
                headers,
                body: valid.body ?? undefined,
                signal: controller.signal,
            });
            clearTimeout(timer);
            log(
                `forwarded ${valid.method} ${valid.url.pathname} -> ${response.status}`,
            );

            await respond(valid.id, {
                type: "head",
                id: valid.id,
                status: response.status,
                statusText: response.statusText ?? "",
                headers: Object.fromEntries(response.headers.entries()),
            });

            let total = 0;
            let capped = false;
            if (response.body) {
                for await (const chunk of response.body) {
                    if (
                        total + chunk.length > MAX_RESP_TOTAL ||
                        respTotal + chunk.length > MAX_RESP_TOTAL * 4
                    ) {
                        capped = true;
                        break;
                    }
                    total += chunk.length;
                    respTotal += chunk.length;
                    await respond(valid.id, {
                        type: "chunk",
                        id: valid.id,
                        b64: encodeChunk(chunk),
                    });
                }
            }
            await respond(valid.id, {
                type: "end",
                id: valid.id,
                error: capped ? "response exceeded size cap" : undefined,
            });
        } catch (err) {
            await respond(valid.id, {
                type: "end",
                id: valid.id,
                error: String(err?.message ?? err).slice(0, 500),
            });
        } finally {
            active--;
        }
    }

    return {
        // Entry point for frames decoded from the pump's stdout.
        async onFrame(frame) {
            if (frame?.type === "request") {
                await handle(frame.envelope);
            } else if (
                frame?.type === "invalid" ||
                frame?.type === "oversize"
            ) {
                log(`pump reported ${frame.type} for ${frame.id}`);
                if (typeof frame?.id === "string") {
                    await failRequest(frame.id, 413, "request too large");
                }
            } else if (frame?.type === "fatal") {
                log(`pump fatal: ${frame.reason}`);
            }
        },
    };
}
