// Telegram posts each update here. One Durable Object, "mama", holds every
// user and does the work: a request returns at once, and setup and sign-in
// keep running in the object for up to 15 minutes.
import { DurableObject } from "cloudflare:workers";
import { load, onUpdate, type Update, webhookSecret } from "./mama.ts";

type Env = { MAMA: DurableObjectNamespace<Mama> };

export class Mama extends DurableObject<Env> {
    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
        ctx.blockConcurrencyWhile(() => load(ctx.storage));
    }

    update(update: Update) {
        this.ctx.waitUntil(onUpdate(update));
    }

    // One-time move of the users Mama kept on the Mac (~/.mama-barbara.json).
    // Remove after the cutover.
    async import(users: Record<string, { key?: string }>) {
        const stored: typeof users =
            (await this.ctx.storage.get("users")) ?? {};
        if (Object.values(stored).some((u) => u.key))
            throw new Error("Mama already has signed-in users");
        await this.ctx.storage.put("users", users);
        await load(this.ctx.storage);
    }
}

export default {
    async fetch(request: Request, env: Env) {
        if (
            request.method !== "POST" ||
            request.headers.get("x-telegram-bot-api-secret-token") !==
                (await webhookSecret())
        ) {
            return new Response("Not found", { status: 404 });
        }
        const mama = env.MAMA.getByName("mama");
        if (new URL(request.url).pathname === "/import") {
            await mama.import(await request.json());
            return new Response("imported");
        }
        await mama.update(await request.json());
        return new Response("ok");
    },
};
