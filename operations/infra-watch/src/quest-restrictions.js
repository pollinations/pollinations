// KV names domains to inspect; the nullable D1 field owns account policy:
// null = not checked, 1 = restricted, 0 = explicitly cleared. Repeated scans
// can therefore catch new accounts without undoing a purchase or review.
const literal = (value) => `'${value.replaceAll("'", "''")}'`;

export function domainCondition(domain) {
    if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(domain))
        throw new Error("Invalid signup domain");
    return `(lower(email) LIKE '%@${domain}' OR lower(email) LIKE '%.${domain}')`;
}

export const restrictionCandidatesSql = (domain) =>
    `SELECT id FROM user WHERE quest_pollen_restricted IS NULL AND ${domainCondition(domain)}`;

// The same statement is used by the one-time backfill. Credit rows, never
// pack_balance, prove a purchase: earnings also enter the paid bucket.
function clearedCondition(approvedIds) {
    const approved = approvedIds.length
        ? `id IN (${approvedIds.map(literal).join(",")}) OR `
        : "";
    return `${approved}
        EXISTS (SELECT 1 FROM stripe_checkout_credits p WHERE p.user_id = user.id)
        OR EXISTS (SELECT 1 FROM stripe_auto_top_up_attempt p WHERE p.user_id = user.id AND p.status = 'paid')
        OR EXISTS (SELECT 1 FROM polar_checkout_credits p WHERE p.user_id = user.id)`;
}

export function restrictionSql(domain, approvedIds = []) {
    return `UPDATE user SET quest_pollen_restricted = CASE WHEN ${clearedCondition(approvedIds)}
        THEN 0 ELSE 1 END
        WHERE quest_pollen_restricted IS NULL AND ${domainCondition(domain)}`;
}

export function restrictionPreviewSql(domain, approvedIds = []) {
    return `WITH candidates AS (
        SELECT CASE WHEN ${clearedCondition(approvedIds)} THEN 1 ELSE 0 END AS cleared, tier_balance
        FROM user WHERE quest_pollen_restricted IS NULL AND ${domainCondition(domain)}
    ) SELECT count(*) AS accounts, COALESCE(sum(1 - cleared), 0) AS restricted,
        COALESCE(sum(cleared), 0) AS cleared,
        COALESCE(sum(CASE WHEN cleared = 0 THEN max(0, COALESCE(tier_balance, 0)) ELSE 0 END), 0) AS quest_pollen_to_freeze
        FROM candidates`;
}

export const releaseDomainSql = (domain) =>
    `UPDATE user SET quest_pollen_restricted = 0 WHERE ${domainCondition(domain)} AND quest_pollen_restricted IS NOT 0`;

export async function restrictDomain(db, kv, domain) {
    const { results } = await db
        .prepare(restrictionCandidatesSql(domain))
        .all();
    const approved = [];
    for (let i = 0; i < results.length; i += 100) {
        const decisions = await kv.get(
            results.slice(i, i + 100).map(({ id }) => `decision:${id}`),
        );
        for (const [key, value] of decisions)
            if (value === "approved")
                approved.push(key.slice("decision:".length));
    }
    return db.prepare(restrictionSql(domain, approved)).run();
}

/** Apply active burst domains to accounts; a maintainer's release wins. */
export const holdDomains = (db, kv, signups) =>
    Promise.all(
        signups.map(async ({ ...row }) => {
            const [hold, release] = await Promise.all([
                kv.get(`hold:${row.domain}`),
                kv.get(`release:${row.domain}`),
            ]);
            if (hold === null) await kv.put(`hold:${row.domain}`, "held");
            if (release === null) await restrictDomain(db, kv, row.domain);
            return { ...row, hold: release === null ? "held" : "released" };
        }),
    );
