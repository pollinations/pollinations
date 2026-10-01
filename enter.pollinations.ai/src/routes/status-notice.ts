import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env.ts";

const KV_KEY = "status_notice";
const MAX_MESSAGE_LENGTH = 500;
const MAX_LINK_LABEL_LENGTH = 100;

interface StatusNotice {
    message: string;
    link?: string;
    linkLabel?: string;
}

function isHttpUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:";
    } catch {
        return false;
    }
}

async function getNotice(kv: KVNamespace): Promise<StatusNotice | null> {
    const notice = await kv.get<unknown>(KV_KEY, "json");
    if (!notice || typeof notice !== "object") return null;

    const { message, link, linkLabel } = notice as Record<string, unknown>;
    if (
        typeof message !== "string" ||
        message.length === 0 ||
        message.length > MAX_MESSAGE_LENGTH ||
        (link !== undefined &&
            (typeof link !== "string" || !isHttpUrl(link))) ||
        (linkLabel !== undefined &&
            (typeof linkLabel !== "string" ||
                linkLabel.length > MAX_LINK_LABEL_LENGTH))
    ) {
        return null;
    }

    return {
        message,
        ...(typeof link === "string" && { link }),
        ...(typeof linkLabel === "string" && { linkLabel }),
    };
}

export const statusNoticeRoutes = new Hono<Env>().get("/", async (c) => {
    return c.json({ notice: await getNotice(c.env.KV) });
});

export const statusNoticeAdminRoutes = new Hono<Env>()
    .put("/", async (c) => {
        let body: Record<string, unknown>;
        try {
            body = await c.req.json();
        } catch {
            throw new HTTPException(400, { message: "Invalid JSON body" });
        }

        const message =
            typeof body.message === "string" ? body.message.trim() : "";
        if (message.length === 0 || message.length > MAX_MESSAGE_LENGTH) {
            throw new HTTPException(400, {
                message: `Message is required (1-${MAX_MESSAGE_LENGTH} chars)`,
            });
        }

        if (body.link !== undefined && typeof body.link !== "string") {
            throw new HTTPException(400, {
                message: "Link must be a valid HTTP(S) URL",
            });
        }
        const link =
            typeof body.link === "string" ? body.link.trim() : undefined;
        if (link !== undefined && !isHttpUrl(link)) {
            throw new HTTPException(400, {
                message: "Link must be a valid HTTP(S) URL",
            });
        }

        if (
            body.linkLabel !== undefined &&
            typeof body.linkLabel !== "string"
        ) {
            throw new HTTPException(400, {
                message: "Link label must be a string",
            });
        }
        const linkLabel =
            typeof body.linkLabel === "string"
                ? body.linkLabel.trim()
                : undefined;
        if (linkLabel && linkLabel.length > MAX_LINK_LABEL_LENGTH) {
            throw new HTTPException(400, {
                message: `Link label must be at most ${MAX_LINK_LABEL_LENGTH} chars`,
            });
        }

        const notice: StatusNotice = {
            message,
            ...(link && { link }),
            ...(link && linkLabel && { linkLabel }),
        };

        await c.env.KV.put(KV_KEY, JSON.stringify(notice));
        return c.json({ notice });
    })
    .delete("/", async (c) => {
        await c.env.KV.delete(KV_KEY);
        return c.json({ notice: null });
    });
