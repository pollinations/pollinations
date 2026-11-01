// KV is a domain-detection input. D1 owns account policy: null = not checked,
// 1 = restricted, 0 = explicitly cleared by a purchase or maintainer.
const literal = (value) => `'${value.replaceAll("'", "''")}'`;

export function domainCondition(domain) {
    if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(domain))
        throw new Error("Invalid signup domain");
    return `(lower(email) LIKE '%@${domain}' OR lower(email) LIKE '%.${domain}')`;
}

// Only accounts made since the burst began (seconds): older accounts on the
// domain are left alone, and idx_user_created_at keeps the read to that window.
export function restrictionCandidatesSql(domain, since) {
    const condition = domainCondition(domain);
    if (!Number.isSafeInteger(since))
        throw new Error("Restriction sweeps require the burst start");
    return `SELECT id FROM user WHERE created_at >= ${since} AND quest_pollen_restricted IS NULL AND ${condition}`;
}

// Credit rows, never pack_balance, prove a purchase: earnings also enter it.
// Use the user index for top-ups; SQLite otherwise chooses the status index
// and walks every paid attempt for each candidate account.
export const PURCHASED_SQL = `EXISTS (SELECT 1 FROM stripe_checkout_credits p WHERE p.user_id = user.id)
    OR EXISTS (SELECT 1 FROM stripe_auto_top_up_attempt p INDEXED BY idx_stripe_auto_top_up_attempt_user_id WHERE p.user_id = user.id AND p.status = 'paid')
    OR EXISTS (SELECT 1 FROM polar_checkout_credits p WHERE p.user_id = user.id)`;

// Shared with the one-time backfill. Recheck purchases and explicit clears in
// the write itself, because either can happen after the candidate read.
export function restrictionSql(userIds, approvedIds = []) {
    if (!userIds.length || userIds.length > 200)
        throw new Error("Restriction updates require 1–200 user IDs");
    const approved = userIds.filter((id) => approvedIds.includes(id));
    return `UPDATE user SET quest_pollen_restricted = CASE WHEN ${
        approved.length ? `id IN (${approved.map(literal).join(",")}) OR ` : ""
    }${PURCHASED_SQL} THEN 0 ELSE 1 END
        WHERE id IN (${userIds.map(literal).join(",")}) AND quest_pollen_restricted IS NULL`;
}

export const releaseDomainSql = (domain) =>
    `UPDATE user SET quest_pollen_restricted = 0 WHERE ${domainCondition(domain)} AND quest_pollen_restricted IS NOT 0`;

export async function restrictDomain(db, kv, domain, since) {
    const { results } = await db
        .prepare(restrictionCandidatesSql(domain, since))
        .all();
    for (let i = 0; i < results.length; i += 200) {
        const ids = results.slice(i, i + 200).map(({ id }) => id);
        const approved = [];
        for (let j = 0; j < ids.length; j += 100) {
            const decisions = await kv.get(
                ids.slice(j, j + 100).map((id) => `decision:${id}`),
            );
            for (const [key, value] of decisions)
                if (value === "approved")
                    approved.push(key.slice("decision:".length));
        }
        await db.prepare(restrictionSql(ids, approved)).run();
    }
}

// Save work before publishing a new hold, so a restart cannot lose the cohort
// sweep. Existing domains are covered by the backfill and Enter's signup hook.
// `since` is the first sign-up in the burst's 24-hour window, saved once so
// the follow-up and retries sweep from the same start.
export async function holdDomains(kv, storage, signups, now) {
    const pending = (await storage.get("quest-sweeps")) ?? {};
    const rows = [];
    for (const row of signups) {
        const [hold, release] = await Promise.all([
            kv.get(`hold:${row.domain}`),
            kv.get(`release:${row.domain}`),
        ]);
        if (hold === null) {
            if (release === null && !pending[row.domain]) {
                pending[row.domain] = {
                    dueAt: now,
                    followup: true,
                    since: row.since,
                };
                await storage.put("quest-sweeps", pending);
            }
            await kv.put(`hold:${row.domain}`, "held");
        }
        rows.push({ ...row, hold: release === null ? "held" : "released" });
    }
    return rows;
}

// One sweep now and one after default KV cache propagation. Persisted work
// survives the 24-hour alert window; failures retry without hiding the alert.
export async function sweepDomains(db, kv, storage, now) {
    const pending = (await storage.get("quest-sweeps")) ?? {};
    for (const [domain, sweep] of Object.entries(pending)) {
        if (sweep.dueAt > now) continue;
        try {
            if ((await kv.get(`release:${domain}`)) !== null) {
                delete pending[domain];
            } else {
                if ((await kv.get(`hold:${domain}`)) === null)
                    await kv.put(`hold:${domain}`, "held");
                await restrictDomain(db, kv, domain, sweep.since);
                if (sweep.followup)
                    pending[domain] = {
                        ...sweep,
                        dueAt: now + 2 * 60_000,
                        followup: false,
                    };
                else delete pending[domain];
            }
            await storage.put("quest-sweeps", pending);
        } catch (error) {
            console.error(`quest sweep ${domain}: ${error.message}`);
        }
    }
    return pending;
}
