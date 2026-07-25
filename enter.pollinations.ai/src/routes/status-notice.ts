import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Env } from "../env.ts";

const KV_KEY = "status-notice:active";
const ALLOWED_SCHEMES = new Set(["http:", "https:"]);

export type StatusNotice = {
    message: string;
    linkUrl: string | null;
    linkLabel: string | null;
    updatedAt: string;
};

const storedNoticeSchema = z.object({
    message: z.string().trim().min(1).max(500),
    linkUrl: z.string().url().max(2048).nullable(),
    linkLabel: z.string().trim().min(1).max(80).nullable(),
    updatedAt: z.string().datetime(),
});

const publishNoticeSchema = z.object({
    message: z.string().trim().min(1).max(500),
    linkUrl: z.string().url().max(2048).nullable().optional(),
    linkLabel: z.string().trim().min(1).max(80).nullable().optional(),
});

const noticeResponseSchema = z.object({
    notice: storedNoticeSchema.nullable(),
});

function isSafeLink(value: string): boolean {
    try {
        return ALLOWED_SCHEMES.has(new URL(value).protocol);
    } catch {
        return false;
    }
}

function requireAdmin(c: Context<Env>): void {
    const authorization = c.req.header("Authorization");
    const token = authorization?.startsWith("Bearer ")
        ? authorization.slice(7)
        : null;
    if (!token || token !== c.env.PLN_ENTER_TOKEN) {
        throw new HTTPException(401, { message: "Unauthorized" });
    }
}

async function readNotice(kv: KVNamespace): Promise<StatusNotice | null> {
    const parsed = storedNoticeSchema.safeParse(
        await kv.get<unknown>(KV_KEY, "json"),
    );
    return parsed.success ? parsed.data : null;
}

export const statusNoticePublicRoutes = new Hono<Env>().get(
    "/",
    describeRoute({
        tags: ["📣 Status Notice"],
        summary: "Get Dashboard Status Notice",
        security: [],
        responses: {
            200: {
                description: "The active dashboard notice, if one exists",
                content: {
                    "application/json": {
                        schema: resolver(noticeResponseSchema),
                    },
                },
            },
        },
    }),
    async (c) => c.json({ notice: await readNotice(c.env.KV) }),
);

export const statusNoticeAdminRoutes = new Hono<Env>()
    .put(
        "/",
        describeRoute({
            tags: ["📣 Status Notice"],
            summary: "Publish Dashboard Status Notice",
            security: [{ bearer: [] }],
            responses: {
                200: {
                    description: "The published dashboard notice",
                    content: {
                        "application/json": {
                            schema: resolver(noticeResponseSchema),
                        },
                    },
                },
                400: { description: "Invalid notice" },
                401: { description: "Unauthorized" },
            },
        }),
        async (c) => {
            requireAdmin(c);

            let body: unknown;
            try {
                body = await c.req.json();
            } catch {
                throw new HTTPException(400, {
                    message: "Invalid JSON body",
                });
            }

            const parsed = publishNoticeSchema.safeParse(body);
            if (!parsed.success) {
                throw new HTTPException(400, {
                    message: "Invalid status notice payload",
                });
            }

            const linkUrl = parsed.data.linkUrl ?? null;
            if (linkUrl && !isSafeLink(linkUrl)) {
                throw new HTTPException(400, {
                    message: "linkUrl must use http: or https:",
                });
            }

            const notice: StatusNotice = {
                message: parsed.data.message,
                linkUrl,
                linkLabel: linkUrl ? (parsed.data.linkLabel ?? null) : null,
                updatedAt: new Date().toISOString(),
            };
            await c.env.KV.put(KV_KEY, JSON.stringify(notice));
            return c.json({ notice });
        },
    )
    .delete(
        "/",
        describeRoute({
            tags: ["📣 Status Notice"],
            summary: "Clear Dashboard Status Notice",
            security: [{ bearer: [] }],
            responses: {
                200: {
                    description: "The notice was cleared",
                    content: {
                        "application/json": {
                            schema: resolver(noticeResponseSchema),
                        },
                    },
                },
                401: { description: "Unauthorized" },
            },
        }),
        async (c) => {
            requireAdmin(c);
            await c.env.KV.delete(KV_KEY);
            return c.json({ notice: null });
        },
    );
