// Probes of community models, ported from the retired community monitor
// (operations/community-monitor: probe.mjs, chat-stream.mjs, image-probe.mjs
// and probe-schedule.mjs). No Cloudflare imports, so it is testable with
// plain Node.
import { withTimeout } from "./delivery.js";
import { ownerOf } from "./rules.js";

const HOUR_MS = 60 * 60 * 1000;
const TEXT_TIMEOUT_MS = 45_000;
const IMAGE_TIMEOUT_MS = 150_000;

// Retry budget only: this state never decides model visibility or health.
// A model is probed again 4 hours after its last probe, doubling with each
// server or protocol failure up to 6 days.
export function nextProbeAt(previous) {
    if (!previous) return 0;
    return (
        previous.lastAt + Math.min(4 * 2 ** previous.failures, 144) * HOUR_MS
    );
}

// Success, including a fallback's, and inconclusive caller or probe errors
// reset the backoff. A probe gen turned away keeps the failures as they
// were: the interval still runs from it, so a model can't be probed more
// often by answering with gen's refusal.
export function recordProbe(previous, result) {
    const failures = previous?.failures ?? 0;
    const resets =
        result.ok ||
        result.status === "ERR" ||
        result.status === "INVALID" ||
        (typeof result.status === "number" && result.status < 500);
    return {
        lastAt: result.timestamp,
        failures: result.refused ? failures : resets ? 0 : failures + 1,
        operation: result.operation,
    };
}

// The community text and image proxies to probe now: public (gen's catalog
// lists no private model) and not agents, due by their backoff, and either
// at 80% catalog health or less, or without real traffic or at 80% final
// success or less in the last 4 hours. `rows` are gen's status rows for
// regular traffic over those 4 hours, which leaves the probes out, and
// legacy-API and other internal traffic too. A model's rollup counts
// final outcomes, so fallback rescues are successes; final 4xx say nothing
// of the model and are left out.
export function dueProbes(catalog, rows, schedule, now) {
    const recent = new Map(
        rows
            .filter((r) => r.is_rollup && r.total_requests > r.errors_4xx)
            .map((r) => [
                r.model,
                r.status_2xx / (r.total_requests - r.errors_4xx),
            ]),
    );
    return catalog.filter(
        (m) =>
            m.community &&
            !m.agent &&
            ["text", "image"].includes(m.category) &&
            now >= nextProbeAt(schedule[m.name]) &&
            ((m.health?.success_rate ?? 100) <= 80 ||
                !recent.has(m.name) ||
                recent.get(m.name) <= 0.8),
    );
}

// An error event's code, as text.
const codeOf = (error) =>
    error?.code == null ? undefined : String(error.code);

export function hasChatProbeMarker(content, marker) {
    if (typeof content !== "string") return false;
    const finalContent = content
        .replace(/<thought>[\s\S]*?<\/thought>/gi, "")
        .replace(/<think>[\s\S]*?<\/think>/gi, "");
    // Do not accept a copy of the marker from unfinished reasoning.
    return (
        !/<(?:thought|think)>/i.test(finalContent) &&
        finalContent.toLowerCase().includes(marker.toLowerCase())
    );
}

// A valid OpenAI-compatible stream: parseable JSON events with a `choices`
// array, exactly one terminal [DONE] and nothing after it. Never repairs,
// discards or reorders provider output.
export function parseChatStream(body) {
    let content = "";
    let done = false;
    let dataLines = [];
    let errorCode;

    const fail = (protocolError) => ({ content, protocolError, errorCode });
    const flushEvent = () => {
        if (!dataLines.length) return;
        const data = dataLines.join("\n");
        dataLines = [];
        if (data === "[DONE]") {
            done = true;
            return;
        }
        let chunk;
        try {
            chunk = JSON.parse(data);
        } catch {
            throw new Error("stream contained invalid JSON");
        }
        if (chunk?.error || !Array.isArray(chunk?.choices)) {
            errorCode = codeOf(chunk?.error);
            throw new Error(
                chunk?.error?.code === "usage_missing"
                    ? "stream returned usage_missing: missing or invalid token usage"
                    : chunk?.error
                      ? "stream returned an error event"
                      : "stream event is missing a choices array",
            );
        }
        for (const choice of chunk.choices) {
            if (choice?.finish_reason === "error") {
                errorCode = codeOf(choice.error);
                throw new Error("stream ended with finish_reason=error");
            }
            if (typeof choice?.delta?.content === "string") {
                content += choice.delta.content;
            }
        }
    };

    try {
        for (const line of body.split(/\r\n|\n|\r/)) {
            if (!line) {
                flushEvent();
                continue;
            }
            if (done) return fail("stream contained data after [DONE]");
            if (dataLines.includes("[DONE]")) {
                return fail("[DONE] was not terminated by a blank line");
            }
            if (line.startsWith(":")) continue;
            if (line.startsWith("data:")) {
                dataLines.push(line.slice(5).replace(/^ /, ""));
            }
        }
        if (dataLines.length) {
            return fail("stream ended with an unterminated SSE event");
        }
        if (!done) return fail("stream is missing [DONE]");
        return { content };
    } catch (err) {
        return fail(err.message);
    }
}

