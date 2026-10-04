// Trusted side of the guest<->host bridge. The guest is UNTRUSTED:
// - host constructs the URL, origin allowlist gen.pollinations.ai only
// - guest headers are never forwarded (host sends content-type + its own auth)
// - redirect: "error"; GET/POST only
// - caps: 4 MiB serialized envelope, 4 MiB body (UTF-8 bytes), 32 MiB
//   response counted incrementally on raw bytes
// - admission: envelope must carry the current runId + keyGen pair; the API
//   key is bound to the admission, not read at execution time
// All wire traffic is length-prefixed frames ([4-byte BE len][JSON]). A frame
// announcing more than FRAME_CAP bytes kills the channel permanently
// (fail closed): the codec refuses further input and the session terminates
// the transport instead of accumulating a poisoned buffer.

export const CAPS = {
    frameBytes: 4 * 1024 * 1024 + 1024, // envelope frame, cap + slack
    bodyBytes: 4 * 1024 * 1024,
    responseBytes: 32 * 1024 * 1024,
    maxConcurrent: 4,
    timeoutMs: 120000,
};

export const ALLOWED_ORIGIN = "https://gen.pollinations.ai";
export const ALLOWED_PATHS = ["/v1/chat/completions", "/v1/models", "/models"];

export const ID_RE = /^[0-9a-f-]{36}$/;
const MAX_PENDING_SENDS = 64;
const MAX_ADMITTED_IDS = 4096;

export class FrameCodec {
    constructor(cap = CAPS.frameBytes) {
        this.cap = cap;
        this.buf = new Uint8Array(0);
        this.dead = false;
    }
    encode(obj) {
        const payload = new TextEncoder().encode(JSON.stringify(obj));
        const out = new Uint8Array(4 + payload.length);
        new DataView(out.buffer).setUint32(0, payload.length, false);
        out.set(payload, 4);
        return out;
    }
    // Announced length is checked against the cap BEFORE payload bytes
    // accumulate; pending storage can never exceed cap + 4.
    push(bytes) {
        if (this.dead)
            throw new Error("bridge codec is dead after protocol error");
        // fast-path oversize check on the announced length of a fresh frame
        if (this.buf.length === 0 && bytes.length >= 4) {
            // buf only ever retains an incomplete frame, so an empty buffer
            // means these bytes start a fresh frame and announce its length
            const announced = new DataView(
                bytes.buffer,
                bytes.byteOffset,
            ).getUint32(0, false);
            if (announced > this.cap) {
                this.dead = true;
                throw new Error(
                    `bridge frame too large: ${announced} > ${this.cap}`,
                );
            }
        }
        const merged = new Uint8Array(this.buf.length + bytes.length);
        merged.set(this.buf);
        merged.set(bytes, this.buf.length);
        this.buf = merged;
        const frames = [];
        for (;;) {
            if (this.buf.length < 4) break;
            const len = new DataView(
                this.buf.buffer,
                this.buf.byteOffset,
            ).getUint32(0, false);
            if (len > this.cap) {
                this.dead = true;
                throw new Error(`bridge frame too large: ${len} > ${this.cap}`);
            }
            if (this.buf.length < 4 + len) break;
            let frame;
            try {
                frame = JSON.parse(
                    new TextDecoder().decode(this.buf.subarray(4, 4 + len)),
                );
            } catch {
                this.dead = true;
                throw new Error("bridge frame is not valid JSON");
            }
            frames.push(frame);
            this.buf = this.buf.subarray(4 + len);
        }
        return frames;
    }
}

export function createValidator({ runId, keyGen }) {
    return function validate(envelope) {
        if (!envelope || typeof envelope !== "object")
            return "envelope is not an object";
        if (envelope.runId !== runId || envelope.keyGen !== keyGen)
            return "stale or foreign admission";
        if (typeof envelope.id !== "string" || !ID_RE.test(envelope.id))
            return "bad request id";
        if (envelope.method !== "GET" && envelope.method !== "POST")
            return "method not allowed";
        let url;
        try {
            url = new URL(envelope.url);
        } catch {
            return "unparseable url";
        }
        if (url.origin !== ALLOWED_ORIGIN) return "origin not allowed";
        if (
            !ALLOWED_PATHS.some(
                (p) => url.pathname === p || url.pathname.startsWith(`${p}/`),
            )
        ) {
            return "path not allowed";
        }
        if (envelope.body != null) {
            if (typeof envelope.body !== "string")
                return "body must be a string";
            if (new TextEncoder().encode(envelope.body).length > CAPS.bodyBytes)
                return "body too large";
        }
        return null;
    };
}

