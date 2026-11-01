import assert from "node:assert/strict";
import { test } from "node:test";
import { inflateSync } from "node:zlib";
import {
    brokenStreams,
    dueProbes,
    hasChatProbeMarker,
    imageProbeRequest,
    imageProbeResult,
    nextImageOperation,
    nextProbeAt,
    parseChatStream,
    recordProbe,
    streamKey,
    textProbeResult,
} from "./probes.js";

const HOUR = 3_600_000;

// Ported from operations/community-monitor/probe-schedule.test.mjs.
test("failures back off across restarts, cap below seven days, and fallback success resets the budget", () => {
    let now = Date.parse("2026-09-21T00:00:00Z");
    let previous;
    assert.equal(nextProbeAt(previous), 0);
    for (const hours of [8, 16, 32, 64, 128, 144, 144, 144]) {
        previous = JSON.parse(
            JSON.stringify(
                recordProbe(previous, {
                    timestamp: now,
                    ok: false,
                    status: 502,
                    operation: "edit",
                }),
            ),
        );
        assert.equal(nextProbeAt(previous), now + hours * HOUR);
        now = nextProbeAt(previous);
    }
    previous = recordProbe(previous, {
        timestamp: now,
        ok: true,
        modelUsed: "community/o/fallback",
        operation: "edit",
    });
    assert.equal(previous.failures, 0);
    assert.equal(nextProbeAt(previous), now + 4 * HOUR);
    assert.equal(previous.operation, "edit");
    for (const status of [402, "ERR", "INVALID"]) {
        previous = recordProbe(previous, {
            timestamp: now,
            ok: false,
            status,
            operation: "edit",
        });
        assert.equal(previous.failures, 0);
        assert.equal(nextProbeAt(previous), now + 4 * HOUR);
    }
    // A broken stream is a failure, like a 5xx.
    previous = recordProbe(previous, { timestamp: now, status: "PROTOCOL" });
    assert.equal(nextProbeAt(previous), now + 8 * HOUR);
    // Turned away by gen: the failures stay, the interval runs from it.
    previous = recordProbe(previous, {
        timestamp: now + HOUR,
        status: 402,
        refused: true,
    });
    assert.equal(previous.failures, 1);
    assert.equal(nextProbeAt(previous), now + HOUR + 8 * HOUR);
});

const text = (name, health, extra) => ({
    name,
    category: "text",
    community: true,
    health: health === undefined ? undefined : { success_rate: health },
    ...extra,
});
const traffic = (model, ok, errors5xx = 0, errors4xx = 0) => ({
    model,
    is_rollup: 1,
    total_requests: ok + errors5xx + errors4xx,
    status_2xx: ok,
    errors_5xx: errors5xx,
    errors_4xx: errors4xx,
});

test("probes community text and image proxies at 80% health or less, without real traffic, or at 80% success or less in 4h", () => {
    const now = Date.parse("2026-11-01T00:00:00Z");
    const catalog = [
        text("community/o/weak", 80),
        text("community/o/healthy", 81),
        text("community/o/quiet", 100),
        text("community/o/refused", 100),
        text("community/o/failing", 0),
        // No sample: busy with real traffic, so not due.
        { ...text("community/o/unsampled"), health: { success_rate: null } },
        text("community/o/backoff", 10),
        // Healthy in the catalog, failing in the last 4 hours.
        text("community/o/slipping", 92),
        text("community/o/edge", 95),
        // Rescued by its fallback: those are successes.
        text("community/o/rescued", 95),
        // Final 4xx are left out of its success.
        text("community/o/refusing", 95),
        text("community/o/agent", 10, { agent: true }),
        text("community/o/voice", 10, { category: "audio" }),
        { name: "openai", category: "text", health: { success_rate: 10 } },
        {
            name: "community/o/image",
            category: "image",
            community: true,
        },
    ];
    const rows = [
        traffic("community/o/weak", 10),
        traffic("community/o/healthy", 10),
        // Only 4xx: callers refused, not real traffic for the model.
        traffic("community/o/refused", 0, 0, 30),
        traffic("community/o/failing", 0, 12),
        traffic("community/o/unsampled", 5),
        traffic("community/o/slipping", 1, 4),
        traffic("community/o/edge", 4, 1),
        {
            ...traffic("community/o/rescued", 9, 1),
            fallback_rescues: 9,
        },
        traffic("community/o/refusing", 5, 0, 20),
        // A route row is not the model's total.
        { ...traffic("community/o/quiet", 10), is_rollup: 0 },
    ];
    const schedule = {
        "community/o/backoff": { lastAt: now - 7 * HOUR, failures: 1 },
        "community/o/weak": { lastAt: now - 4 * HOUR, failures: 0 },
    };
    assert.deepEqual(
        dueProbes(catalog, rows, schedule, now).map((m) => m.name),
        [
            "community/o/weak",
            "community/o/quiet",
            "community/o/refused",
            "community/o/failing",
            "community/o/slipping",
            "community/o/edge",
            "community/o/image",
        ],
    );
    // An hour later the backed-off model is due again.
    assert.ok(
        dueProbes(catalog, rows, schedule, now + HOUR).some(
            (m) => m.name === "community/o/backoff",
        ),
    );
});

