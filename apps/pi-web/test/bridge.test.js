import assert from "node:assert/strict";
import test from "node:test";
import {
    BridgeAuthError,
    BridgeSession,
    CAPS,
    createValidator,
    executeRequest,
    FrameCodec,
} from "../src/bridgeHost.js";

const ADMISSION = { runId: "run-1", keyGen: 7, apiKey: "sk_admission" };
const validEnvelope = () => ({
    id: "123e4567-e89b-42d3-a456-426614174000",
    runId: "run-1",
    keyGen: 7,
    url: "https://gen.pollinations.ai/v1/chat/completions",
    method: "POST",
    body: "{}",
});

let idCounter = 0;
const nextId = () =>
    `123e4567-e89b-42d3-a456-42661417${String(idCounter++).padStart(4, "0")}`;

function makeTransport() {
    const sent = [];
    let handler = () => {};
    return {
        sent,
        terminated: false,
        send: async (frame) => sent.push(frame),
        onFrame: (cb) => {
            handler = cb;
        },
        emit: (bytes) => handler(bytes),
        terminate: async () => {
            // simulate async termination
            await Promise.resolve();
            // marked after await so tests can observe the call
            this.terminated = true;
        },
    };
}

function responseWithBody(
    chunks,
    { status = 200, contentType = "application/json" } = {},
) {
    let i = 0;
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: new Map([["content-type", contentType]]),
        body: {
            getReader: () => ({
                read: async () =>
                    i < chunks.length
                        ? { done: false, value: chunks[i++] }
                        : { done: true },
                cancel: async () => {},
            }),
        },
    };
}

function makeSession(overrides = {}) {
    const transport = makeTransport();
    const session = new BridgeSession({
        transport,
        fetchImpl: async () =>
            responseWithBody([new TextEncoder().encode("hi")]),
        ...overrides,
    });
    return { session, transport };
}

// --- FrameCodec

test("codec round-trips frames and splits partial writes", () => {
    const codec = new FrameCodec();
    const a = codec.encode({ hello: "world" });
    const b = codec.encode({ n: 2 });
    assert.deepEqual(codec.push(a.subarray(0, 3)), []);
    const frames = codec.push(new Uint8Array([...a.subarray(3), ...b]));
    assert.deepEqual(frames, [{ hello: "world" }, { n: 2 }]);
});

test("codec dies on oversize announcement before payload accumulation", () => {
    const codec = new FrameCodec(16);
    const head = new Uint8Array(4);
    new DataView(head.buffer).setUint32(0, 17, false);
    assert.throws(() => codec.push(head), /too large/);
    assert.equal(codec.dead, true);
    assert.throws(() => codec.push(new Uint8Array(8)), /dead/);
});

test("codec dies on invalid JSON and stays dead", () => {
    const codec = new FrameCodec();
    const payload = new TextEncoder().encode("not-json");
    const frame = new Uint8Array(4 + payload.length);
    new DataView(frame.buffer).setUint32(0, payload.length, false);
    frame.set(payload, 4);
    assert.throws(() => codec.push(frame), /not valid JSON/);
    assert.equal(codec.dead, true);
});

test("frame exactly at the cap is accepted", () => {
    const codec = new FrameCodec(16);
    const payload = new Uint8Array(4 + 16);
    new DataView(payload.buffer).setUint32(0, 16, false);
    payload.set(new TextEncoder().encode('"01234567890123"'), 4);
    assert.deepEqual(codec.push(payload), ["01234567890123"]);
});

// --- validator

test("validator accepts a well-formed envelope", () => {
    assert.equal(createValidator(ADMISSION)(validEnvelope()), null);
});

test("validator rejects bad origin, path, method, id, stale admission", () => {
    const v = createValidator(ADMISSION);
    const bad = (patch) => v({ ...validEnvelope(), ...patch });
    assert.match(
        bad({ url: "https://evil.example.com/v1/chat/completions" }),
        /origin/,
    );
    assert.match(
        bad({ url: "https://gen.pollinations.ai/v1/images/generations" }),
        /path/,
    );
    assert.match(bad({ method: "DELETE" }), /method/);
    assert.match(bad({ id: "not-a-uuid" }), /id/);
    assert.match(bad({ runId: "old-run" }), /admission/);
    assert.match(bad({ keyGen: 6 }), /admission/);
});