export class BridgeAuthError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

// Executes one validated request. Key never leaves this function.
export async function executeRequest(envelope, { fetchImpl, apiKey, signal }) {
    const url = new URL(envelope.url); // already validated
    const resp = await fetchImpl(url.toString(), {
        method: envelope.method,
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
        },
        body: envelope.method === "POST" ? (envelope.body ?? "") : undefined,
        redirect: "error",
        signal,
    });
    if (resp.status === 401 || resp.status === 403) {
        // bounded diagnostic snippet - helps tell a dead key from an upstream hiccup
        let snippet = "";
        try {
            const reader = resp.body.getReader();
            let total = 0;
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                total += value.byteLength;
                if (total > 4096) {
                    await reader.cancel().catch(() => {});
                    break;
                }
                snippet += new TextDecoder().decode(value, { stream: true });
            }
        } catch {}
        throw new BridgeAuthError(
            resp.status,
            `key rejected: HTTP ${resp.status} ${snippet.slice(0, 300)}`.trim(),
        );
    }
    const reader = resp.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength; // raw bytes, counted as they arrive
        if (total > CAPS.responseBytes) {
            await reader.cancel().catch(() => {});
            throw new Error(
                `response too large: > ${CAPS.responseBytes} bytes`,
            );
        }
        chunks.push(value);
    }
    const body = new Uint8Array(total);
    let at = 0;
    for (const chunk of chunks) {
        body.set(chunk, at);
        at += chunk.length;
    }
    return {
        id: envelope.id,
        status: resp.status,
        headers: {
            "content-type":
                resp.headers.get("content-type") ?? "application/octet-stream",
        },
        body,
    };
}

function base64Encode(bytes) {
    let bin = "";
    for (let i = 0; i < bytes.length; i += 8192)
        bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(bin);
}

// Wires codec + validator + executor to an abstract transport and enforces
// the admission lifecycle (runId per Pi run, keyGen + key per key connect).
// transport: { send(frameObj): Promise, onFrame(cb), terminate(): Promise }
export class BridgeSession {
    constructor({ transport, fetchImpl, onAuthError, onProtocolError }) {
        this.transport = transport;
        this.fetchImpl = fetchImpl;
        this.onAuthError = onAuthError ?? (() => {});
        this.onProtocolError = onProtocolError ?? (() => {});
        this.codec = new FrameCodec();
        this.admission = null; // { runId, keyGen, apiKey }
        this.inFlight = new Map(); // id -> { controller, admission }
        this.admittedIds = new Set();
        // All transport sends (including rejection replies) go through one
        // serialized, length-capped queue: every send spawns guest shell
        // work, so an unbounded flood of 400/409/429 replies would exhaust
        // browser resources despite the maxConcurrent request cap.
        // Overflow fails closed: admission closed + channel terminated.
        this.sendChain = Promise.resolve();
        this.pendingSends = 0;
        this.transport.onFrame((bytes) => this._onBytes(bytes));
    }

    _guardedSend(frame) {
        if (this.pendingSends >= MAX_PENDING_SENDS) {
            this.closeAdmission();
            this.onProtocolError(new Error("bridge send queue overflow"));
            this.transport.terminate().catch(() => {});
            return Promise.resolve();
        }
        this.pendingSends += 1;
        const done = this.sendChain
            .then(() => this.transport.send(frame))
            .catch(() => {})
            .finally(() => {
                this.pendingSends -= 1;
            });
        this.sendChain = done;
        return done;
    }

    openAdmission({ runId, keyGen, apiKey }) {
        this.admission = { runId, keyGen, apiKey };
        this.validator = createValidator({ runId, keyGen });
    }

