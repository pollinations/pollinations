import { getLogger } from "@logtape/logtape";
import { fetchTinybirdRows, requireTinybirdReadToken } from "./tinybird.ts";

// Account notices: emails about the user's own account state, sent through the
// Cloudflare Email Service binding. They are service messages, so they carry
// no promotions, no tracking pixels, and no unsubscribe list.

const log = getLogger(["enter", "account-notices"]);

const FROM = {
    email: "notifications@notify.pollinations.ai",
    name: "Pollinations",
};
const REPLY_TO = "billing@pollinations.ai";
const LOW_BALANCE_SHARE = 0.2;
const PAYMENT_REQUIRED_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

// Sending is unavailable for everyone: stop the run, retry next hour.
const STOP_RUN_CODES = new Set([
    "E_RATE_LIMIT_EXCEEDED",
    "E_DAILY_LIMIT_EXCEEDED",
    "E_INTERNAL_SERVER_ERROR",
    "E_SENDER_NOT_VERIFIED",
    "E_SENDER_DOMAIN_NOT_AVAILABLE",
]);

// Same rule as enabling auto top-up: an expired ban no longer counts.
const NOT_BANNED = "(COALESCE(banned, 0) = 0 OR ban_expires <= unixepoch())";

type Notice = {
    id: "low_balance" | "payment_required" | "auto_top_up_off";
    subject: string;
    heading: string;
    paragraphs: string[];
    list?: string[];
    button: { label: string; path: string };
};

export type PaymentRequiredRow = {
    user_id: string;
    api_key_id: string;
    api_key_name: string;
    error_code: "KEY_BUDGET_EXHAUSTED" | "INSUFFICIENT_BALANCE";
    failures: number;
};

const pollen = (amount: number) => `${Math.max(0, amount).toFixed(2)} Pollen`;

export function lowBalanceNotice(balance: number, lastPack: number): Notice {
    return {
        id: "low_balance",
        subject: "Your paid Pollen balance is running low",
        heading: "Your paid balance is running low",
        paragraphs: [
            `You have ${pollen(balance)} left, less than 20% of your last pack of ${pollen(lastPack)}.`,
            "When it runs out, requests that need paid Pollen will fail. Auto top-up in your wallet can refill it for you.",
        ],
        button: { label: "Top up", path: "/top-up" },
    };
}

export function paymentRequiredNotice(rows: PaymentRequiredRow[]): Notice {
    const reason = {
        KEY_BUDGET_EXHAUSTED: "the key reached its Pollen budget",
        INSUFFICIENT_BALANCE: "your account ran out of Pollen",
    };
    const needsPollen = rows.some(
        (row) => row.error_code === "INSUFFICIENT_BALANCE",
    );
    return {
        id: "payment_required",
        subject:
            rows.length === 1
                ? "Requests from your API key are failing"
                : "Requests from your API keys are failing",
        heading: "Your API requests are failing",
        paragraphs: [
            "In the last 24 hours these keys got payment errors (HTTP 402):",
        ],
        list: rows.map(
            (row) =>
                `${row.api_key_name === "undefined" ? "Unnamed key" : row.api_key_name}: ${row.failures} failed requests, ${reason[row.error_code]}`,
        ),
        button: needsPollen
            ? { label: "Top up", path: "/top-up" }
            : { label: "Manage keys", path: "/keys" },
    };
}

export function autoTopUpOffNotice(balance: number): Notice {
    return {
        id: "auto_top_up_off",
        subject: "Auto top-up is off",
        heading: "We switched off auto top-up",
        paragraphs: [
            "We couldn't use your saved payment details, so auto top-up is now off.",
            `Your keys keep working until your paid balance of ${pollen(balance)} runs out. You can update your card and turn it back on in your wallet.`,
        ],
        button: { label: "Open wallet", path: "/pollen" },
    };
}

const escapeHtml = (value: string) =>
    value.replace(
        /[&<>"']/g,
        (char) =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
            })[char] as string,
    );

const REASON =
    "You're getting this email because it affects your Pollinations account.";
const ADDRESS = "Myceli.AI OÜ · Tornimäe tn 5, 10145 Tallinn, Estonia";

