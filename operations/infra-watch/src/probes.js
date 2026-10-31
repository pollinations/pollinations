// Probes of community models, ported from the retired community monitor
// (operations/community-monitor: probe.mjs, chat-stream.mjs, image-probe.mjs
// and probe-schedule.mjs). No Cloudflare imports, so it is testable with
// plain Node.
import { withTimeout } from "./delivery.js";

const HOUR_MS = 60 * 60 * 1000;
// Real traffic is read over this window.
export const PROBE_MINUTES = 240;
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
// reset the backoff.
export function recordProbe(previous, result) {
    return {
        lastAt: result.timestamp,
        failures:
            result.ok ||
            result.status === "ERR" ||
            result.status === "INVALID" ||
            (typeof result.status === "number" && result.status < 500)
                ? 0
                : (previous?.failures ?? 0) + 1,
        operation: result.operation,
    };
}

// The community text and image proxies to probe now: public (gen's catalog
// lists no private model) and not agents, due by their backoff, and either
// at 80% health or less or without real traffic in the last 4 hours. `rows`
// are gen's status rows for regular traffic, which leaves the probes out.
// Real traffic is final 2xx and 5xx; 4xx say nothing of the model.
export function dueProbes(catalog, rows, schedule, now) {
    const busy = new Set(
        rows
            .filter((r) => r.is_rollup && r.status_2xx + r.errors_5xx > 0)
            .map((r) => r.model),
    );
    return catalog.filter(
        (m) =>
            m.community &&
            !m.agent &&
            ["text", "image"].includes(m.category) &&
            now >= nextProbeAt(schedule[m.name]) &&
            ((m.health?.success_rate ?? 100) <= 80 || !busy.has(m.name)),
    );
}

// Keep useful diagnosis without persisting raw upstream bodies or credentials.
export function probeErrorDetails(error) {
    const safeText = (value) =>
        typeof value === "string"
            ? value
                  .replace(/https?:\/\/[^\s"<>]+/gi, "[URL]")
                  .replace(/Bearer\s+[^\s"<>]+/gi, "Bearer [redacted]")
                  .replace(
                      /\b(?:sk_|pk_|sk-|ghp_|github_pat_)[A-Za-z0-9_-]+/g,
                      "[redacted]",
                  )
                  .replace(/[\r\n\t]+/g, " ")
                  .slice(0, 300)
            : null;
    const upstreamStatus = error?.details?.upstreamStatus;
    return {
        errorCode:
            typeof error?.code === "number" && Number.isInteger(error.code)
                ? String(error.code)
                : safeText(error?.code),
        errorMessage: safeText(
            typeof error === "string" ? error : error?.message,
        ),
        upstreamStatus:
            Number.isInteger(upstreamStatus) &&
            upstreamStatus >= 400 &&
            upstreamStatus <= 599
                ? upstreamStatus
                : null,
    };
}

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
    let usage;
    let servedModel;
    let done = false;
    let dataLines = [];
    let errorDetails;

    // The upstream writes its own model name into every chunk.
    const served = () => (servedModel ? { servedModel } : {});
    const fail = (protocolError) => ({
        content,
        usage,
        ...served(),
        protocolError,
        ...errorDetails,
    });
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
            if (chunk?.error) errorDetails = probeErrorDetails(chunk.error);
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
                errorDetails = probeErrorDetails(choice.error);
                throw new Error("stream ended with finish_reason=error");
            }
            if (typeof choice?.delta?.content === "string") {
                content += choice.delta.content;
            }
        }
        if (chunk.usage) usage = chunk.usage;
        if (typeof chunk.model === "string" && chunk.model) {
            servedModel = chunk.model;
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
        return { content, usage, ...served() };
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

// A text probe passes with the marker in the final answer of a valid
// stream. A broken stream is PROTOCOL; an answer without the marker is
// INVALID. `modelUsed` is the model that answered, from gen's header.
export function textProbeResult(response, body, marker) {
    const { content, protocolError, errorCode } = response.ok
        ? parseChatStream(body)
        : {};
    const marked = hasChatProbeMarker(content, marker);
    return {
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
        errorCode: probeErrorDetails(parsed?.error).errorCode,
        modelUsed: response.headers.get("x-model-used"),
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

// A model and broken stream told once stay quiet this long.
const STREAM_QUIET_MS = 24 * 60 * 60 * 1000;

// Gen's error codes for failures on the caller's side, never the
// provider's: the probe key's auth or balance, invalid input, and content
// policy. Gen reports a provider's own 401, 402 and 403 as BAD_GATEWAY.
const CALLER_SIDE = new Set([
    "UNAUTHORIZED",
    "FORBIDDEN",
    "PAYMENT_REQUIRED",
    "INSUFFICIENT_BALANCE",
    "KEY_BUDGET_EXHAUSTED",
    "QUEST_POLLEN_ONLY",
    "BAD_REQUEST",
    "UNPROCESSABLE_ENTITY",
    "content_policy_violation",
    "content_blocked",
]);

// Broken streams from a batch of probe results. `streaks` keeps, per model,
// its provider's protocol error and how many fresh text probes in a row
// got it: a model not probed keeps its streak, any other result ends it.
// An answer from a fallback says nothing of the model's own stream. At two
// in a row a model is due a warning, unless that model and error were told
// in the last day; `told` keeps when, and older ones are dropped.
export function brokenStreams({ streaks = {}, told = {} } = {}, results, now) {
    const next = { ...streaks };
    const recent = Object.fromEntries(
        Object.entries(told).filter(([, at]) => now - at < STREAM_QUIET_MS),
    );
    const due = [];
    for (const r of results) {
        if (r.category !== "text" || (r.modelUsed && r.modelUsed !== r.model))
            continue;
        const error =
            r.status === "PROTOCOL" && !CALLER_SIDE.has(r.errorCode)
                ? r.protocolError
                : null;
        if (!error) {
            delete next[r.model];
            continue;
        }
        const streak =
            next[r.model]?.error === error ? next[r.model].streak + 1 : 1;
        next[r.model] = { error, streak };
        if (streak >= 2 && !(streamKey(r.model, error) in recent))
            due.push({ model: r.model, error, code: r.errorCode });
    }
    return { streaks: next, told: recent, due };
}

export const streamKey = (model, error) => `${model} ${error}`;
