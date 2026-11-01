import type { Context } from "hono";
import { Hono } from "hono";
import type { Env } from "../env.ts";
import { verifyUnsubscribe } from "../services/account-notices.ts";

// The unsubscribe link in our emails. GET only shows a button, because mail
// scanners open links; the POST from that button, or from a mail client's
// one-click unsubscribe, records the opt-out.

const page = (message: string, button = "") => `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pollinations emails</title></head>
<body style="margin:0;padding:48px 16px;background:#f4efe6;color:#1d1420;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;text-align:center">
<p style="font-size:18px">${message}</p>${button}
</body></html>`;

const signedUserId = (c: Context<Env>) => {
    const userId = c.req.query("u") ?? "";
    const sig = c.req.query("s") ?? "";
    return verifyUnsubscribe(c.env.BETTER_AUTH_SECRET, userId, sig)
        ? userId
        : null;
};

const invalid = (c: Context<Env>) =>
    c.html(page("This unsubscribe link isn't valid."), 400);

export const unsubscribeRoutes = new Hono<Env>()
    .get("/", (c) => {
        if (!signedUserId(c)) return invalid(c);
        return c.html(
            page(
                "Stop balance alerts from Pollinations?",
                `<form method="post"><button style="padding:12px 24px;border:0;border-radius:999px;background:#ffd76d;color:#1d1420;font-size:16px;font-weight:600;cursor:pointer">Unsubscribe</button></form>`,
            ),
        );
    })
    .post("/", async (c) => {
        const userId = signedUserId(c);
        if (!userId) return invalid(c);
        await c.env.DB.prepare(
            `UPDATE user SET email_unsubscribed_at = ?
                WHERE id = ? AND email_unsubscribed_at IS NULL`,
        )
            .bind(Date.now(), userId)
            .run();
        return c.html(
            page(
                "You're unsubscribed. We won't send you balance alerts again.",
            ),
        );
    });
