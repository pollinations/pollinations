import { BILLING_EMAIL, NOTIFICATION_SENDER } from "./account-notices.ts";

type Delivery = {
    request_id: string;
    recipient: "buyer" | "billing" | "billing_followup";
    attempts: number;
};
type Declaration = {
    name: string;
    email: string;
    purchase: string;
    statement: string;
    received_at: number;
};

// Claim due jobs atomically. An interrupted Worker releases its lease automatically.
// Each recipient has its own job so a buyer's invalid mailbox cannot delay billing.
export async function deliverWithdrawals(env: CloudflareBindings, id?: string) {
    const now = Date.now();
    const lease = now + 5 * 60_000;
    const filter = id ? "AND request_id = ?" : "";
    const jobs = await env.DB.prepare(`UPDATE withdrawal_delivery
        SET next_attempt_at = ?, attempts = attempts + 1
        WHERE (request_id, recipient) IN (SELECT request_id, recipient FROM withdrawal_delivery
            WHERE next_attempt_at <= ? ${filter}
            ORDER BY next_attempt_at, request_id, recipient LIMIT 12)
        RETURNING request_id, recipient, attempts`)
        .bind(lease, now, ...(id ? [id] : []))
        .all<Delivery>();
    await Promise.all(jobs.results.map((job) => deliver(env, job, lease)));
}

async function deliver(env: CloudflareBindings, job: Delivery, lease: number) {
    const key = [job.request_id, job.recipient, lease] as const;
    const match =
        "WHERE request_id = ? AND recipient = ? AND next_attempt_at = ?";
    if (env.ENVIRONMENT === "production") {
        const request = await env.DB.prepare(
            "SELECT name, email, purchase, statement, received_at FROM withdrawal_request WHERE id = ?",
        )
            .bind(job.request_id)
            .first<Declaration>();
        if (!request) throw new Error("Missing withdrawal declaration");
        const followup = job.recipient === "billing_followup";
        const text = [
            ...(followup
                ? [
                      "Please follow up with this buyer. Automatic delivery of the receipt repeatedly failed.",
                      "",
                  ]
                : []),
            "Myceli.AI OÜ received the following withdrawal declaration.",
            "",
            request.statement,
            `Name supplied: ${request.name}`,
            `Purchase identified: ${request.purchase}`,
            `Receipt email: ${request.email}`,
            `Received (UTC): ${new Date(request.received_at).toISOString()}`,
            `Reference: ${job.request_id}`,
            "",
            "For questions about this declaration, reply to Pollinations billing.",
        ].join("\n");
        try {
            await env.EMAIL.send({
                from: NOTIFICATION_SENDER,
                to: job.recipient === "buyer" ? request.email : BILLING_EMAIL,
                replyTo: BILLING_EMAIL,
                subject: followup
                    ? "Action needed: undelivered withdrawal receipt"
                    : "Credit top-up withdrawal received",
                text,
            });
        } catch {
            console.error(
                "Withdrawal delivery deferred",
                job.request_id,
                job.recipient,
            );
            if (job.recipient === "buyer" && job.attempts >= 4) {
                await env.DB.prepare(`UPDATE withdrawal_delivery
                    SET recipient = 'billing_followup', next_attempt_at = 0, attempts = 0 ${match}`)
                    .bind(...key)
                    .run();
            } else {
                const retryAt =
                    Date.now() +
                    Math.min(
                        2 ** Math.min(job.attempts - 1, 7) * 900_000,
                        86_400_000,
                    );
                await env.DB.prepare(
                    `UPDATE withdrawal_delivery SET next_attempt_at = ? ${match}`,
                )
                    .bind(retryAt, ...key)
                    .run();
            }
            return;
        }
    }
    await env.DB.prepare(`DELETE FROM withdrawal_delivery ${match}`)
        .bind(...key)
        .run();
}

export async function retryWithdrawals(env: CloudflareBindings) {
    await deliverWithdrawals(env);
    const now = Date.now();
    await env.DB.batch([
        env.DB.prepare(
            "UPDATE withdrawal_request SET ip_key = NULL WHERE ip_key IS NOT NULL AND received_at <= ?",
        ).bind(now - 3_600_000),
        // Billing retains its copy. Keep intake records briefly for retry/receipt lookup.
        env.DB.prepare(`DELETE FROM withdrawal_request WHERE id IN (
            SELECT id FROM withdrawal_request WHERE received_at <= ?
            AND NOT EXISTS (SELECT 1 FROM withdrawal_delivery WHERE request_id = withdrawal_request.id)
            ORDER BY received_at LIMIT 100)`).bind(now - 30 * 86_400_000),
    ]);
}