// Ported from operations/community-monitor/chat-stream.test.mjs.
const content = 'data: {"choices":[{"delta":{"content":"ok-marker"}}]}\n\n';
const usage = { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 };
const counts = `data: ${JSON.stringify({ choices: [], usage })}\n\n`;
const done = "data: [DONE]\n\n";

test("reports missing usage even after a successful-looking answer", () => {
    const error =
        'data: {"error":{"code":"usage_missing","message":"internal diagnostic"}}\n\n';
    for (const newline of ["\n", "\r\n"]) {
        assert.deepEqual(
            parseChatStream(
                (content + counts + error).replaceAll("\n", newline),
            ),
            {
                content: "ok-marker",
                protocolError:
                    "stream returned usage_missing: missing or invalid token usage",
                errorCode: "usage_missing",
            },
        );
    }
});

test("rejects finish_reason error and preserves its diagnostic even after text", () => {
    const result = parseChatStream(
        `${content}data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "error", error: { code: 429, message: "Provider quota exhausted" } }] })}\n\n${done}`,
    );
    assert.equal(result.protocolError, "stream ended with finish_reason=error");
    assert.equal(result.errorCode, "429");
});

test("accepts marker case changes but still requires the nonce in final content", () => {
    const marker = "ok-a1b2c3d4";
    for (const response of [
        marker,
        "Ok-a1b2c3d4",
        "OK-A1B2C3D4",
        `<think>Thinking</think>\n${marker}`,
    ]) {
        assert.equal(hasChatProbeMarker(response, marker), true);
    }
    for (const response of [
        undefined,
        "ok-wrong123",
        "ok",
        `<think>${marker}</think>`,
        `<thought>${marker}`,
        `<THINK>${marker}`,
    ]) {
        assert.equal(hasChatProbeMarker(response, marker), false);
    }
});

test("preserves healthy streams and existing non-error validation", () => {
    assert.deepEqual(parseChatStream(content + counts + done), {
        content: "ok-marker",
    });
    for (const [body, error] of [
        [`data: {}\n\n${done}`, "stream event is missing a choices array"],
        [`data: null\n\n${done}`, "stream event is missing a choices array"],
        [`data: {broken}\n\n${done}`, "stream contained invalid JSON"],
        [content + counts, "stream is missing [DONE]"],
        [content + done + counts, "stream contained data after [DONE]"],
    ]) {
        assert.equal(parseChatStream(body).protocolError, error);
    }
});

test("rejects an error event even if it includes choices", () => {
    assert.equal(
        parseChatStream(
            `${content}data: {"choices":[],"error":{"code":"usage_missing"}}\n\n${done}`,
        ).protocolError,
        "stream returned usage_missing: missing or invalid token usage",
    );
});

test("a text probe passes only with the marker in a valid stream", () => {
    const answer = (body, init) =>
        textProbeResult(new Response(body, init), body, "ok-marker");
    assert.deepEqual(answer(content + counts + done), {
        refused: false,
        ok: true,
        status: 200,
        protocolError: undefined,
        errorCode: undefined,
        modelUsed: null,
        requestId: null,
    });
    const other = 'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n';
    assert.equal(answer(other + counts + done).status, "INVALID");
    const broken = answer(content + counts, {
        headers: { "x-model-used": "community/o/a", "x-request-id": "r1" },
    });
    assert.equal(broken.ok, false);
    assert.equal(broken.status, "PROTOCOL");
    assert.equal(broken.protocolError, "stream is missing [DONE]");
    assert.equal(broken.modelUsed, "community/o/a");
    assert.equal(broken.requestId, "r1");
    // An HTTP error is its status, never a broken stream.
    const refused = answer('{"error":{"code":"BAD_GATEWAY"}}', { status: 502 });
    assert.equal(refused.status, 502);
    assert.equal(refused.protocolError, undefined);
    assert.equal(refused.refused, false);
});