test("validator caps the body in UTF-8 bytes, not string length", () => {
    const v = createValidator(ADMISSION);
    const almost = "ü".repeat(CAPS.bodyBytes); // 2 bytes each -> over cap
    assert.match(v({ ...validEnvelope(), body: almost }), /body too large/);
    assert.match(
        v({ ...validEnvelope(), body: "x".repeat(CAPS.bodyBytes + 1) }),
        /body too large/,
    );
});

// --- executeRequest

test("executor sends only host headers and never forwards guest auth", async () => {
    let seen = null;
    const fetchImpl = async (url, opts) => {
        seen = { url, opts };
        return responseWithBody([new TextEncoder().encode('{"ok":true}')]);
    };
    const envelope = validEnvelope();
    envelope.headers = { authorization: "Bearer stolen", cookie: "x" };
    const result = await executeRequest(envelope, {
        fetchImpl,
        apiKey: "sk_real",
    });
    assert.equal(seen.opts.headers.authorization, "Bearer sk_real");
    assert.equal(seen.opts.headers["content-type"], "application/json");
    assert.equal(Object.keys(seen.opts.headers).length, 2);
    assert.equal(seen.opts.redirect, "error");
    assert.equal(result.status, 200);
    assert.equal(new TextDecoder().decode(result.body), '{"ok":true}');
});

test("executor counts raw response bytes incrementally and aborts over cap", async () => {
    const big = new Uint8Array(CAPS.responseBytes + 1);
    const fetchImpl = async () => responseWithBody([big]);
    await assert.rejects(
        executeRequest(validEnvelope(), { fetchImpl, apiKey: "k" }),
        /response too large/,
    );
});

test("executor maps 401/403 to BridgeAuthError with a bounded snippet", async () => {
    const fetchImpl = async () =>
        responseWithBody([new TextEncoder().encode("x".repeat(10000))], {
            status: 401,
        });
    await assert.rejects(
        executeRequest(validEnvelope(), { fetchImpl, apiKey: "k" }),
        (err) => {
            assert.ok(err instanceof BridgeAuthError);
            assert.ok(err.message.length < 1000, "snippet must be bounded");
            return true;
        },
    );
});

// --- BridgeSession lifecycle

test("queued-after-stop is never fetched; late response ignored", async () => {
    let fetches = 0;
    const { session, transport } = makeSession({
        fetchImpl: async () => {
            fetches += 1;
            return responseWithBody([new Uint8Array(0)]);
        },
    });
    session.openAdmission(ADMISSION);
    session.closeAdmission(); // stop: admission closed before the request arrives
    const codec = new FrameCodec();
    await session._onBytes(
        codec.encode({ type: "request", envelope: validEnvelope() }),
    );
    assert.equal(fetches, 0);
    assert.equal(transport.sent.length, 0); // not even an error reply
});

test("happy path round-trips a mocked model call with the admission-bound key", async () => {
    let usedKey = null;
    const { session, transport } = makeSession({
        fetchImpl: async (_url, opts) => {
            usedKey = opts.headers.authorization;
            return responseWithBody([new TextEncoder().encode("hi")]);
        },
    });
    session.openAdmission(ADMISSION);
    const codec = new FrameCodec();
    await session._onBytes(
        codec.encode({ type: "request", envelope: validEnvelope() }),
    );
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(transport.sent.length, 1);
    assert.equal(transport.sent[0].status, 200);
    assert.equal(atob(transport.sent[0].bodyB64), "hi");
    assert.equal(usedKey, "Bearer sk_admission"); // bound at admission, not at execution
});

test("reconnect with a different keyGen cannot answer old requests", async () => {
    let fetches = 0;
    const { session, transport } = makeSession({
        fetchImpl: async () => {
            fetches += 1;
            return responseWithBody([new Uint8Array(0)]);
        },
    });
    session.openAdmission(ADMISSION);
    session.openAdmission({ runId: "run-2", keyGen: 8, apiKey: "sk_new" }); // reconnect
    const codec = new FrameCodec();
    await session._onBytes(
        codec.encode({ type: "request", envelope: validEnvelope() }),
    ); // stale pair
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(fetches, 0);
    assert.match(
        JSON.parse(atob(transport.sent[0].bodyB64)).error,
        /admission/,
    );
});

