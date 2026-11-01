// After each deploy: Telegram posts every update to the Worker with the secret
// index.ts checks, and shows Mama's commands. CI runs it with the bot token.
import { webhookSecret } from "./mama.ts";

async function tg(method: string, body: object) {
    const res = await fetch(
        `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`,
        {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        },
    );
    const result = (await res.json()) as { ok: boolean; description?: string };
    if (!result.ok) throw new Error(`${method}: ${result.description}`);
}

await tg("setWebhook", {
    url: "https://mama-barbara.myceli.ai/",
    secret_token: await webhookSecret(),
    allowed_updates: ["message", "managed_bot", "callback_query"],
});
await tg("setMyCommands", {
    commands: [
        { command: "new", description: "Make a new Barbara" },
        { command: "list", description: "Your Barbaras and their settings" },
        { command: "signin", description: "Sign in to Pollinations again" },
    ],
});
console.log("Telegram posts Mama's updates to the Worker");