// A cache-busted chat request with a unique marker. No max_tokens, so
// reasoning models have room for their answer; the timeout is the bound.
export const textProbeRequest = (model, marker) => ({
    requestPath: "/v1/chat/completions",
    body: {
        model: model.name,
        messages: [{ role: "user", content: `Reply with exactly: ${marker}` }],
        stream: true,
        stream_options: { include_usage: true },
    },
});

// The sentence that ends gen's own answer when it refuses the key, for
// balance (402) or permission (403), as a chat reply on text routes
// (`NOT_YOUR_ACCOUNT` in gen's middleware/text-balance-notice.ts).
const REFUSAL = "contact whoever runs the app or service you";
const refusedStatus = (status) => status === 402 || status === 403;

// A text probe passes with the marker in the final answer of a valid
// stream. A broken stream is PROTOCOL; an answer without the marker is
// INVALID. `refused` is gen turning the probe key away before the model is
// called. `modelUsed` is the model that answered, from gen's header.
export function textProbeResult(response, body, marker) {
    const { content, protocolError, errorCode } = response.ok
        ? parseChatStream(body)
        : {};
    const marked = hasChatProbeMarker(content, marker);
    return {
        refused:
            refusedStatus(response.status) ||
            (!marked && Boolean(content?.includes(REFUSAL))),
        ok: response.ok && !protocolError && marked,
        status: protocolError
            ? "PROTOCOL"
            : response.ok && !marked
              ? "INVALID"
              : response.status,
        protocolError,
        errorCode,
        modelUsed: response.headers.get("x-model-used"),
        requestId: response.headers.get("x-request-id"),
    };
}

// 512x512 RGB PNG: a black square on white. No external host or user data.
const EDIT_IMAGE =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAIAAAB7GkOtAAAFpUlEQVR42u3VwQ0AMAgDscL+O9MleLRgjxBFuiwAVsoDwEoCACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAAACAIAAACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAAACACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAAACAIAAACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAAACACAAJgAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQBAAAAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQBAAAAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQBAAAAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQBAAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQBAAAAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQBAAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQBAAAAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQBAAAAQAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQBAAPhAMJqHIwAACACAAAAgAAAIAAACAIAAACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAAACAIAAACAAAAgAAAIAgAAAIAAACACAAAAgAAAIAAACAIAAACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAAACAIAAACAAAAgAAAIAgAAAIAAACAAAAgAgAAAIAAACAIAAACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAAACAIAAACAAAAgAAAIAgAAAIAAACAAAAgAgAAAIAAACAIAAACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAAACAIAAACAAAAgAAAIAgAAAIAAACAAAAgAgACYAEAAABAAAAQBAAAAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQBAAAAQAAAEAAABAEAAABAAAAQAAAEAEAAABAAAAQBAAAAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQBAAAAQAAAEAAABAEAAABAAAAQAAAEAEAAABAAAAQBAAAAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQBAAAAQAAAEgH7FaB6OAAAgAAACAIAAACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAAACAIAAACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAACAIAAACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAAACAIAAACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAIAAACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAAACAIAAACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAIAAACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAAACAIAAACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAIAAmABAAAAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQBAAAAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABABAAAAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQBAAAAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABABAAAAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQBAAAAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAAHnUBjSbeaqcV6PMAAAAASUVORK5CYII=";

// Models taking image input alternate edits and generations, starting
// with an edit; the others are only asked to generate.
export function nextImageOperation(model, previousOperation) {
    return model.input_modalities?.includes("image") &&
        previousOperation !== "edit"
        ? "edit"
        : "generate";
}

export function imageProbeRequest(model, marker, operation) {
    const edit = operation === "edit";
    return {
        requestPath: edit ? "/v1/images/edits" : "/v1/images/generations",
        body: {
            model: model.name,
            prompt: edit
                ? `Change the black square to blue. Add the label ${marker}.`
                : `A plain test card labeled ${marker}`,
            n: 1,
            ...(edit ? { image: EDIT_IMAGE } : { response_format: "b64_json" }),
        },
    };
}

// Bytes in base64 that decodes; 0 if it doesn't.
const decodedSize = (base64) => {
    try {
        return atob(base64).length;
    } catch {
        return 0;
    }
};

// An image probe passes with a real image in `b64_json`; a successful
// response without one is INVALID. A fallback's image is still a success.
export function imageProbeResult(response, body) {
    let parsed;
    try {
        parsed = JSON.parse(body);
    } catch {
        // An invalid successful body is reported as INVALID below.
    }
    const imageBase64 = parsed?.data?.[0]?.b64_json;
    const hasImage =
        typeof imageBase64 === "string" && decodedSize(imageBase64) > 100;
    return {
        ok: response.ok && hasImage,
        status: response.ok && !hasImage ? "INVALID" : response.status,
        refused: refusedStatus(response.status),
        requestId: response.headers.get("x-request-id"),
    };
}

