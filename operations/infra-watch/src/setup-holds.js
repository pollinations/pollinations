// Setup reward holds, in the SETUP_HOLDS KV store shared with Enter. Each
// key has one writer, so an automatic write never undoes a maintainer's:
//   hold:<domain>       "held": infra-watch, on a sign-up burst
//   release:<domain>    "released": a maintainer, which ends the hold
//   review:<userId>     "pending", with the account's evidence as metadata:
//                       Enter, when a held account asks
//   decision:<userId>   "approved" or "declined": a maintainer
// Pending requests open one review card per domain (see rules.js): the AI
// recommends, a maintainer decides by running one of the card's commands.

export const REVIEW_PROMPT = `You review requests to unlock onboarding (Setup) quest rewards on Pollinations, for the maintainers in a private Discord channel.
Accounts on an email domain are held after many new accounts are created on it within a day: the pattern of reward farms that create accounts in bulk. A real group, such as a school class or a company team, can sign up together too.
You get the domain's new accounts per day over 30 days and, for each account asking, its age, the quest rewards it earned and its API use over 30 days.
- Farm signs: hundreds of sign-ups in a day or two, accounts that only collect rewards and make few or no API requests, accounts alike in every number.
- Real-group signs: small or steady numbers, varied and continued API use, older accounts.
moment is "open" for a new review card or "change" when the accounts listed changed; previous holds your earlier lines.
Answer in one line: APPROVE or DECLINE, then the main reason in at most 25 words. Your line is advice: a maintainer decides.`;

/** Holds each burst domain not held yet; rows gain the domain's state. */
export const holdDomains = (kv, signups) =>
    Promise.all(
        signups.map(async ({ ...row }) => {
            const [hold, release] = await Promise.all([
                kv.get(`hold:${row.domain}`),
                kv.get(`release:${row.domain}`),
            ]);
            if (hold === null) await kv.put(`hold:${row.domain}`, "held");
            return { ...row, hold: release ? "released" : "held" };
        }),
    );

export async function listAll(kv, prefix) {
    const keys = [];
    let cursor;
    do {
        const page = await kv.list({ prefix, cursor });
        keys.push(...page.keys);
        cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
    return keys;
}

// Requests in the order they came, ties broken by account.
const byAge = (a, b) =>
    a.requestedAt - b.requestedAt ||
    (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0);

const names = (keys, prefix) =>
    new Set(keys.map(({ name }) => name.slice(prefix.length)));

/**
 * Pending requests (no decision yet, on a domain still held), grouped by
 * domain, oldest first. Takes KV listings of review:, decision:, hold: and
 * release:.
 */
export function pending(requests, decisions, holds, releases) {
    const decided = names(decisions, "decision:");
    const released = names(releases, "release:");
    const held = names(holds, "hold:");
    const groups = new Map();
    for (const { name, metadata } of requests) {
        const userId = name.slice("review:".length);
        const domain = metadata?.domain;
        if (!held.has(domain) || released.has(domain) || decided.has(userId))
            continue;
        const accounts = groups.get(domain) ?? [];
        accounts.push({ userId, ...metadata });
        groups.set(domain, accounts);
    }
    for (const accounts of groups.values()) accounts.sort(byAge);
    return groups;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const days = (from, now) => Math.floor((now - from) / DAY_MS);

/**
 * What the model reads: numbers only, accounts by position, never their ids.
 * A failed Tinybird read comes through as { error }.
 */
export function reviewEvidence({ domain, accounts }, signups, usage, now) {
    const used = new Map(
        Array.isArray(usage) ? usage.map((u) => [u.user_id, u]) : [],
    );
    return {
        domain,
        signupsPerDay: signups,
        accounts: accounts.map((a, i) => {
            const u = used.get(a.userId);
            return {
                account: i + 1,
                ageDays: days(a.createdAt, now),
                rewards: a.rewards,
                rewardPollen: a.rewardPollen,
                requests30d: Array.isArray(usage)
                    ? (u?.requests ?? 0)
                    : "unknown",
                models30d: u?.models ?? 0,
                lastRequestDaysAgo: u ? days(u.last_request * 1000, now) : null,
            };
        }),
    };
}

/**
 * The model's line, only as "APPROVE: reason" or "DECLINE: reason" in plain
 * text: no Discord formatting, links or mentions reach the post.
 */
export function verdict(line) {
    const match = /^\**(APPROVE|DECLINE)\**\s*[:\-–]\s*(.+)$/i.exec(line ?? "");
    if (!match) return null;
    const reason = match[2]
        .replace(/[a-z]+:\/\/\S*/gi, "")
        .replace(/[`*_~|<>[\]()@#\\]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    return reason ? `${match[1].toUpperCase()}: ${reason.slice(0, 200)}` : null;
}
