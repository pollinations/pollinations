import { Buffer } from "node:buffer";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getLogger } from "@logtape/logtape";
import { LOW_BALANCE_SHARE } from "@shared/billing/auto-top-up.ts";

// Account emails: facts about the user's own account, sent through the
// Cloudflare Email Service binding. Running low goes out once per pack bought
// (each credit re-arms it); auto top-up failed goes out each time it switches
// off. None after the user unsubscribes.

const log = getLogger(["enter", "account-notices"]);

const FROM = {
    email: "notifications@notify.pollinations.ai",
    name: "Pollinations",
};
const REPLY_TO = "billing@pollinations.ai";
const ADDRESS = "Myceli.AI OÜ · Tornimäe tn 5, 10145 Tallinn, Estonia";
// The wallet's paid colour (--polli-color-paid-deep in @pollinations/ui) as
// hex, because email clients can't read oklch.
const PAID_COLOR = "#6c4800";

type Link = { label: string; path: string };

type Notice = {
    id: "running_low" | "auto_top_up_off";
    subject: string;
    // Optional line between the heading and the balance.
    intro?: string;
    // Paid balance, shown large under the heading (or the intro).
    balance: number;
    body: string;
    button: Link;
};

// Rounds down, so a balance just under the threshold never reads as the
// threshold itself (9.999 shows 9.99, not 10.00). The epsilon absorbs float
// error such as 3.42 * 100 = 341.99999999999994.
const amount = (balance: number) =>
    (Math.floor(Math.max(0, balance) * 100 + 1e-9) / 100).toFixed(2);

// Bodies separate paragraphs with a blank line and mark bold as **text**.
export function runningLowNotice(balance: number): Notice {
    return {
        id: "running_low",
        subject: "Your paid balance is running low",
        balance,
        body: "When it runs out, requests that need it will fail.\n\nTop up now, or turn on **auto top-up** so it refills by itself.",
        button: { label: "Top up", path: "/top-up" },
    };
}

