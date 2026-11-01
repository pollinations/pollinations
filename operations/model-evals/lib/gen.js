import { openaiUsageToUsage } from "../../../shared/registry/usage-headers.ts";

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

const price = (pricing, field) => Number(pricing?.[field] ?? 0);

/** Pollen for one reply: the usage gen reports times the catalog's prices. */
export function estimateCost(usage, pricing) {
    if (!usage) return 0;
    return Object.entries(openaiUsageToUsage(usage)).reduce(
        (total, [type, count]) =>
            total +
            count *
                price(
                    pricing,
                    type === "completionReasoningTokens"
                        ? "completionTextTokens"
                        : type,
                ),
        0,
    );
}

const replyText = (message) =>
    Array.isArray(message?.content)
        ? message.content.map((part) => part?.text ?? "").join("")
        : (message?.content ?? "");

// gen answers a text request it refuses (empty wallet, key budget used up)
// with a chat reply that reports no usage and links the enter page that fixes
// it, instead of an HTTP 402.
const isRefusal = (text, usage) =>
    usage.completion_tokens === 0 && /[?&]ref=agent_/.test(text);

/**
 * One chat completion. Never throws: a timeout, HTTP error, refusal, or empty
 * reply comes back as `error` so the caller counts it as a failed answer. A 429
 * is our own per-user limit, not the model's fault, so it is retried slowly.
 * gen maps provider 401/402/403 to 502, so those statuses are gen refusing our
 * own key or account and come back `fatal`.
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
                        Number.isFinite(seconds) && seconds > 0
                            ? seconds * 1000
                            : attempt * 5000,
                        60_000,
                    ),
                );
                continue;
            }
            if (!res.ok)
                return {
                    error: `http_${res.status}`,
                    fatal: [401, 402, 403].includes(res.status),
                };
            const body = await res.json();
            if (
                !Number.isFinite(body.usage?.prompt_tokens) ||
                !Number.isFinite(body.usage?.completion_tokens)
            )
                return { error: "missing_usage", fatal: true };
            const choice = body.choices?.[0];
            const text = replyText(choice?.message);
            if (isRefusal(text, body.usage)) return { error: "refused" };
            return text
                ? {
                      text,
                      usage: body.usage,
                      finishReason: choice.finish_reason ?? null,
                  }
                : { error: "empty", usage: body.usage };
        } catch (error) {
            return {
                error: error?.name === "TimeoutError" ? "timeout" : "network",
            };
        }
    }
}
