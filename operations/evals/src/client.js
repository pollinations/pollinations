// gen.pollinations.ai text client for the eval runner.
//
// Notes from a real trial run (see the quest):
// - responses are cached by request body, so every request carries a unique seed
// - a 429 from a community model's per-user limit is our rate limit, not a model
//   failure: retry slowly instead of counting it as failed
// - answers live at choices[0].message.content, and some community endpoints
//   report "model": null

const DEFAULT_BASE = "https://gen.pollinations.ai";

export class TimeoutError extends Error {}

/**
 * Call one text model once. Returns { ok, content, model, usage, latencyMs,
 * error, kind }. Never throws for API errors — a timeout or error becomes a
 * failed sample, not a skipped one.
 */
export async function sampleModel({
    baseUrl = DEFAULT_BASE,
    apiKey,
    model,
    prompt,
    seed,
    timeoutMs = 60_000,
    maxRetries429 = 6,
    fetchImpl = fetch,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
    const started = Date.now();
    let attempt = 0;
    for (;;) {
        attempt += 1;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let res;
        try {
            res = await fetchImpl(`${baseUrl}/v1/chat/completions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
                },
                body: JSON.stringify({
                    model,
                    messages: [{ role: "user", content: prompt }],
                    seed,
                    temperature: 0,
                }),
                signal: controller.signal,
            });
        } catch (error) {
            clearTimeout(timer);
            if (error.name === "AbortError") {
                return failed(model, "timeout", `timed out after ${timeoutMs}ms`, started);
            }
            return failed(model, "network", String(error.message || error), started);
        }
        clearTimeout(timer);

        if (res.status === 429 && attempt <= maxRetries429) {
            const retryAfter = Number(res.headers?.get?.("retry-after")) || 0;
            await sleep(retryAfter > 0 ? retryAfter * 1000 : attempt * 5_000);
            continue;
        }

        if (!res.ok) {
            const body = await safeText(res);
            return failed(model, res.status === 429 ? "rate_limit" : "http", `HTTP ${res.status}: ${body.slice(0, 200)}`, started, res.status);
        }

        let data;
        try {
            data = await res.json();
        } catch (error) {
            return failed(model, "parse", `invalid JSON: ${error.message}`, started);
        }
        const content = data?.choices?.[0]?.message?.content;
        if (typeof content !== "string") {
            return failed(model, "parse", "no choices[0].message.content", started);
        }
        return {
            ok: true,
            content,
            model: data.model ?? model, // some community endpoints return null
            usage: data.usage ?? null,
            latencyMs: Date.now() - started,
            attempts: attempt,
        };
    }
}

function failed(model, kind, error, started, status) {
    return { ok: false, model, kind, error, status, latencyMs: Date.now() - started };
}

async function safeText(res) {
    try {
        return await res.text();
    } catch {
        return "";
    }
}
