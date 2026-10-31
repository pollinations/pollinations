// Setup reward holds, in the SETUP_HOLDS KV store shared with Enter.
// While holds are on, a sign-up burst holds its domain: hold:<domain> =
// "held", unless a maintainer "released" it. Enter writes review:<userId> =
// "pending", with the account's evidence as metadata, when a held account
// asks. Each request is reviewed with the other pending ones on its email
// domain: the AI recommends, a maintainer decides by running one of the
// posted commands. Replacing the value drops the metadata, so only pending
// requests carry it.
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

/** Holds each burst domain not yet held or released; rows gain its hold. */
export const holdDomains = (kv, signups) =>
    Promise.all(
        signups.map(async (row) => {
            const key = `hold:${row.domain}`;
            let hold = await kv.get(key);
            if (hold === null) {
                await kv.put(key, "held");
                hold = "held";
            }
            return { ...row, hold };
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

/** Pending requests, from a KV listing of review:, grouped by domain. */
export function pending(keys) {
    const groups = new Map();
    for (const { name, metadata } of keys) {
        if (!metadata?.domain) continue;
        const accounts = groups.get(metadata.domain) ?? [];
        accounts.push({ userId: name.slice("review:".length), ...metadata });
        groups.set(metadata.domain, accounts);
    }
    return groups;
}

/**
 * Domains to review now: with a request newer than their last review, at
 * most once a day each and REVIEW_DAILY_LIMIT a day in all. The returned
 * state counts the runs; mark() records a domain once its post is out.
 */
export function due(groups, state = {}, now) {
    const day = new Date(now).toISOString().slice(0, 10);
    let runs = state.day === day ? state.runs : 0;
    const picked = [];
    for (const [domain, accounts] of groups) {
        const last = state.domains?.[domain];
        const newest = Math.max(...accounts.map((a) => a.requestedAt));
        if (last && (newest <= last.until || now - last.at < DAY_MS)) continue;
        if (runs >= REVIEW_DAILY_LIMIT) break;
        runs++;
        picked.push({ domain, accounts });
    }
    return { picked, state: { ...state, day, runs } };
}

export const mark = (state, { domain, accounts }, now) => ({
    ...state,
    domains: {
        ...state.domains,
        [domain]: {
            at: now,
            until: Math.max(...accounts.map((a) => a.requestedAt)),
        },
    },
});

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

/** The review post: evidence box, the AI's line, then the commands. */
export function reviewMessage(review, facts, line) {
    const { domain, accounts } = review;
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
        : `${facts.accounts.filter((a) => a.requests30d > 0).length} of ${accounts.length} in 30d`;
    const box = panel(`REVIEW: domain ${domain}`, [
        ["ASKING", `${accounts.length} account(s)`],
        [
            "SIGNUPS",
            `${total} in 30d${peak ? `, ${peak.accounts} on ${peak.day}` : ""}`,
        ],
        ["API USE", usage],
    ]);
    const listed = accounts.slice(0, MAX_LISTED);
    const commands = [
        ...listed.flatMap((a) => [
            kvPut(`review:${a.userId}`, "approved"),
            kvPut(`review:${a.userId}`, "declined"),
        ]),
        kvPut(`hold:${domain}`, "released"),
    ];
    const more =
        accounts.length > MAX_LISTED
            ? `\n${accounts.length - MAX_LISTED} more waiting.`
            : "";
    return {
        text: `${box}\n↳ ${line ?? "no AI recommendation"}${more}\nApprove or decline each account, or release the whole domain:\n\`\`\`\n${commands.join("\n")}\n\`\`\``,
        ping: false,
        color: ORANGE,
    };
}
