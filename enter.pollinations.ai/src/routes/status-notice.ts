import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env.ts";

const KV_KEY = "status_notice";

interface StatusNotice {
    message: string;
    link?: string;
    linkLabel?: string;
    createdAt: string;
    createdBy: string;
}

const noticeSchema = {
    message: (v: unknown) =>
        typeof v === "string" && v.trim().length > 0 && v.length <= 500,
    link: (v: unknown) =>
        v === undefined || typeof v === "string",
    linkLabel: (v: unknown) =>
        v === undefined || typeof v === "string",
} as const;

function validateUrl(s: string): boolean {
    try {
        const u = new URL(s);
        return u.protocol === "https:" || u.protocol === "http:";
    } catch {
        return false;
    }
}

async function getNotice(kv: KVNamespace): Promise<StatusNotice | null> {
    const raw = await kv.get(KV_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

export const statusNoticeRoutes = new Hono<Env>()
    .get("/", async (c) => {
        const notice = await getNotice(c.env.KV);
        return c.json({ notice });
    })
    .put("/", async (c) => {
        const auth = c.req.header("Authorization");
        const key = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
        if (!key || key !== c.env.PLN_ENTER_TOKEN) {
            throw new HTTPException(401, { message: "Unauthorized" });
        }

        let body: Record<string, unknown>;
        try {
            body = await c.req.json();
        } catch {
            throw new HTTPException(400, { message: "Invalid JSON body" });
        }

        if (!noticeSchema.message(body.message)) {
            throw new HTTPException(400, {
                message: "Message is required (1-500 chars)",
            });
        }

        if (body.link !== undefined) {
            if (typeof body.link !== "string" || !validateUrl(body.link)) {
                throw new HTTPException(400, {
                    message: "Link must be a valid HTTP(S) URL",
                });
            }
        }

        if (body.linkLabel !== undefined && typeof body.linkLabel !== "string") {
            throw new HTTPException(400, {
                message: "Link label must be a string",
            });
        }

        const notice: StatusNotice = {
            message: (body.message as string).trim(),
            link: typeof body.link === "string" ? body.link.trim() : undefined,
            linkLabel: typeof body.linkLabel === "string" ? body.linkLabel.trim() : undefined,
            createdAt: new Date().toISOString(),
            createdBy: "admin",
        };

        await c.env.KV.put(KV_KEY, JSON.stringify(notice));
        return c.json({ success: true, notice });
    })
    .delete("/", async (c) => {
        const auth = c.req.header("Authorization");
        const key = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
        if (!key || key !== c.env.PLN_ENTER_TOKEN) {
            throw new HTTPException(401, { message: "Unauthorized" });
        }

        await c.env.KV.delete(KV_KEY);
        return c.json({ success: true, notice: null });
    });