// One probe of a community model through gen, with `key`. Image models
// alternate as above, from the operation in `previous`. The timeout covers
// the whole body read, so a stalled stream can't hang the batch.
export async function probe(gen, key, model, previous) {
    const timestamp = Date.now();
    const image = model.category === "image";
    const operation = image
        ? nextImageOperation(model, previous?.operation)
        : undefined;
    const marker = `${image ? "image" : "ok"}-${crypto.randomUUID().slice(0, 8)}`;
    const { requestPath, body } = image
        ? imageProbeRequest(model, marker, operation)
        : textProbeRequest(model, marker);
    const base = { model: model.name, category: model.category, operation };
    try {
        const result = await withTimeout(
            image ? IMAGE_TIMEOUT_MS : TEXT_TIMEOUT_MS,
            async (signal) => {
                const res = await fetch(`${gen}${requestPath}`, {
                    method: "POST",
                    headers: {
                        authorization: `Bearer ${key}`,
                        "content-type": "application/json",
                    },
                    body: JSON.stringify(body),
                    signal,
                });
                const text = await res.text();
                return image
                    ? imageProbeResult(res, text)
                    : textProbeResult(res, text, marker);
            },
        );
        return { ...base, timestamp, ...result };
    } catch {
        return { ...base, timestamp, ok: false, status: "ERR" };
    }
}

// Runs `task` over `items`, at most `size` at a time, as a worker pool:
// one slow probe never holds up the other slots.
export async function pool(items, size, task) {
    const results = [];
    let next = 0;
    await Promise.all(
        Array.from({ length: size }, async () => {
            while (next < items.length) {
                const i = next++;
                results[i] = await task(items[i]);
            }
        }),
    );
    return results;
}

// A warning told once stays quiet this long, for the same model and broken
// stream, the same stream broken for many owners, or the probe key refused.
export const QUIET_MS = 24 * 60 * 60 * 1000;
// One broken stream on models of this many owners at once points at gen,
// not at them: it goes to the maintainers as one incident.
const SHARED_OWNERS = 3;

// Broken streams from a batch of probe results. `streaks` keeps, per model,
// its provider's protocol error and how many fresh text probes in a row
// got it: a model not probed or refused keeps its streak, any other result
// ends it, an answer from a fallback too. `told` keeps when each warning
// was told; older than a day, it is dropped, unless the model's stream is
// still broken that way.
// - `due`: models at their second broken stream in a row, for their
//   owners, unless that model and error were told in the last day; told
//   longest ago first, so a card with no room for all leaves none out for
//   good.
// - `shared`: models whose error this batch found for 3 or more owners,
//   for the maintainers, unless that error was told to them in the last
//   day. The models they were told about are then quiet for their owners
//   too; another model with that error is its owner's.
export function brokenStreams({ streaks = {}, told = {} } = {}, results, now) {
    const next = { ...streaks };
    const recent = Object.fromEntries(
        Object.entries(told).filter(([, at]) => now - at < QUIET_MS),
    );
    const fresh = [];
    for (const r of results) {
        if (r.category !== "text" || r.refused) continue;
        const own = !r.modelUsed || r.modelUsed === r.model;
        const error = own && r.status === "PROTOCOL" ? r.protocolError : null;
        if (!error) {
            delete next[r.model];
            continue;
        }
        const streak =
            next[r.model]?.error === error ? next[r.model].streak + 1 : 1;
        next[r.model] = { error, streak };
        fresh.push({ model: r.model, error, code: r.errorCode, streak });
    }
    const owners = (error) =>
        new Set(
            fresh.filter((f) => f.error === error).map((f) => ownerOf(f.model)),
        ).size;
    const shared = (f) => owners(f.error) >= SHARED_OWNERS;
    const broken = new Set(
        Object.entries(next).map(([model, s]) => streamKey(model, s.error)),
    );
    const toldAt = (f) => told[streamKey(f.model, f.error)] ?? 0;
    return {
        streaks: next,
        told: Object.fromEntries(
            Object.entries(told).filter(
                ([key]) => key in recent || broken.has(key),
            ),
        ),
        due: fresh
            .filter(
                (f) =>
                    f.streak >= 2 &&
                    !shared(f) &&
                    !(streamKey(f.model, f.error) in recent),
            )
            .sort((a, b) => toldAt(a) - toldAt(b)),
        shared: fresh.filter(
            (f) => shared(f) && !(streamKey(GEN, f.error) in recent),
        ),
    };
}

// `told` keys: a model and its broken stream, or GEN and a stream broken
// for many owners.
export const GEN = "gen";
export const streamKey = (model, error) => `${model} ${error}`;