    // Stop: close admission first (queued-after-stop is never fetched),
    // then abort in-flight requests. Pending .req files are removed by the
    // caller. In-flight completions are generation-checked on arrival.
    closeAdmission() {
        this.admission = null;
        for (const { controller } of this.inFlight.values()) controller.abort();
    }

    async _onBytes(bytes) {
        let frames;
        try {
            frames = this.codec.push(bytes);
        } catch (err) {
            // fail closed: kill the channel, do not keep a poisoned buffer
            this.closeAdmission();
            this.onProtocolError(err);
            await this.transport.terminate().catch(() => {});
            return;
        }
        for (const frame of frames) {
            // fire-and-forget: requests must run concurrently (up to the cap),
            // errors surface through replies and callbacks
            if (frame?.type === "request")
                this._handleRequest(frame).catch(() => {});
            else if (frame?.type === "oversize")
                this._handleOversize(frame).catch(() => {});
        }
    }

    // Oversize announcements carry an id the pump never read; reject the
    // bounded way if the id is well-formed, otherwise ignore.
    async _handleOversize(frame) {
        if (typeof frame?.id !== "string" || !ID_RE.test(frame.id)) return;
        if (!this.admission) return;
        await this._guardedSend({
            type: "response",
            id: frame.id,
            status: 413,
            headers: { "content-type": "application/json" },
            bodyB64: base64Encode(
                new TextEncoder().encode(
                    JSON.stringify({ error: "bridge request too large" }),
                ),
            ),
        }).catch(() => {});
    }

    async _handleRequest(frame) {
        const rawId = frame.envelope?.id;
        // Never build a file-backed reply for a malformed id: the id is
        // interpolated into guest file paths, so it must match the strict
        // shape before any transport call.
        if (typeof rawId !== "string" || !ID_RE.test(rawId)) return;
        if (!this.admission) return; // admission closed: ignore silently
        const admission = this.admission; // pin generation for the whole request

        const reply = async (status, bodyText) => {
            await this._guardedSend({
                type: "response",
                id: rawId,
                status,
                headers: { "content-type": "application/json" },
                bodyB64: base64Encode(new TextEncoder().encode(bodyText)),
            });
        };

        const problem = this.validator(frame.envelope);
        if (problem) {
            await reply(
                400,
                JSON.stringify({ error: `bridge rejected: ${problem}` }),
            ).catch(() => {});
            return;
        }
        // duplicate ids would corrupt concurrency accounting and .resp files
        if (this.admittedIds.has(rawId)) {
            await reply(
                409,
                JSON.stringify({ error: "bridge duplicate request id" }),
            ).catch(() => {});
            return;
        }
        if (this.inFlight.size >= CAPS.maxConcurrent) {
            await reply(429, JSON.stringify({ error: "bridge busy" })).catch(
                () => {},
            );
            return;
        }
        this.admittedIds.add(rawId);
        if (this.admittedIds.size > MAX_ADMITTED_IDS) {
            this.admittedIds = new Set(
                [...this.admittedIds].slice(-MAX_ADMITTED_IDS / 2),
            );
        }

        const controller = new AbortController();
        this.inFlight.set(rawId, { controller, admission });
        const timer = setTimeout(() => controller.abort(), CAPS.timeoutMs);
        try {
            const result = await executeRequest(frame.envelope, {
                fetchImpl: this.fetchImpl,
                apiKey: admission.apiKey, // key bound to the admission
                signal: controller.signal,
            });
            if (this.admission !== admission) return; // stopped/reconnected mid-flight
            await this._guardedSend({
                type: "response",
                id: result.id,
                status: result.status,
                headers: result.headers,
                bodyB64: base64Encode(result.body),
            });
        } catch (err) {
            if (this.admission !== admission) return; // stale errors never fire callbacks
            if (err instanceof BridgeAuthError) this.onAuthError(err);
            const status = err instanceof BridgeAuthError ? err.status : 502;
            await reply(
                status,
                JSON.stringify({ error: String(err.message ?? err) }),
            ).catch(() => {});
        } finally {
            clearTimeout(timer);
            const tracked = this.inFlight.get(rawId);
            if (tracked?.admission === admission) this.inFlight.delete(rawId);
        }
    }
}