test("gen turning the probe key away is a refusal, not the model's answer", () => {
    // Gen's balance notice: a chat reply ending in its own sentence.
    const notice = `data: ${JSON.stringify({ choices: [{ delta: { content: "Please top up, then try again.\n\nIf this isn’t your Pollinations account, contact whoever runs the app or service you’re using." } }] })}\n\n`;
    const body = notice + counts + done;
    const result = textProbeResult(new Response(body), body, "ok-marker");
    assert.equal(result.refused, true);
    assert.equal(result.status, "INVALID");
    for (const status of [402, 403]) {
        const refused = textProbeResult(
            new Response("{}", { status }),
            "{}",
            "x",
        );
        assert.equal(refused.refused, true);
    }
});

// Ported from operations/community-monitor/image-probe.test.mjs.
const model = { name: "owner/image", input_modalities: ["text", "image"] };

test("alternates advertised edits with generation without adding requests", () => {
    assert.equal(nextImageOperation(model), "edit");
    assert.equal(nextImageOperation(model, "generate"), "edit");
    assert.equal(nextImageOperation(model, "edit"), "generate");
    for (const input_modalities of [undefined, ["text"]]) {
        assert.equal(nextImageOperation({ input_modalities }), "generate");
        assert.equal(
            nextImageOperation({ input_modalities }, "edit"),
            "generate",
        );
    }
});

test("generation keeps the unique marker, default size, and one-image limit", () => {
    const request = imageProbeRequest(model, "fresh-marker", "generate");
    assert.equal(request.requestPath, "/v1/images/generations");
    assert.deepEqual(request.body, {
        model: model.name,
        prompt: "A plain test card labeled fresh-marker",
        n: 1,
        response_format: "b64_json",
    });
});

test("edits use a complete 512px RGB PNG and a cache-busted edit instruction", () => {
    const { requestPath, body } = imageProbeRequest(
        model,
        "fresh-marker",
        "edit",
    );
    assert.equal(requestPath, "/v1/images/edits");
    assert.equal(body.model, model.name);
    assert.equal(body.n, 1);
    assert.match(body.prompt, /Change the black square to blue.*fresh-marker/);
    assert.equal(body.size, undefined);
    assert.match(body.image, /^data:image\/png;base64,/);
    const png = Buffer.from(body.image.split(",")[1], "base64");
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(png.readUInt32BE(16), 512);
    assert.equal(png.readUInt32BE(20), 512);
    assert.equal(png[24], 8); // bit depth
    assert.equal(png[25], 2); // RGB
    const idatLength = png.readUInt32BE(33);
    const pixels = inflateSync(png.subarray(41, 41 + idatLength));
    assert.equal(pixels.length, 512 * (512 * 3 + 1));
    assert.equal(png.subarray(-8, -4).toString(), "IEND");
});

test("a fallback's image is still a success", () => {
    const image = imageProbeRequest(model, "marker", "edit").body.image.split(
        ",",
    )[1];
    const body = JSON.stringify({ data: [{ b64_json: image }] });
    for (const served of [model.name, "owner/fallback-image", null]) {
        const result = imageProbeResult(
            new Response(body, {
                headers: served ? { "x-model-used": served } : {},
            }),
            body,
        );
        assert.equal(result.ok, true);
    }
});

test("an image error is its status; only 402 and 403 are gen turning the key away", () => {
    for (const [status, error] of [
        [
            400,
            {
                message:
                    "Community image endpoint responded 400: Missing model parameter",
                code: "BAD_REQUEST",
                details: {
                    upstreamStatus: 400,
                    upstreamBody: "private upstream body",
                },
            },
        ],
        [
            500,
            { message: "Image edit failed", details: { upstreamStatus: 500 } },
        ],
        [402, { message: "Insufficient pollen", code: "PAYMENT_REQUIRED" }],
        [403, { message: "Not allowed", code: "FORBIDDEN" }],
        [400, { message: "Invalid image", code: "invalid_image_url" }],
    ]) {
        const body = JSON.stringify({ error });
        const result = imageProbeResult(new Response(body, { status }), body);
        assert.equal(result.ok, false);
        assert.equal(result.status, status);
        assert.equal(result.refused, status === 402 || status === 403);
        assert.equal(
            JSON.stringify(result).includes("private upstream body"),
            false,
        );
    }
});

