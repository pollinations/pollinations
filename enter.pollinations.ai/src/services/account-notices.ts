import { Buffer } from "node:buffer";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getLogger } from "@logtape/logtape";

// Account emails: facts about the user's own account, sent through the
// Cloudflare Email Service binding. A user gets at most one balance email
// (running low or auto top-up off) per 30 days, and none after they
// unsubscribe.

const log = getLogger(["enter", "account-notices"]);

const FROM = {
    email: "notifications@notify.pollinations.ai",
    name: "Pollinations",
};
const REPLY_TO = "billing@pollinations.ai";
const ADDRESS = "Myceli.AI OÜ · Tornimäe tn 5, 10145 Tallinn, Estonia";
const NOTICE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

type Link = { label: string; path: string };

type Notice = {
    id: "running_low" | "auto_top_up_off";
    subject: string;
    body: string;
    button: Link;
};

const pollen = (amount: number) => `${Math.max(0, amount).toFixed(2)} Pollen`;

export function runningLowNotice(balance: number): Notice {
    return {
        id: "running_low",
        subject: "Your paid balance is running low",
        body: `You have ${pollen(balance)} left.`,
        button: { label: "Top up", path: "/top-up" },
    };
}

export function autoTopUpOffNotice(balance: number): Notice {
    return {
        id: "auto_top_up_off",
        subject: "Auto top-up failed",
        body: `We couldn't use your saved payment method, so auto top-up is now off. You have ${pollen(balance)} left.`,
        button: { label: "Open wallet", path: "/pollen" },
    };
}

/** Signs a user id for the unsubscribe link, so the link needs no login. */
export function signUnsubscribe(secret: string, userId: string): string {
    return createHmac("sha256", `pollinations-unsubscribe:v1\0${secret}`)
        .update(userId)
        .digest("base64url");
}

export function verifyUnsubscribe(
    secret: string,
    userId: string,
    sig: string,
): boolean {
    const expected = Buffer.from(signUnsubscribe(secret, userId));
    const actual = Buffer.from(sig);
    return (
        expected.length === actual.length && timingSafeEqual(expected, actual)
    );
}

/** One notice as a short HTML email plus its plain-text twin. */
export function renderNotice(
    notice: Notice,
    baseUrl: string,
    unsubscribeUrl: string,
): { html: string; text: string } {
    const href = (link: Link) => new URL(link.path, baseUrl).toString();
    const footer =
        "You're getting this email because it's about your Pollinations account. Questions? Reply to this email.";

    const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 16px;background:#f4efe6;color:#1d1420;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<div style="max-width:520px;margin:0 auto;background:#fffaf0;border-radius:16px;padding:28px">
<p style="margin:0 0 20px;font-size:14px;font-weight:700">pollinations.ai</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:28px">${notice.subject}</h1>
<p style="margin:0 0 16px;font-size:16px;line-height:24px">${notice.body}</p>
<a href="${href(notice.button)}" style="display:inline-block;margin-top:4px;padding:12px 24px;border-radius:999px;background:#ffd76d;color:#1d1420;font-size:16px;font-weight:600;text-decoration:none">${notice.button.label}</a>
</div>
<p style="max-width:520px;margin:16px auto 0;font-size:12px;line-height:18px;color:#6b6359;text-align:center">${footer} <a href="${unsubscribeUrl}" style="color:#6b6359">Unsubscribe</a> from all our emails.<br>${ADDRESS}</p>
</body></html>`;

    const text = [
        notice.subject,
        "",
        notice.body,
        "",
        `${notice.button.label}: ${href(notice.button)}`,
        "",
        "--",
        footer,
        `Unsubscribe from all our emails: ${unsubscribeUrl}`,
        ADDRESS,
    ].join("\n");

    return { html, text };
}

/** Send one notice. False when sending failed; the failure is logged. */
export async function sendNotice(
    env: CloudflareBindings,
    user: { id: string; email: string },
    notice: Notice,
): Promise<boolean> {
    const unsubscribeUrl = new URL("/api/unsubscribe", env.BETTER_AUTH_URL);
    unsubscribeUrl.search = new URLSearchParams({
        u: user.id,
        s: signUnsubscribe(env.BETTER_AUTH_SECRET, user.id),
    }).toString();
    try {
        await env.EMAIL.send({
            to: user.email,
            from: FROM,
            replyTo: REPLY_TO,
            subject: notice.subject,
            // One-click unsubscribe (RFC 8058), which Gmail and Yahoo expect.
            headers: {
                "List-Unsubscribe": `<${unsubscribeUrl}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
            ...renderNotice(notice, env.BETTER_AUTH_URL, unsubscribeUrl.href),
        });
        return true;
    } catch (error) {
        log.error("Account notice {id} failed: {code} {error}", {
            id: notice.id,
            code: (error as { code?: string }).code ?? "unknown",
            error: error instanceof Error ? error.message : String(error),
        });
        return false;
    }
}

/**
 * Called when a charge takes the paid balance of a user without auto top-up
 * below the threshold. Sends at most one balance email per 30 days.
 */
export async function sendRunningLowNotice(
    env: CloudflareBindings,
    userId: string,
): Promise<void> {
    const now = Date.now();
    // Claim the slot first, so parallel triggers send a single email.
    const user = await env.DB.prepare(
        `UPDATE user SET low_balance_notified_at = ?
            WHERE id = ?
                AND (low_balance_notified_at IS NULL OR low_balance_notified_at < ?)
                AND email_unsubscribed_at IS NULL
            RETURNING email, COALESCE(pack_balance, 0) AS balance`,
    )
        .bind(now, userId, now - NOTICE_COOLDOWN_MS)
        .first<{ email: string; balance: number }>();
    if (!user) return;

    const notice = runningLowNotice(user.balance);
    if (await sendNotice(env, { id: userId, email: user.email }, notice)) {
        return;
    }
    // A failed send frees the slot for the next crossing.
    await env.DB.prepare(
        "UPDATE user SET low_balance_notified_at = NULL WHERE id = ?",
    )
        .bind(userId)
        .run();
}