/** Render one notice as branded HTML plus its plain-text twin. */
export function renderNotice(
    notice: Notice,
    baseUrl: string,
): { html: string; text: string } {
    const url = new URL(notice.button.path, baseUrl);
    url.searchParams.set("utm_source", "email");
    url.searchParams.set("utm_campaign", notice.id);
    const href = url.toString();
    // PNGs served by the dashboard (frontend/public/email); email clients drop SVG.
    const asset = (name: string) => new URL(`/email/${name}.png`, baseUrl);
    const links = [
        { label: "Website", icon: "website", href: "https://pollinations.ai" },
        {
            label: "Dashboard",
            icon: "dashboard",
            href: new URL("/", baseUrl).toString(),
        },
        {
            label: "GitHub",
            icon: "github",
            href: "https://github.com/pollinations/pollinations",
        },
        {
            label: "Email",
            icon: "email",
            href: "mailto:billing@pollinations.ai",
        },
    ];

    // Colours are the @pollinations/ui tokens as hex: email clients can't read oklch.
    const font =
        "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
    const p = (text: string) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#272117">${escapeHtml(text)}</p>`;
    const list = notice.list?.length
        ? `<ul style="margin:0 0 16px;padding-left:20px;font-size:16px;line-height:24px;color:#272117">${notice.list
              .map((item) => `<li>${escapeHtml(item)}</li>`)
              .join("")}</ul>`
        : "";
    const footerLinks = links
        .map(
            (link) => `<td align="center" style="padding:0 8px">
<a href="${escapeHtml(link.href)}" style="color:#272117;text-decoration:none">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" valign="middle" width="40" height="40" style="width:40px;height:40px;border-radius:20px;background:#fef8eb"><img src="${asset(link.icon)}" width="20" height="20" alt="" style="display:block"></td></tr></table>
<span style="display:block;margin-top:6px;font-size:12px;line-height:16px;font-weight:600">${link.label}</span>
</a></td>`,
        )
        .join("\n");

    const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#e3ded5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e3ded5;font-family:${font}">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="padding:0 8px 20px"><img src="${asset("lockup")}" width="160" height="20" alt="pollinations.ai" style="display:block"></td></tr>
<tr><td style="background:#fef8eb;border-radius:20px;padding:32px">
<h1 style="margin:0 0 16px;font-size:22px;line-height:28px;color:#110518">${escapeHtml(notice.heading)}</h1>
${notice.paragraphs.map(p).join("\n")}
${list}
<a href="${escapeHtml(href)}" style="display:inline-block;margin-top:8px;padding:12px 24px;border-radius:999px;background:#ffd76d;color:#110518;font-size:16px;font-weight:600;text-decoration:none">${escapeHtml(notice.button.label)}</a>
</td></tr>
<tr><td align="center" style="padding:28px 0 0">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
${footerLinks}
</tr></table></td></tr>
<tr><td style="padding:24px 24px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:1px solid #cfc8bc;font-size:0;line-height:0">&nbsp;</td></tr></table></td></tr>
<tr><td align="center" style="padding:16px 24px 0;font-size:12px;line-height:18px;color:#646058">
${escapeHtml(REASON)}<br>
Questions? <a href="mailto:billing@pollinations.ai" style="color:#272117;font-weight:600;text-decoration:none">billing@pollinations.ai</a><br>
${escapeHtml(ADDRESS)}</td></tr>
</table></td></tr></table>
</body></html>`;

    const text = [
        notice.heading,
        "",
        ...notice.paragraphs.flatMap((paragraph) => [paragraph, ""]),
        ...(notice.list?.length
            ? [...notice.list.map((item) => `- ${item}`), ""]
            : []),
        `${notice.button.label}: ${href}`,
        "",
        "--",
        ...links.map(
            (link) => `${link.label}: ${link.href.replace("mailto:", "")}`,
        ),
        "",
        REASON,
        "Questions? billing@pollinations.ai",
        ADDRESS,
    ].join("\n");

    return { html, text };
}

/**
 * Send one notice. True once the recipient is settled: delivered, or suppressed
 * by Cloudflare after bounces or complaints. False leaves it for the next hourly
 * run. Throws when sending is down for everyone, so the run stops.
 */
export async function sendNotice(
    env: CloudflareBindings,
    to: string,
    notice: Notice,
): Promise<boolean> {
    try {
        await env.EMAIL.send({
            to,
            from: FROM,
            replyTo: REPLY_TO,
            subject: notice.subject,
            ...renderNotice(notice, env.BETTER_AUTH_URL),
        });
        return true;
    } catch (error) {
        const code = (error as { code?: string }).code ?? "unknown";
        log.error("Account notice failed: {subject} code={code} {error}", {
            subject: notice.subject,
            code,
            error: error instanceof Error ? error.message : String(error),
        });
        if (STOP_RUN_CODES.has(code)) throw error;
        return code === "E_RECIPIENT_SUPPRESSED";
    }
}

/** Send a due auto top-up notice and clear it once settled. */
export async function sendAutoTopUpOffNotice(
    env: CloudflareBindings,
    user: { id: string; email: string; balance: number },
): Promise<void> {
    if (await sendNotice(env, user.email, autoTopUpOffNotice(user.balance))) {
        await env.DB.prepare(
            "UPDATE user SET auto_top_up_off_notice_due = 0 WHERE id = ?",
        )
            .bind(user.id)
            .run();
    }
}

async function sendDueAutoTopUpOffNotices(
    env: CloudflareBindings,
): Promise<void> {
    const { results } = await env.DB.prepare(
        `SELECT id, email, COALESCE(pack_balance, 0) AS balance FROM user
        WHERE auto_top_up_off_notice_due = 1
            AND auto_top_up_enabled = 0
            AND ${NOT_BANNED}
        LIMIT 500`,
    ).all<{ id: string; email: string; balance: number }>();

    for (const user of results) await sendAutoTopUpOffNotice(env, user);
}

async function sendLowBalanceNotices(env: CloudflareBindings): Promise<void> {
    // Latest checkout per buyer; created_at holds seconds on old rows and
    // milliseconds on new ones. The marker stores the purchase it warned about,
    // so any later purchase re-arms the notice.
    const { results } = await env.DB.prepare(
        `WITH purchases AS (
            SELECT user_id, pollen_credited,
                CASE WHEN created_at < 100000000000 THEN created_at * 1000 ELSE created_at END AS created_ms
            FROM stripe_checkout_credits
        ), last_purchase AS (
            SELECT user_id, pollen_credited, created_ms,
                ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_ms DESC) AS rn
            FROM purchases
        )
        SELECT u.id, u.email, COALESCE(u.pack_balance, 0) AS balance,
            p.pollen_credited AS lastPack, p.created_ms AS purchasedAt
        FROM last_purchase p
        JOIN user u ON u.id = p.user_id
        WHERE p.rn = 1
            AND u.auto_top_up_enabled = 0
            AND ${NOT_BANNED}
            AND COALESCE(u.pack_balance, 0) < ? * p.pollen_credited
            AND (u.low_balance_notified_at IS NULL OR u.low_balance_notified_at < p.created_ms)
        LIMIT 500`,
    )
        .bind(LOW_BALANCE_SHARE)
        .all<{
            id: string;
            email: string;
            balance: number;
            lastPack: number;
            purchasedAt: number;
        }>();

    for (const user of results) {
        const notice = lowBalanceNotice(user.balance, user.lastPack);
        if (!(await sendNotice(env, user.email, notice))) continue;
        await env.DB.prepare(
            "UPDATE user SET low_balance_notified_at = ? WHERE id = ?",
        )
            .bind(user.purchasedAt, user.id)
            .run();
    }
}

async function sendPaymentRequiredNotices(
    env: CloudflareBindings,
): Promise<void> {
    const rows = await fetchTinybirdRows<PaymentRequiredRow>(
        new URL(env.TINYBIRD_INGEST_URL).origin,
        "/v0/pipes/account_notice_payment_required.json",
        requireTinybirdReadToken(env),
        { environment: env.ENVIRONMENT },
    );
    if (rows.length === 0) return;

    const byUser = Map.groupBy(rows, (row) => row.user_id);
    const { results: users } = await env.DB.prepare(
        `SELECT id, email FROM user
        WHERE id IN (SELECT value FROM json_each(?))
            AND ${NOT_BANNED}
            AND (payment_required_notified_at IS NULL OR payment_required_notified_at < ?)`,
    )
        .bind(
            JSON.stringify([...byUser.keys()]),
            Date.now() - PAYMENT_REQUIRED_COOLDOWN_MS,
        )
        .all<{ id: string; email: string }>();

    for (const user of users) {
        const notice = paymentRequiredNotice(byUser.get(user.id) ?? []);
        if (!(await sendNotice(env, user.email, notice))) continue;
        await env.DB.prepare(
            "UPDATE user SET payment_required_notified_at = ? WHERE id = ?",
        )
            .bind(Date.now(), user.id)
            .run();
    }
}

/** Hourly cron: due auto top-up, low-balance and failing-key notices. */
export async function runAccountNotices(
    env: CloudflareBindings,
): Promise<void> {
    await sendDueAutoTopUpOffNotices(env);
    await sendLowBalanceNotices(env);
    await sendPaymentRequiredNotices(env);
}