test("invalid image bodies remain failures even when a fallback answered 200", () => {
    for (const body of [
        "not json",
        "null",
        '{"data":[]}',
        '{"data":[{"b64_json":"dGlueQ=="}]}',
        '{"data":[{"b64_json":"%%% not base64 %%%"}]}',
    ]) {
        const result = imageProbeResult(
            new Response(body, {
                headers: { "x-model-used": "owner/fallback-image" },
            }),
            body,
        );
        assert.equal(result.ok, false);
        assert.equal(result.status, "INVALID");
    }
});

// Broken streams: Thomas's duty 2b.
const T0 = Date.parse("2026-11-01T00:00:00Z");
const DAY = 24 * HOUR;
const MISSING_DONE = "stream is missing [DONE]";
const result = (model, extra) => ({
    model,
    category: "text",
    status: "PROTOCOL",
    protocolError: MISSING_DONE,
    errorCode: null,
    modelUsed: model,
    ...extra,
});
const A = "community/o/a";

test("a broken stream is due a warning on its second fresh probe in a row", () => {
    let state = brokenStreams({}, [result(A)], T0);
    assert.deepEqual(state.due, []);
    // Another model probed, or none: A keeps its streak.
    state = brokenStreams(
        state,
        [
            result("community/o/b", {
                ok: true,
                status: 200,
                protocolError: undefined,
            }),
        ],
        T0,
    );
    assert.deepEqual(state.streaks[A], { error: MISSING_DONE, streak: 1 });
    state = brokenStreams(state, [result(A)], T0 + 8 * HOUR);
    assert.deepEqual(state.due, [
        { model: A, error: MISSING_DONE, code: null, streak: 2 },
    ]);
});

test("a different result ends the streak", () => {
    for (const other of [
        { ok: true, status: 200, protocolError: undefined },
        { status: 502, protocolError: undefined },
        { protocolError: "stream contained invalid JSON" },
    ]) {
        let state = brokenStreams({}, [result(A)], T0);
        state = brokenStreams(state, [result(A, other)], T0);
        state = brokenStreams(state, [result(A)], T0);
        assert.deepEqual(state.due, []);
    }
});

test("a model and error told stay quiet for a day; a new error is told", () => {
    let state = brokenStreams({}, [result(A)], T0);
    state = brokenStreams(state, [result(A)], T0);
    state.told[streamKey(A, MISSING_DONE)] = T0;
    state = brokenStreams(state, [result(A)], T0 + DAY - 1);
    assert.deepEqual(state.due, []);
    state = brokenStreams(state, [result(A)], T0 + DAY);
    assert.equal(state.due.length, 1);
    // The day's quiet is per error: another broken stream is told at once.
    const json = "stream contained invalid JSON";
    state.told[streamKey(A, MISSING_DONE)] = T0 + DAY;
    state = brokenStreams(
        state,
        [result(A, { protocolError: json })],
        T0 + DAY,
    );
    state = brokenStreams(
        state,
        [result(A, { protocolError: json })],
        T0 + DAY,
    );
    assert.deepEqual(
        state.due.map((d) => d.error),
        [json],
    );
});

test("any code inside a broken stream is the provider's", () => {
    // Gen answers the probe key's own auth, balance and input failures
    // before the stream: an error event's code came from the provider.
    for (const errorCode of [
        "UNAUTHORIZED",
        "PAYMENT_REQUIRED",
        "BAD_REQUEST",
    ]) {
        const broken = result(A, {
            protocolError: "stream returned an error event",
            errorCode,
        });
        let state = brokenStreams({}, [broken], T0);
        state = brokenStreams(state, [broken], T0);
        assert.equal(state.due[0]?.code, errorCode);
    }
});

