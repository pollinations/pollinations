// Webhook delivery and state commits. No Cloudflare imports, so it is
// testable with plain Node.

const TIMEOUT_MS = 10_000;

// Gives `fn` a signal that aborts after `ms`, and clears the timer once `fn`
// settles. A pending AbortSignal.timeout() keeps the Durable Object running
// until it fires, long after the check itself returned.
export async function withTimeout(ms, fn) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
        return await fn(controller.signal);
    } finally {
        clearTimeout(timer);
    }
}

const withWait = (url) => {
    const u = new URL(url);
    u.searchParams.set("wait", "true");
    return u.toString();
};
const MAX_TRIES = 3;

// Truthy only once Discord accepted the message: the saved message (wait=true
// returns it, with its id and channel), so the card can be edited and linked
// later. Retries 429 (honouring retry_after, capped) and 5xx/network errors.
export async function send(url, body, { fetchImpl = fetch, sleep } = {}) {
    const wait = sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
        let res;
        try {
            // wait=true: Discord answers only after the message is saved.
            res = await withTimeout(TIMEOUT_MS, (signal) =>
                fetchImpl(withWait(url), {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify(body),
                    signal,
                }),
            );
        } catch {
            res = null;
        }
        if (res?.ok) {
            const saved = await res.json?.().catch(() => null);
            return saved ?? true;
        }
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

// A webhook body: the alert as a coloured embed, mentions outside it, since
// Discord never pings from inside an embed. parse: [] blocks @everyone,
// roles and any user not listed.
export const payload = ({ text, ping, color }, maintainers) => ({
    content: ping ? maintainers.map((id) => `<@${id}>`).join(" ") : "",
    embeds: [{ description: text, color }],
    allowed_mentions: { parse: [], users: ping ? maintainers : [] },
});

// Replaces the content of a message this webhook posted. One try: if the
// edit fails, the alert simply stays as it was.
export async function edit(url, id, body, { fetchImpl = fetch } = {}) {
    const u = new URL(url);
    u.search = "";
    u.pathname += `/messages/${id}`;
    try {
        const res = await withTimeout(TIMEOUT_MS, (signal) =>
            fetchImpl(u, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
                signal,
            }),
        );
        res.body?.cancel();
        return res.ok;
    } catch {
        return false;
    }
}

// Runs tasks one after another in the background: the caller never waits,
// and a failed task is logged without stopping the ones queued after it.
export function serial() {
    let tail = Promise.resolve();
    return (task) => {
        tail = tail
            .then(task)
            .catch((error) =>
                console.error(`background task failed: ${error.message}`),
            );
        return tail;
    };
}

// Runs `fn` unless a previous run is still in flight; returns null when
// skipped. The lease never expires early: every network call in a run has a
// timeout, so a run always finishes, and an expired lease would let two runs
// send and write state at once.
export function exclusive() {
    let running = false;
    return async (fn) => {
        if (running) return null;
        running = true;
        try {
            return await fn();
        } finally {
            running = false;
        }
    };
}
