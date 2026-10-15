import { Buffer } from "node:buffer";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getLogger } from "@logtape/logtape";

// Account emails: facts about the user's own account, sent through the
// Cloudflare Email Service binding. Running low goes out at most once per 30
// days; auto top-up failed goes out each time it switches off. None after the
// user unsubscribes.

const log = getLogger(["enter", "account-notices"]);

const FROM = {
    email: "notifications@notify.pollinations.ai",
    name: "Pollinations",
};
const REPLY_TO = "billing@pollinations.ai";
const ADDRESS = "Myceli.AI OÜ · Tornimäe tn 5, 10145 Tallinn, Estonia";
const NOTICE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

// Each credited pack sets the user's low_balance_threshold to this share of
// it. Without auto top-up, the charge that crosses it sends the email.
export const LOW_BALANCE_SHARE = 0.2;

type Link = { label: string; path: string };

type Notice = {
    id: "running_low" | "auto_top_up_off";
    subject: string;
    body: string;
    button: Link;
};

// Rounds down, so a balance just under the threshold never reads as the
// threshold itself (9.999 shows 9.99, not 10.00). The epsilon absorbs float
// error such as 3.42 * 100 = 341.99999999999994.
const pollen = (amount: number) =>
    `${(Math.floor(Math.max(0, amount) * 100 + 1e-9) / 100).toFixed(2)} Pollen`;

export function runningLowNotice(balance: number): Notice {
    return {
        id: "running_low",
        subject: "Your paid balance is running low",
        body: `You have ${pollen(balance)} left, less than ${LOW_BALANCE_SHARE * 100}% of your last pack.`,
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

// Footer links, shown as round icons. PNGs live in frontend/public/email,
// because email clients don't render SVG.
const FOOTER_LINKS = [
    { label: "Website", icon: "website", href: "https://pollinations.ai" },
    { label: "Dashboard", icon: "dashboard", href: "/" },
    {
        label: "GitHub",
        icon: "github",
        href: "https://github.com/pollinations/pollinations",
    },
    { label: "Email", icon: "email", href: `mailto:${REPLY_TO}` },
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
<img src="${image("polli-lockup")}" width="200" height="32" alt="pollinations.ai" style="display:block;margin:0 0 16px 4px">
<div style="background:#fffaf0;border-radius:16px;padding:28px">
<h1 style="margin:0 0 12px;font-size:22px;line-height:28px">${notice.subject}</h1>
<p style="margin:0 0 20px;font-size:16px;line-height:24px">${notice.body}</p>
<a href="${url(notice.button.path)}" style="display:inline-block;padding:12px 24px;border-radius:999px;background:#ffd76d;color:#1d1420;font-size:16px;font-weight:600;text-decoration:none">${notice.button.label}</a>
</div>
<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:28px auto 0"><tr>
${icons}
</tr></table>
<div style="margin:24px 16px 0;border-top:1px solid #d9d1c3"></div>
<img src="${image("mark")}" width="28" height="27" alt="" style="display:block;margin:20px auto 0">
<p style="margin:12px 0 0;font-size:12px;line-height:18px;color:#6b6359;text-align:center">Questions? Reply to this email · <a href="${unsubscribeUrl}" style="color:#6b6359">Unsubscribe</a><br>${ADDRESS}</p>
</div>
</body></html>`;

    const text = [
        notice.subject,
        "",
        notice.body,
        "",
        `${notice.button.label}: ${url(notice.button.path)}`,
        "",
        "--",
        ...links.map(
            (link) => `${link.label}: ${link.href.replace("mailto:", "")}`,
        ),
        "Questions? Reply to this email.",
        `Unsubscribe: ${unsubscribeUrl}`,
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
 * below their low-balance threshold. Sends at most one balance email per 30
 * days.
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
                AND COALESCE(pack_balance, 0) < low_balance_threshold
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
