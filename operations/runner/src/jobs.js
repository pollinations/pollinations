// One issue's pending job, kept in its Durable Object's storage so a restart
// loses nothing. An event only says "look at this issue again": it replaces the
// job and waits out a quiet period, so a burst of edits costs one review, and
// the review reads the issue as it is then. A computed review is stored, so a
// failed write is retried without asking the agent again. Every failure is
// retried, spaced out; a review that fails on the last attempt posts
// "unavailable", and a write that does is logged.
const QUIET_MS = 30_000;
export const RETRY_MS = [60_000, 300_000, 1_800_000];

// Each delivery is taken once, so a redelivered event costs no review. It is
// marked as taken only after its job and alarm are stored: a failure part-way
// leaves it unmarked, so a redelivery queues it again. The worst case is one
// extra review, never a lost event.
export async function receive(storage, job) {
    const seen = (await storage.get("seen")) ?? [];
    if (seen.includes(job.delivery)) return false;
    await storage.put("job", { ...job, attempt: 0 });
    await storage.setAlarm(Date.now() + QUIET_MS);
    await storage.put("seen", [...seen, job.delivery].slice(-100));
    return true;
}

export async function work(storage, { review, deliver, log = console.error }) {
    const job = await storage.get("job");
    if (!job) return;
    const isLatest = async () =>
        (await storage.get("job"))?.delivery === job.delivery;
    const lastAttempt = job.attempt >= RETRY_MS.length;
    try {
        const result = job.result ?? (await review(job, { lastAttempt }));
        if (result.retry) throw new Error(result.error);
        if (!result.skip) {
            if (!(await isLatest())) return;
            await storage.put("job", { ...job, result });
            await deliver(job, result, { isLatest });
        }
    } catch (error) {
        if (!(await isLatest())) return;
        if (!lastAttempt) {
            await storage.put("job", {
                ...(await storage.get("job")),
                attempt: job.attempt + 1,
            });
            await storage.setAlarm(Date.now() + RETRY_MS[job.attempt]);
            return;
        }
        log(`job for issue ${job.number} failed: ${error.message}`);
    }
    if (await isLatest()) await storage.delete("job");
}
