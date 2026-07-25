import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Env } from "../env.ts";

const KV_KEY = "status-notice:active";
const ALLOWED_SCHEMES = new Set(["http:", "https:"]);
const SEVERITY_VALUES = ["info", "warning", "critical"] as const;
const DEFAULT_SEVERITY = "warning";

export type Severity = (typeof SEVERITY_VALUES)[number];

export type StatusNotice = {
    message: string;
    severity: Severity;
    linkUrl: string | null;
    linkLabel: string | null;
    updatedAt: string;
};

const storedNoticeSchema = z.object({
    message: z.string().trim().min(1).max(500),
    severity: z.enum(SEVERITY_VALUES),
    linkUrl: z.string().url().max(2048).nullable(),
    linkLabel: z.string().trim().min(1).max(80).nullable(),
    updatedAt: z.string().datetime(),
});

const publishNoticeSchema = z.object({
    message: z.string().trim().min(1).max(500),
    severity: z.enum(SEVERITY_VALUES).optional(),
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
    return parsed.success ? (parsed.data as StatusNotice) : null;
}

/**
 * Returns true if the normalized payload is identical to the previous notice
 * (excluding `updatedAt`). Used to implement idempotent re-save: when an admin
 * re-publishes the exact same notice, we keep the original `updatedAt` and skip
 * the KV write so the dismiss state on existing dashboards is preserved.
 */
function isSamePayload(
    next: {
        message: string;
        severity: Severity;
        linkUrl: string | null;
        linkLabel: string | null;
    },
    prev: StatusNotice | null,
): prev is StatusNotice {
    if (!prev) return false;
    return (
        next.message === prev.message &&
        next.severity === prev.severity &&
        next.linkUrl === prev.linkUrl &&
        next.linkLabel === prev.linkLabel
    );
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
                    description:
                        "The active dashboard notice (published or unchanged)",
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

            const nextPayload = {
                message: parsed.data.message,
                severity: (parsed.data.severity ??
                    DEFAULT_SEVERITY) as Severity,
                linkUrl,
                // linkLabel is only meaningful when a linkUrl is provided;
                // strip it otherwise so banner logic never sees a dangling label.
                linkLabel: linkUrl ? (parsed.data.linkLabel ?? null) : null,
            };

            const existing = await readNotice(c.env.KV);
            if (isSamePayload(nextPayload, existing)) {
                // Idempotent re-save: keep the original updatedAt so users who
                // already dismissed the notice don't see it reappear.
                return c.json({ notice: existing });
            }

            const notice: StatusNotice = {
                ...nextPayload,
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