test("an image probe or a refused one leaves the streak alone", () => {
    let state = brokenStreams({}, [result(A)], T0);
    state = brokenStreams(
        state,
        [
            result(A, { category: "image", status: 502 }),
            result(A, {
                refused: true,
                status: "INVALID",
                protocolError: undefined,
            }),
        ],
        T0,
    );
    assert.deepEqual(state.streaks[A], { error: MISSING_DONE, streak: 1 });
    assert.deepEqual(state.due, []);
});

test("an answer from a fallback ends the streak, keeping the day's quiet", () => {
    for (const fallback of [
        { ok: true, status: 200, protocolError: undefined },
        // The fallback's own broken stream is not this model's.
        {},
    ]) {
        let state = brokenStreams({}, [result(A)], T0);
        state.told = { [streamKey("community/o/b", MISSING_DONE)]: T0 };
        state = brokenStreams(
            state,
            [result(A, { ...fallback, modelUsed: "community/o/fallback" })],
            T0,
        );
        assert.equal(state.streaks[A], undefined);
        assert.deepEqual(Object.keys(state.told), [
            streamKey("community/o/b", MISSING_DONE),
        ]);
        state = brokenStreams(state, [result(A)], T0);
        assert.deepEqual(state.due, []);
    }
});

test("a fallback's success resets the backoff, like a direct one", () => {
    const body = `${content}${counts}${done}`;
    const answer = textProbeResult(
        new Response(body, {
            headers: { "x-model-used": "community/o/fallback" },
        }),
        body,
        "ok-marker",
    );
    assert.equal(answer.ok, true);
    const previous = { lastAt: 0, failures: 3 };
    assert.equal(
        recordProbe(previous, { ...answer, timestamp: HOUR }).failures,
        0,
    );
});

test("one broken stream on three owners' models at once goes to the maintainers, not the owners", () => {
    const models = ["community/a/x", "community/b/y", "community/c/z"];
    let state = brokenStreams(
        {},
        models.map((m) => result(m)),
        T0,
    );
    assert.deepEqual(
        state.shared.map((f) => f.model),
        models,
    );
    assert.deepEqual(state.due, []);
    // Told to the maintainers: each model named.
    for (const m of models) state.told[streamKey(m, MISSING_DONE)] = T0;
    // Their second in a row, within the day, with too few owners probed to
    // be shared: a model told about is still not its owner's, but another
    // model with that error is.
    const other = "community/d/w";
    state = brokenStreams(state, [result(other)], T0);
    const two = brokenStreams(
        state,
        [models[0], other].map((m) => result(m)),
        T0 + 8 * HOUR,
    );
    assert.deepEqual(
        two.due.map((f) => f.model),
        [other],
    );
    assert.deepEqual(two.shared, []);
    state = brokenStreams(
        state,
        models.map((m) => result(m)),
        T0 + 8 * HOUR,
    );
    assert.deepEqual(state.due, []);
    assert.deepEqual(state.shared, []);
    // A day on, still broken for three owners: the maintainers again.
    state = brokenStreams(
        state,
        models.map((m) => result(m)),
        T0 + DAY,
    );
    assert.equal(state.shared.length, 3);
});

test("one broken stream on two owners' models goes to the owners", () => {
    const models = ["community/a/x", "community/a/w", "community/b/y"];
    let state = brokenStreams(
        {},
        models.map((m) => result(m)),
        T0,
    );
    assert.deepEqual(state.shared, []);
    state = brokenStreams(
        state,
        models.map((m) => result(m)),
        T0,
    );
    assert.deepEqual(
        state.due.map((f) => f.model),
        models,
    );
});

test("models not told yet go first, then those told longest ago", () => {
    const [x, y, z] = ["community/o/x", "community/o/y", "community/o/z"];
    const broken = [x, y, z].map((m) => result(m));
    let state = brokenStreams({}, broken, T0);
    state.told[streamKey(x, MISSING_DONE)] = T0 - 2 * DAY;
    state.told[streamKey(y, MISSING_DONE)] = T0 - 3 * DAY;
    state = brokenStreams(state, broken, T0);
    assert.deepEqual(
        state.due.map((f) => f.model),
        [z, y, x],
    );
    // When each was told is kept for a week.
    assert.equal(state.told[streamKey(y, MISSING_DONE)], T0 - 3 * DAY);
    state = brokenStreams(state, [], T0 + 5 * DAY);
    assert.deepEqual(Object.keys(state.told), []);
});
