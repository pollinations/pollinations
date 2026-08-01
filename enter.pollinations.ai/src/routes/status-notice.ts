import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Env } from "../env.ts";

// ---------------------------------------------------------------------------
// KV key
// ---------------------------------------------------------------------------
const KV_KEY = "status-notice:active";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const SEVERITIES = ["info", "warning", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];

export interface StatusNotice {
    message: string;
    severity: Severity;
    linkUrl?: string;
    linkLabel?: string;
    updatedAt: string;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/** Rejects javascript:, data:, mailto:, and other non-http(s) URLs. */
function isValidNoticeUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const putBodySchema = z
    .object({
        message: z
            .string()
            .min(1, "Message must not be empty")
            .max(500, "Message must be at most 500 characters"),
        severity: z.enum(SEVERITIES).optional().default("warning"),
        linkUrl: z
            .string()
            .refine(isValidNoticeUrl, {
                message: "Link URL must be an absolute http(s) URL",
            })
            .optional(),
        linkLabel: z
            .string()
            .max(100, "Link label must be at most 100 characters")
            .optional(),
    })
    .refine((data) => !data.linkLabel || data.linkUrl, {
        message: "linkLabel requires linkUrl to be set",
    });

// ---------------------------------------------------------------------------
// KV helpers
// ---------------------------------------------------------------------------

async function readNotice(kv: KVNamespace): Promise<StatusNotice | null> {
    const raw = await kv.get(KV_KEY, "json");
    if (!raw) return null;
    if (
        typeof raw === "object" &&
        raw !== null &&
        typeof raw.message === "string" &&
        typeof raw.updatedAt === "string"
    ) {
        return {
            message: raw.message as string,
            severity: SEVERITIES.includes(
                (raw as Record<string, unknown>).severity as Severity,
            )
                ? ((raw as Record<string, unknown>).severity as Severity)
                : "warning",
            linkUrl: typeof raw.linkUrl === "string" ? raw.linkUrl : undefined,
            linkLabel:
                typeof raw.linkLabel === "string" ? raw.linkLabel : undefined,
            updatedAt: raw.updatedAt as string,
        };
    }
    // Corrupted KV data — treat as no notice
    return null;
}

async function writeNotice(
    kv: KVNamespace,
    notice: StatusNotice,
): Promise<void> {
    await kv.put(KV_KEY, JSON.stringify(notice));
}

async function deleteNotice(kv: KVNamespace): Promise<void> {
    await kv.delete(KV_KEY);
}

/** Returns true when the incoming payload matches the stored notice. */
function isSameNotice(
    existing: StatusNotice,
    message: string,
    severity: Severity,
    linkUrl?: string,
    linkLabel?: string,
): boolean {
    return (
        existing.message === message &&
        existing.severity === severity &&
        (existing.linkUrl ?? undefined) === (linkUrl ?? undefined) &&
        (existing.linkLabel ?? undefined) === (linkLabel ?? undefined)
    );
}

// ---------------------------------------------------------------------------
// Public route — GET /api/status-notice
// ---------------------------------------------------------------------------

export const statusNoticeRoutes = new Hono<Env>().get("/", async (c) => {
    const notice = await readNotice(c.env.KV);
    return c.json({ notice });
});

// ---------------------------------------------------------------------------
// Admin routes — PUT & DELETE /api/admin/status-notice
// (auth handled by the admin middleware in admin.ts)
// ---------------------------------------------------------------------------

export const statusNoticeAdminRoutes = new Hono<Env>()
    .put("/", async (c) => {
        let body: unknown;
        try {
            body = await c.req.json();
        } catch {
            throw new HTTPException(400, { message: "Invalid JSON body" });
        }

        const parsed = putBodySchema.safeParse(body);
        if (!parsed.success) {
            const messages = parsed.error.issues
                .map((i) => i.message)
                .join("; ");
            throw new HTTPException(400, { message: messages });
        }

        const { message, severity, linkUrl, linkLabel } = parsed.data;

        // Idempotency: if the content hasn't changed, don't bump updatedAt
        const existing = await readNotice(c.env.KV);
        if (
            existing &&
            isSameNotice(existing, message, severity, linkUrl, linkLabel)
        ) {
            return c.json({ notice: existing }, 200);
        }

        const notice: StatusNotice = {
            message,
            severity,
            linkUrl,
            linkLabel: linkUrl ? linkLabel : undefined,
            updatedAt: new Date().toISOString(),
        };

        await writeNotice(c.env.KV, notice);
        return c.json({ notice }, 200);
    })
    .delete("/", async (c) => {
        await deleteNotice(c.env.KV);
        return c.json({ notice: null }, 200);
    });