test("duplicate request ids are rejected, concurrency counts real work", async () => {
    let resolveFetch;
    const gate = new Promise((r) => {
        resolveFetch = r;
    });
    let fetches = 0;
    const { session, transport } = makeSession({
        fetchImpl: async () => {
            fetches += 1;
            await gate;
            return responseWithBody([new Uint8Array(0)]);
        },
    });
    session.openAdmission(ADMISSION);
    const codec = new FrameCodec();
    const dup = validEnvelope();
    await session._onBytes(codec.encode({ type: "request", envelope: dup }));
    await session._onBytes(codec.encode({ type: "request", envelope: dup })); // same id again
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(fetches, 1, "duplicate id must not execute twice");
    assert.equal(transport.sent.length, 1);
    assert.equal(transport.sent[0].status, 409);
    resolveFetch();
});

test("in-flight completion after stop is dropped and never fires auth callbacks", async () => {
    let resolveFetch;
    const gate = new Promise((r) => {
        resolveFetch = r;
    });
    let authErrors = 0;
    const { session, transport } = makeSession({
        fetchImpl: async () => {
            await gate;
            return responseWithBody([new TextEncoder().encode("nope")], {
                status: 401,
            });
        },
        onAuthError: () => {
            authErrors += 1;
        },
    });
    session.openAdmission(ADMISSION);
    const codec = new FrameCodec();
    await session._onBytes(
        codec.encode({ type: "request", envelope: validEnvelope() }),
    );
    await new Promise((r) => setTimeout(r, 10));
    session.closeAdmission(); // stop while the request is in flight
    resolveFetch(); // ...and the 401 arrives after the stop
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(
        transport.sent.length,
        0,
        "late response must not be delivered",
    );
    assert.equal(authErrors, 0, "stale 401 must not clear a reconnected key");
});

test("malformed ids never reach the transport", async () => {
    const { session, transport } = makeSession();
    session.openAdmission(ADMISSION);
    const codec = new FrameCodec();
    const evil = { ...validEnvelope(), id: 'x"; rm -rf /; echo "' };
    await session._onBytes(codec.encode({ type: "request", envelope: evil }));
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(transport.sent.length, 0);
});

test("protocol error closes admission and terminates the transport", async () => {
    let terminated = false;
    const transport = {
        sent: [],
        send: async () => {},
        onFrame: () => {},
        terminate: async () => {
            terminated = true;
        },
    };
    let protocolErrors = 0;
    const session = new BridgeSession({
        transport,
        fetchImpl: async () => responseWithBody([new Uint8Array(0)]),
        onProtocolError: () => {
            protocolErrors += 1;
        },
    });
    session.openAdmission(ADMISSION);
    const head = new Uint8Array(4);
    new DataView(head.buffer).setUint32(0, CAPS.frameBytes + 1, false);
    await session._onBytes(head);
    assert.equal(protocolErrors, 1);
    assert.equal(terminated, true);
    assert.equal(session.admission, null);
});

test("oversize announcements get a bounded 413 when admission is open", async () => {
    const { session, transport } = makeSession();
    session.openAdmission(ADMISSION);
    const codec = new FrameCodec();
    await session._onBytes(codec.encode({ type: "oversize", id: nextId() }));
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(transport.sent.length, 1);
    assert.equal(transport.sent[0].status, 413);
});

test("send queue overflow closes admission and terminates the channel", async () => {
    let terminated = 0;
    let protocolErrors = 0;
    const gate = new Promise(() => {}); // never resolves: first send jams the queue
    const transport = {
        sent: [],
        send: () => gate,
        onFrame: () => {},
        terminate: async () => {
            terminated += 1;
        },
    };
    const session = new BridgeSession({
        transport,
        fetchImpl: async () => responseWithBody([new Uint8Array(0)]),
        onProtocolError: () => {
            protocolErrors += 1;
        },
    });
    session.openAdmission(ADMISSION);
    // jam the serialized queue past the cap with well-formed oversize
    // replies (fire-and-forget, exactly like the frame loop does)
    for (let i = 0; i < 70; i++)
        session._handleOversize({ type: "oversize", id: crypto.randomUUID() });
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(terminated, 1);
    assert.equal(protocolErrors, 1);
    assert.equal(session.admission, null);
});
