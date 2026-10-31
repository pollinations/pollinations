import { getLogger } from "@logtape/logtape";
import { getDomain } from "tldts";
import type { Env } from "../env.ts";

const log = getLogger(["enter", "setup-reward-signups"]);

/** Accounts on one private email domain in 24 hours before it is flagged. */
const SETUP_REWARD_LIMIT = 30;
const DAY_SECONDS = 24 * 60 * 60;
// A flagged domain is reported again if it is still busy after 30 days.
const FLAG_SECONDS = 30 * DAY_SECONDS;
const SIGNUP_PREFIX = "signup:";
const FLAG_PREFIX = "signup-flagged:";
// Discord embed side bar, as in infra-watch's warnings.
const FLAGGED_COLOR = 0xef9f27;

/**
 * Shared mail providers are never counted or flagged. Exact domains only: a
 * look-alike on another suffix (gmail.xyz) is anyone's to register.
 */
const PUBLIC_MAIL_DOMAINS = new Set([
    "gmail.com",
    "googlemail.com",
    "outlook.com",
    "outlook.fr",
    "outlook.de",
    "outlook.es",
    "outlook.it",
    "outlook.jp",
    "outlook.com.br",
    "hotmail.com",
    "hotmail.co.uk",
    "hotmail.fr",
    "hotmail.de",
    "hotmail.es",
    "hotmail.it",
    "hotmail.com.br",
    "live.com",
    "live.co.uk",
    "live.fr",
    "live.de",
    "live.it",
    "live.com.mx",
    "msn.com",
    "yahoo.com",
    "yahoo.co.uk",
    "yahoo.fr",
    "yahoo.de",
    "yahoo.es",
    "yahoo.it",
    "yahoo.co.jp",
    "yahoo.co.in",
    "yahoo.com.br",
    "ymail.com",
    "rocketmail.com",
    "aol.com",
    "icloud.com",
    "me.com",
    "mac.com",
    "proton.me",
    "protonmail.com",
    "pm.me",
    "tutanota.com",
    "tutanota.de",
    "tuta.io",
    "tuta.com",
    "tutamail.com",
    "fastmail.com",
    "fastmail.fm",
    "hey.com",
    "duck.com",
    "mailbox.org",
    "posteo.de",
    "posteo.net",
    "zoho.com",
    "mail.com",
    "gmx.com",
    "gmx.net",
    "gmx.de",
    "gmx.at",
    "gmx.ch",
    "web.de",
    "t-online.de",
    "freenet.de",
    "orange.fr",
    "free.fr",
    "laposte.net",
    "sfr.fr",
    "wanadoo.fr",
    "libero.it",
    "virgilio.it",
    "seznam.cz",
    "wp.pl",
    "o2.pl",
    "interia.pl",
    "onet.pl",
    "yandex.ru",
    "yandex.com",
    "yandex.ua",
    "ya.ru",
    "mail.ru",
    "bk.ru",
    "inbox.ru",
    "list.ru",
    "rambler.ru",
    "qq.com",
    "foxmail.com",
    "163.com",
    "126.com",
    "yeah.net",
    "sina.com",
    "sina.cn",
    "sohu.com",
    "aliyun.com",
    "139.com",
    "naver.com",
    "hanmail.net",
    "daum.net",
    "kakao.com",
    "rediffmail.com",
    "uol.com.br",
    "bol.com.br",
    "terra.com.br",
    "att.net",
    "comcast.net",
    "verizon.net",
    "sbcglobal.net",
    "bellsouth.net",
    "cox.net",
]);

/**
 * The domain a registrant controls (Public Suffix List), so subdomains
 * (a1.farm.com, a2.farm.com) count as one. Null when the host has none
 * (co.uk, an IP): such sign-ups are never counted, so a public suffix is
 * never flagged.
 */
export function registrableDomain(email: string): string | null {
    const host = email
        .slice(email.lastIndexOf("@") + 1)
        .toLowerCase()
        .replace(/\.+$/, "");
    return getDomain(host, { validateHostname: false });
}

