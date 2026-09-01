/**
 * Pollinations API client for the Discord adapter.
 *
 * Implements the BYOP device authorization flow (RFC 8628) and calls the
 * hosted Community Agent's callable model endpoint. The agent's system
 * prompt and logic live on Pollinations — this file only forwards messages.
 *
 * All functions accept an injectable `fetchImpl` so tests can mock the API.
 */

export const ENTER_URL =
    process.env.ENTER_URL ?? "https://enter.pollinations.ai";
export const GEN_URL = process.env.GEN_URL ?? "https://gen.pollinations.ai";

/** Callable model ID of the hosted Community Agent used by this bot. */
export const AGENT_MODEL = "AkshayCoder48/tutor";

const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

/** Error whose message is safe to show to a Discord user. */
export class PublicError extends Error {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Exponential backoff for transient failures: 500ms, 1s, 2s, … */
const backoffMs = (attempt) => 500 * 2 ** (attempt - 1);

async function postJson(url, body, fetchImpl) {
    const res = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
}

/** Step 1 of the device flow: request a device + user code. */
export async function startDeviceFlow(appKey, fetchImpl = fetch) {
    const { ok, status, data } = await postJson(
        `${ENTER_URL}/api/device/code`,
        { client_id: appKey },
        fetchImpl,
    );
    if (!ok || !data.device_code) {
        throw new PublicError(
            `Could not start Pollinations sign-in (${status}). Try again later.`,
        );
    }
    return data; // { device_code, user_code, verification_uri, interval, expires_in }
}

/**
 * Step 2 of the device flow: poll until the user approves, the code expires,
 * or they deny access. Returns the user's scoped `sk_...` key.
 */
export async function pollForToken(
    appKey,
    deviceCode,
    { interval = 5, expiresIn = 600, fetchImpl = fetch } = {},
) {
    const deadline = Date.now() + expiresIn * 1000;
    let waitMs = Math.max(interval, 1) * 1000;
    while (Date.now() < deadline) {
        await sleep(waitMs);
        const { ok, data } = await postJson(
            `${ENTER_URL}/api/oauth/token`,
            {
                grant_type: DEVICE_GRANT,
                device_code: deviceCode,
                client_id: appKey,
            },
            fetchImpl,
        );
        if (ok && data.access_token) return data.access_token;
        if (data.error === "authorization_pending") continue;
        if (data.error === "slow_down") {
            waitMs += 5000;
            continue;
        }
        if (data.error === "access_denied")
            throw new PublicError("Authorization was denied.");
        if (data.error === "expired_token")
            throw new PublicError(
                "The sign-in code expired. Run /connect for a new one.",
            );
        throw new PublicError("Sign-in failed. Run /connect to try again.");
    }
    throw new PublicError(
        "The sign-in code expired. Run /connect for a new one.",
    );
}

/** Look up who a user key belongs to (for a friendly confirmation). */
export async function getUserInfo(token, fetchImpl = fetch) {
    const res = await fetchImpl(`${ENTER_URL}/api/device/userinfo`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return res.json().catch(() => null);
}

/**
 * Read the `Retry-After` response header (seconds), if the server sent one.
 */
function retryAfterMs(res) {
    const seconds = Number(res.headers?.get?.("retry-after"));
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
}

/**
 * Call the hosted Community Agent with the connected user's key.
 * `messages` is the OpenAI-style conversation built from Discord context.
 *
 * Transient failures (network errors, 429, 5xx) are retried up to
 * `maxAttempts` times with exponential backoff, honoring `Retry-After`
 * when the server provides it. Auth failures (401/403) are never retried:
 * they throw PublicError("expired-token: …") so the caller can drop the
 * key and ask the user to reconnect. A well-formed HTTP response with a
 * missing/empty `choices[0].message.content` is treated as a clean,
 * user-safe error instead of throwing a TypeError.
 */
export async function askAgent(
    token,
    messages,
    fetchImpl = fetch,
    { maxAttempts = 3 } = {},
) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        let res;
        try {
            res = await fetchImpl(`${GEN_URL}/v1/chat/completions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ model: AGENT_MODEL, messages }),
            });
        } catch {
            // Network-level failure (DNS, reset, timeout) — retryable.
            if (attempt < maxAttempts) {
                await sleep(backoffMs(attempt));
                continue;
            }
            throw new PublicError(
                "The agent could not be reached. Try again in a moment.",
            );
        }
        if (res.status === 401 || res.status === 403) {
            throw new PublicError(
                "expired-token: Your Pollinations connection expired or was revoked. Run /connect to reconnect.",
            );
        }
        if (res.status === 429 || res.status >= 500) {
            // Rate-limited or upstream error — retryable.
            if (attempt < maxAttempts) {
                await sleep(retryAfterMs(res) ?? backoffMs(attempt));
                continue;
            }
            throw new PublicError(
                "The agent is busy right now. Try again in a moment.",
            );
        }
        const data = await res.json().catch(() => ({}));
        const content = data.choices?.[0]?.message?.content;
        if (!res.ok || typeof content !== "string" || content.length === 0) {
            throw new PublicError("The agent could not answer right now.");
        }
        return content;
    }
    throw new PublicError(
        "The agent could not be reached. Try again in a moment.",
    );
}
