// One issue's pending job, kept in its Durable Object's storage so a restart
// loses nothing. Each event replaces the job and waits out a quiet period, so a
// burst of edits costs one agent call; a redelivered event or an unchanged body
// costs none. A failed agent call is retried, spaced out, before anything is
// posted; any other throw falls to Cloudflare's own alarm retries.
const QUIET_MS = 30_000;
export const RETRY_MS = [60_000, 300_000];

async function digest(text) {
    const bytes = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(text),
    );
    return Buffer.from(bytes).toString("hex");
}

export async function receive(storage, job) {
    if ((await storage.get("done"))?.delivery === job.delivery) return false;
    await storage.put("job", { ...job, attempt: 0 });
    await storage.setAlarm(Date.now() + QUIET_MS);
    return true;
}

export async function work(storage, execute) {
    const job = await storage.get("job");
    if (!job) return;
    const isLatest = async () =>
        (await storage.get("job"))?.delivery === job.delivery;
    const body = await digest(job.issue.body ?? "");
    if ((await storage.get("done"))?.body !== body) {
        const result = await execute(job, {
            lastAttempt: job.attempt >= RETRY_MS.length,
            isLatest,
        });
        if (result.retry) {
            if (await isLatest()) {
                await storage.put("job", { ...job, attempt: job.attempt + 1 });
                await storage.setAlarm(Date.now() + RETRY_MS[job.attempt]);
            }
            return;
        }
        // An unavailable check or a run overtaken by a newer event is not done.
        if (result.outcome.kind !== "unavailable" && !result.skipped)
            await storage.put("done", { delivery: job.delivery, body });
    }
    if (await isLatest()) await storage.delete("job");
}
