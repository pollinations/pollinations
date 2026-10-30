// Webhook delivery and state commits. No Cloudflare imports, so it is
// testable with plain Node.

const TIMEOUT_MS = 10_000;
const MAX_TRIES = 3;

// True only once Discord accepted the message. Retries 429 (honouring
// retry_after, capped) and 5xx/network errors.
export async function send(url, body, { fetchImpl = fetch, sleep } = {}) {
    const wait = sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
        let res;
        try {
            res = await fetchImpl(url, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(TIMEOUT_MS),
            });
        } catch {
            res = null;
        }
        if (res?.ok) return true;
        if (res && res.status < 500 && res.status !== 429) return false;
        if (attempt === MAX_TRIES) break;
        const header = res?.headers?.get?.("retry-after");
        const retryAfter = header == null ? Number.NaN : Number(header);
        await wait(
            Math.min(
                Number.isFinite(retryAfter)
                    ? retryAfter * 1000
                    : 1000 * attempt,
                5000,
            ),
        );
    }
    return false;
}

// Keep a post's state change only if it was delivered: an undelivered alert
// stays eligible next check, an undelivered recovery stays active.
export function settle(prev, next, posts, delivered) {
    const active = { ...next.active };
    posts.forEach((post, i) => {
        if (delivered[i]) return;
        const before = prev.active?.[post.key];
        if (before) active[post.key] = before;
        else delete active[post.key];
    });
    return { ...next, active };
}

// Runs `fn` unless a previous run is still in flight (lease expires after
// `leaseMs`, in case a run hung). Returns null when skipped.
export function exclusive(leaseMs, now = Date.now) {
    let since = 0;
    return async (fn) => {
        if (since && now() - since < leaseMs) return null;
        since = now();
        try {
            return await fn();
        } finally {
            since = 0;
        }
    };
}