/**
 * Records an account on a private email domain at its first setup reward, as
 * a KV key that expires after 24 hours: the expiry is the counting window.
 */
export async function recordSetupRewardSignup(
    kv: KVNamespace,
    { userId, email }: { userId: string; email: string },
): Promise<void> {
    const domain = registrableDomain(email);
    if (!domain || PUBLIC_MAIL_DOMAINS.has(domain)) return;
    await kv.put(`${SIGNUP_PREFIX}${domain}:${userId}`, "", {
        expirationTtl: DAY_SECONDS,
        metadata: { at: Math.floor(Date.now() / 1000) },
    });
}

type Activity = { accounts: number; since: number };

/**
 * Runs on a schedule: counts the last 24 hours of sign-ups per domain and
 * reports each domain past the limit once. KV is eventually consistent, so a
 * schedule (not the sign-up itself) makes sure a burst is seen once visible.
 */
export async function detectFlaggedDomains(
    env: Env["Bindings"],
): Promise<string[]> {
    const activity = new Map<string, Activity>();
    let cursor: string | undefined;
    do {
        const page = await env.KV.list<{ at: number }>({
            prefix: SIGNUP_PREFIX,
            cursor,
        });
        for (const key of page.keys) {
            const domain = key.name.slice(
                SIGNUP_PREFIX.length,
                key.name.lastIndexOf(":"),
            );
            const at = key.metadata?.at ?? 0;
            const seen = activity.get(domain);
            activity.set(domain, {
                accounts: (seen?.accounts ?? 0) + 1,
                since: Math.min(seen?.since ?? at, at),
            });
        }
        cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);

    const flagged: string[] = [];
    for (const [domain, { accounts, since }] of activity) {
        if (accounts <= SETUP_REWARD_LIMIT) continue;
        if (await env.KV.get(`${FLAG_PREFIX}${domain}`)) continue;
        // Report first: a failed post is retried on the next run.
        await reportFlaggedDomain(env, { domain, accounts, since });
        await env.KV.put(`${FLAG_PREFIX}${domain}`, String(accounts), {
            expirationTtl: FLAG_SECONDS,
        });
        flagged.push(domain);
    }
    return flagged;
}

/** A box titled with what happened, in infra-watch's alert style. */
function panel(title: string, rows: [string, string][]): string {
    const body = rows.map(([field, value]) => `${field.padEnd(9)}${value}`);
    const inner = Math.max(30, title.length + 2, ...body.map((t) => t.length));
    return [
        "```",
        `┌─ ${title} ${"─".repeat(inner - title.length - 1)}┐`,
        ...body.map((t) => `│ ${t.padEnd(inner)} │`),
        `└${"─".repeat(inner + 2)}┘`,
        "```",
    ].join("\n");
}

/**
 * Posts a flagged domain to Discord: what happened and the numbers for a
 * review. Without a webhook (local, tests) the message is only logged.
 */
async function reportFlaggedDomain(
    env: Env["Bindings"],
    { domain, accounts, since }: Activity & { domain: string },
): Promise<void> {
    const staging = env.ENVIRONMENT === "staging" ? "[staging] " : "";
    const description = panel(`${staging}FLAGGED: domain ${domain}`, [
        ["ACCOUNTS", `${accounts} in 24h (limit ${SETUP_REWARD_LIMIT})`],
        [
            "SINCE",
            `${new Date(since * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`,
        ],
        ["REWARDS", "still paid, review the domain"],
    ]);
    const webhook = env.SETUP_REWARD_DISCORD_WEBHOOK_URL;
    if (!webhook) {
        log.info("SETUP_REWARD_REPORT (no webhook):\n{description}", {
            description,
        });
        return;
    }
    const response = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            username: "Onboarding rewards",
            embeds: [{ description, color: FLAGGED_COLOR }],
            allowed_mentions: { parse: [] },
        }),
        signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`Discord webhook -> ${response.status}`);
}
