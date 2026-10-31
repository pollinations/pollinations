// Setup reward holds, in the SETUP_HOLDS KV store shared with Enter. Each
// key has one writer, so an automatic write never undoes a maintainer's:
//   hold:<domain>       "held": infra-watch, on a burst while holds are on
//   release:<domain>    "released": a maintainer, which ends the hold
//   review:<userId>     "pending", with the account's evidence as metadata:
//                       Enter, when a held account asks
//   decision:<userId>   "approved" or "declined": a maintainer
// Each review covers a domain's pending requests not posted before, oldest
// first, at most MAX_LISTED per post: the AI recommends, a maintainer decides
// by running one of the posted commands.
import { kvPut, panel } from "./rules.js";

export const REVIEW_DAILY_LIMIT = 10;
const DAY_MS = 24 * 60 * 60 * 1000;
// Accounts with a command line each; the post names how many more wait.
const MAX_LISTED = 5;
const ORANGE = 0xef9f27;

export const REVIEW_PROMPT = `You review requests to unlock onboarding (Setup) quest rewards on Pollinations, for the maintainers in a private Discord channel.
Accounts on an email domain are held after many new accounts on it earn their first onboarding reward within a day: the pattern of reward farms that create accounts in bulk. A real group, such as a school class or a company team, can sign up together too.
You get the domain's first onboarding rewards per day over 30 days and, for each account asking, its age, the quest rewards it earned and its API use over 30 days.
- Farm signs: hundreds of sign-ups in a day or two, accounts that only collect rewards and make few or no API requests, accounts alike in every number.
- Real-group signs: small or steady numbers, varied and continued API use, older accounts.
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

/**
 * Pending requests (no decision yet), grouped by domain, oldest first.
 * Takes KV listings of review: and decision:.
 */
export function pending(requests, decisions) {
    const decided = new Set(
        decisions.map(({ name }) => name.slice("decision:".length)),
    );
    const groups = new Map();
    for (const { name, metadata } of requests) {
        const userId = name.slice("review:".length);
        if (!metadata?.domain || decided.has(userId)) continue;
        const accounts = groups.get(metadata.domain) ?? [];
        accounts.push({ userId, ...metadata });
        groups.set(metadata.domain, accounts);
    }
    for (const accounts of groups.values()) accounts.sort(byAge);
    return groups;
}

/**
 * Domains to review now: with requests not posted before, at most once a
 * day each and REVIEW_DAILY_LIMIT a day in all. Each review lists the next
 * MAX_LISTED of them; the rest wait for the next one. Posted requests are
 * tracked by id, so one KV shows late is still listed. The returned state
 * counts the runs; mark() records what a post listed once it is out.
 */
export function due(groups, state = {}, now) {
    const day = new Date(now).toISOString().slice(0, 10);
    let runs = state.day === day ? state.runs : 0;
    const picked = [];
    for (const [domain, accounts] of groups) {
        const last = state.domains?.[domain];
        const posted = new Set(last?.posted);
        const waiting = accounts.filter((a) => !posted.has(a.userId));
        if (!waiting.length || (last && now - last.at < DAY_MS)) continue;
        if (runs >= REVIEW_DAILY_LIMIT) break;
        runs++;
        picked.push({
            domain,
            ids: accounts.map((a) => a.userId),
            pending: accounts.length,
            waiting: waiting.length,
            listed: waiting.slice(0, MAX_LISTED),
        });
    }
    return { picked, state: { ...state, day, runs } };
}

// Keeps only ids still pending, so the list never outgrows the requests.
export function mark(state, { domain, ids, listed }, now) {
    const pendingIds = new Set(ids);
    const posted = (state.domains?.[domain]?.posted ?? []).filter((id) =>
        pendingIds.has(id),
    );
    return {
        ...state,
        domains: {
            ...state.domains,
            [domain]: {
                at: now,
                posted: [...posted, ...listed.map((a) => a.userId)],
            },
        },
    };
}

const days = (from, now) => Math.floor((now - from) / DAY_MS);

/**
 * What the model reads: numbers only, accounts by position, never their ids.
 * A failed Tinybird read comes through as { error }.
 */
export function reviewEvidence({ domain, listed }, signups, usage, now) {
    const used = new Map(
        Array.isArray(usage) ? usage.map((u) => [u.user_id, u]) : [],
    );
    return {
        domain,
        signupsPerDay: signups,
        accounts: listed.map((a, i) => {
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

/** The review post: evidence box, the AI's line, then the commands. */
export function reviewMessage(review, facts, line) {
    const { domain, listed } = review;
    const total = Array.isArray(facts.signupsPerDay)
        ? facts.signupsPerDay.reduce((sum, d) => sum + d.accounts, 0)
        : "unknown";
    const peak = Array.isArray(facts.signupsPerDay)
        ? facts.signupsPerDay.reduce(
              (top, d) => (d.accounts > (top?.accounts ?? 0) ? d : top),
              null,
          )
        : null;
    const usage = facts.accounts.some((a) => a.requests30d === "unknown")
        ? "unknown"
        : `${facts.accounts.filter((a) => a.requests30d > 0).length} of ${listed.length} in 30d`;
    const box = panel(`REVIEW: domain ${domain}`, [
        ["ASKING", `${review.pending} pending, ${listed.length} listed here`],
        [
            "SIGNUPS",
            `${total} in 30d${peak ? `, ${peak.accounts} on ${peak.day}` : ""}`,
        ],
        ["API USE", usage],
    ]);
    const commands = [
        ...listed.flatMap((a) => [
            kvPut(`decision:${a.userId}`, "approved"),
            kvPut(`decision:${a.userId}`, "declined"),
        ]),
        kvPut(`release:${domain}`, "released"),
    ];
    const left = review.waiting - listed.length;
    const more =
        left > 0 ? `\n${left} more waiting: the next review lists them.` : "";
    return {
        text: `${box}\n↳ ${line ?? "no AI recommendation"}${more}\nApprove or decline each account, or release the whole domain:\n\`\`\`\n${commands.join("\n")}\n\`\`\``,
        ping: false,
        color: ORANGE,
    };
}
