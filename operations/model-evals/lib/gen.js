const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const defaultBaseUrl = () =>
    process.env.POLLINATIONS_BASE_URL ?? "https://gen.pollinations.ai";

const authHeaders = (key) => (key ? { Authorization: `Bearer ${key}` } : {});

/** Every text model gen serves, community models included. */
export async function fetchTextModels({ baseUrl, key }) {
    const res = await fetch(`${baseUrl}/text/models`, {
        headers: authHeaders(key),
    });
    if (!res.ok) throw new Error(`GET /text/models failed: ${res.status}`);
    return res.json();
}

/** Account balance in Pollen, or null when the key can't read it. */
export async function fetchBalance({ baseUrl, key }) {
    try {
        const res = await fetch(`${baseUrl}/account/balance`, {
            headers: authHeaders(key),
        });
        if (!res.ok) return null;
        const { balance } = await res.json();
        return typeof balance === "number" ? balance : null;
    } catch {
        return null;
    }
}

const price = (pricing, field) => Number(pricing?.[field] ?? 0);

/** Pollen for one reply: the usage gen reports times the catalog's prices. */
export function estimateCost(usage, pricing) {
    if (!usage) return 0;
    const cached = usage.prompt_tokens_details?.cached_tokens ?? 0;
    const prompt = (usage.prompt_tokens ?? 0) - cached;
    return (
        prompt * price(pricing, "promptTextTokens") +
        cached *
            (price(pricing, "promptCachedTokens") ||
                price(pricing, "promptTextTokens")) +
        (usage.completion_tokens ?? 0) * price(pricing, "completionTextTokens")
    );
}

const replyText = (message) =>
    Array.isArray(message?.content)
        ? message.content.map((part) => part?.text ?? "").join("")
        : (message?.content ?? "");

/**
 * One chat completion. Never throws: a timeout, HTTP error, or empty reply
 * comes back as `error` so the caller counts it as a failed answer. A 429 is
 * our own per-user limit, not the model's fault, so it is retried slowly.
 */
export async function ask({
    baseUrl,
    key,
    model,
    prompt,
    seed,
    timeoutMs = 120_000,
    maxTokens = 4096,
    rateLimitRetries = 6,
    wait = sleep,
}) {
    for (let attempt = 1; ; attempt++) {
        try {
            const res = await fetch(`${baseUrl}/v1/chat/completions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...authHeaders(key),
                },
                // seed varies per question: gen caches replies by request body
                // across all users, so identical bodies would be answered
                // from cache instead of by the model.
                body: JSON.stringify({
                    model,
                    messages: [{ role: "user", content: prompt }],
                    seed,
                    max_tokens: maxTokens,
                }),
                signal: AbortSignal.timeout(timeoutMs),
            });
            if (res.status === 429 && attempt <= rateLimitRetries) {
                const header = res.headers.get("retry-after");
                const seconds = header === null ? Number.NaN : Number(header);
                await wait(
                    Math.min(
                        Number.isNaN(seconds) ? attempt * 5000 : seconds * 1000,
                        60_000,
                    ),
                );
                continue;
            }
            if (!res.ok) return { error: `http_${res.status}` };
            const body = await res.json();
            const text = replyText(body.choices?.[0]?.message);
            return text
                ? { text, usage: body.usage }
                : { error: "empty", usage: body.usage };
        } catch (error) {
            return {
                error: error?.name === "TimeoutError" ? "timeout" : "network",
            };
        }
    }
}