// topUp is the auto top-up pack in pollen (one pollen per dollar of pack).
export function autoTopUpOffNotice(balance: number, topUp: number): Notice {
    return {
        id: "auto_top_up_off",
        subject: "Auto top-up failed",
        balance,
        intro: `We couldn’t charge your saved payment method for your ${topUp} pollen auto top-up, so auto top-up is now off.`,
        body: "When it runs out, requests that need it will fail.\n\nUpdate your payment method, then turn auto top-up back on.",
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

// Footer links, shown as round icons. The build renders the PNGs from the UI
// kit's icons (vite.config.ts), because email clients don't render SVG.
const FOOTER_LINKS = [
    { label: "Website", icon: "website", href: "https://pollinations.ai" },
    { label: "Dashboard", icon: "dashboard", href: "/" },
    {
        label: "GitHub",
        icon: "github",
        href: "https://github.com/pollinations/pollinations",
    },
    {
        label: "Discord",
        icon: "discord",
        href: "https://discord.gg/pollinations",
    },
];

/** One notice as a short HTML email plus its plain-text twin. */
export function renderNotice(
    notice: Notice,
    baseUrl: string,
    unsubscribeUrl: string,
): { html: string; text: string } {
    const url = (path: string) => new URL(path, baseUrl).toString();
    const image = (name: string) => url(`/email/${name}.png`);
    const links = FOOTER_LINKS.map((link) => ({
        ...link,
        href: url(link.href),
    }));
    const icons = links
        .map(
            (
                link,
            ) => `<td align="center" style="padding:0 8px"><a href="${link.href}" style="color:#1d1420;text-decoration:none">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" valign="middle" width="40" height="40" style="width:40px;height:40px;border-radius:20px;background:#fffaf0"><img src="${image(link.icon)}" width="20" height="20" alt="" style="display:block"></td></tr></table>
<span style="display:block;margin-top:6px;font-size:12px;line-height:16px;font-weight:600">${link.label}</span></a></td>`,
        )
        .join("\n");

    const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 16px;background:#f4efe6;color:#1d1420;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<div style="max-width:520px;margin:0 auto">
<img src="${image("polli-lockup")}" width="220" height="48" alt="pollinations.ai" style="display:block;margin:0 0 8px">
<div style="background:#fffaf0;border-radius:16px;padding:28px">
<h1 style="margin:0 0 12px;font-size:22px;line-height:28px">${notice.subject}</h1>
${notice.intro ? `<p style="margin:0 0 16px;font-size:16px;line-height:24px">${notice.intro}</p>` : ""}
<p style="margin:0 0 20px;padding:14px 18px;background:#f4efe6;border-radius:12px;color:${PAID_COLOR};font-size:32px;line-height:40px;font-weight:700"><img src="${image("card")}" width="28" height="28" alt="" style="vertical-align:-3px;margin-right:8px">${amount(notice.balance)} <span style="font-size:18px;font-weight:600">pollen left</span></p>
${notice.body
    .split("\n\n")
    .map(
        (paragraph) =>
            `<p style="margin:0 0 16px;font-size:16px;line-height:24px">${paragraph.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>`,
    )
    .join("\n")}
<a href="${url(notice.button.path)}" style="display:inline-block;padding:12px 24px;border-radius:999px;background:#ffd76d;color:#1d1420;font-size:16px;font-weight:600;text-decoration:none">${notice.button.label}</a>
</div>
<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:28px auto 0"><tr>
${icons}
</tr></table>
<div style="margin:24px 16px 0;border-top:1px solid #d9d1c3"></div>
<img src="${image("mark")}" width="28" height="27" alt="" style="display:block;margin:20px auto 0">
<p style="margin:12px 0 0;font-size:12px;line-height:18px;color:#6b6359;text-align:center"><a href="${unsubscribeUrl}" style="color:#6b6359">Unsubscribe</a><br>${ADDRESS}</p>
</div>
</body></html>`;

    // Text clients already show the subject, so the text starts with the
    // content.
    const text = [
        ...(notice.intro ? [notice.intro, ""] : []),
        `💳 ${amount(notice.balance)} pollen left`,
        "",
        notice.body.replaceAll("**", ""),
        "",
        `${notice.button.label}: ${url(notice.button.path)}`,
        "",
        // "-- " with the space is the signature marker mail clients recognise.
        "-- ",
        ...links.map((link) => `${link.label}: ${link.href}`),
        `Unsubscribe: ${unsubscribeUrl}`,
        ADDRESS,
    ].join("\n");

    return { html, text };
}

/** Send one notice. A failed send is logged. */
export async function sendNotice(
    env: CloudflareBindings,
    user: { id: string; email: string },
    notice: Notice,
): Promise<void> {
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
    } catch (error) {
        log.error("Account notice {id} failed: {code} {error}", {
            id: notice.id,
            code: (error as { code?: string }).code ?? "unknown",
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

/**
 * Called when a charge takes the paid balance of a user without auto top-up
 * below LOW_BALANCE_SHARE of their last pack. Sends at most one balance email
 * per pack bought.
 */
export async function sendRunningLowNotice(
    env: CloudflareBindings,
    userId: string,
): Promise<void> {
    // Claim the slot first, so parallel triggers send a single email.
    const user = await env.DB.prepare(
        `UPDATE user SET low_balance_notified_at = ?
            WHERE id = ?
                AND COALESCE(pack_balance, 0) < ? * last_pack_pollen
                AND low_balance_notified_at IS NULL
                AND email_unsubscribed_at IS NULL
            RETURNING email, COALESCE(pack_balance, 0) AS balance`,
    )
        .bind(Date.now(), userId, LOW_BALANCE_SHARE)
        .first<{ email: string; balance: number }>();
    if (!user) return;

    // Gen calls once per crossing, so a failed send is logged, not retried.
    await sendNotice(
        env,
        { id: userId, email: user.email },
        runningLowNotice(user.balance),
    );
}
