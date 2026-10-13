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
const DAY_MS = 24 * 60 * 60 * 1000;

type Link = { label: string; path: string };

type Notice = {
    id: "running_low" | "auto_top_up_off";
    subject: string;
    paragraphs: string[];
    button: Link;
    footnote?: { text: string; link: Link };
};

const pollen = (amount: number) => `${Math.max(0, amount).toFixed(2)} Pollen`;

// The first_auto_top_up quest pays 20 Quest Pollen for a user's first paid
// auto top-up, so only users who never had one get the offer.
export const AUTO_TOP_UP_OFFER_COLUMN = `NOT EXISTS (
    SELECT 1 FROM stripe_auto_top_up_attempt
        WHERE user_id = user.id AND status = 'paid'
) AS autoTopUpOffer`;

export function runningLowNotice(
    balance: number,
    lastPack: { pollen: number; days: number } | null,
    autoTopUpOffer: boolean,
): Notice {
    return {
        id: "running_low",
        subject: "Your paid Pollen is running low",
        paragraphs: [
            `You have ${pollen(balance)} left in your paid balance. When it runs out, requests that need paid Pollen will fail.`,
            ...(lastPack
                ? [
                      `Your last pack of ${pollen(lastPack.pollen)} lasted ${lastPack.days === 1 ? "1 day" : `${lastPack.days} days`}.`,
                  ]
                : []),
            "Top up now, or turn on auto top-up in your wallet so it refills by itself.",
            ...(autoTopUpOffer
                ? [
                      "When auto top-up first refills your balance, you get 20 Quest Pollen.",
                  ]
                : []),
        ],
        button: { label: "Top up", path: "/top-up" },
        footnote: {
            text: "You can also earn Quest Pollen:",
            link: { label: "see quests", path: "/quests" },
        },
    };
}

export function autoTopUpOffNotice(
    balance: number,
    autoTopUpOffer: boolean,
): Notice {
    return {
        id: "auto_top_up_off",
        subject: "Auto top-up is off",
        paragraphs: [
            "We couldn't use your saved payment details, so auto top-up is now off.",
            `Your keys keep working until your paid balance of ${pollen(balance)} runs out. You can update your card and turn it back on in your wallet.`,
            ...(autoTopUpOffer
                ? [
                      "When auto top-up first refills your balance, you get 20 Quest Pollen.",
                  ]
                : []),
        ],
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
    const p = (text: string) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:24px">${text}</p>`;
    const footnote = notice.footnote
        ? `<p style="margin:20px 0 0;font-size:14px;line-height:20px;color:#6b6359">${notice.footnote.text} <a href="${href(notice.footnote.link)}" style="color:#1d1420">${notice.footnote.link.label}</a></p>`
        : "";

    const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 16px;background:#f4efe6;color:#1d1420;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<div style="max-width:520px;margin:0 auto;background:#fffaf0;border-radius:16px;padding:28px">
<p style="margin:0 0 20px;font-size:14px;font-weight:700">pollinations.ai</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:28px">${notice.subject}</h1>
${notice.paragraphs.map(p).join("\n")}
<a href="${href(notice.button)}" style="display:inline-block;margin-top:4px;padding:12px 24px;border-radius:999px;background:#ffd76d;color:#1d1420;font-size:16px;font-weight:600;text-decoration:none">${notice.button.label}</a>
${footnote}
</div>
<p style="max-width:520px;margin:16px auto 0;font-size:12px;line-height:18px;color:#6b6359;text-align:center">${footer} <a href="${unsubscribeUrl}" style="color:#6b6359">Unsubscribe</a> from all our emails.<br>${ADDRESS}</p>
</body></html>`;

    const text = [
        notice.subject,
        "",
        ...notice.paragraphs.flatMap((paragraph) => [paragraph, ""]),
        `${notice.button.label}: ${href(notice.button)}`,
        ...(notice.footnote
            ? ["", `${notice.footnote.text} ${href(notice.footnote.link)}`]
            : []),
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
            RETURNING email, COALESCE(pack_balance, 0) AS balance,
                ${AUTO_TOP_UP_OFFER_COLUMN}`,
    )
        .bind(now, userId, now - NOTICE_COOLDOWN_MS)
        .first<{ email: string; balance: number; autoTopUpOffer: number }>();
    if (!user) return;

    // created_at holds seconds on old rows and milliseconds on new ones.
    const lastPack = await env.DB.prepare(
        `SELECT pollen_credited AS pollen,
                CASE WHEN created_at < 100000000000 THEN created_at * 1000 ELSE created_at END AS createdMs
            FROM stripe_checkout_credits
            WHERE user_id = ?
            ORDER BY createdMs DESC
            LIMIT 1`,
    )
        .bind(userId)
        .first<{ pollen: number; createdMs: number }>();

    const notice = runningLowNotice(
        user.balance,
        lastPack && {
            pollen: lastPack.pollen,
            days: Math.max(1, Math.round((now - lastPack.createdMs) / DAY_MS)),
        },
        Boolean(user.autoTopUpOffer),
    );
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
