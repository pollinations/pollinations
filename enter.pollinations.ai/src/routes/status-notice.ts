import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env.ts";

interface StatusNotice {
    message: string;
    link?: string;
    linkLabel?: string;
    createdAt: string;
    createdBy: string;
}

/**
 * In-memory store for the dashboard status notice.
 * In production, this would be persisted to D1 or KV.
 * For now, we use a simple module-level variable.
 */
let currentNotice: StatusNotice | null = null;

/**
 * Admin-controlled dashboard status notice routes.
 * Allows administrators to publish, update, or clear a dashboard-wide status notice.
 */
export const statusNoticeRoutes = new Hono<Env>()
    /**
     * GET /status-notice - Get current notice (public)
     */
    .get("/", async (c) => {
        if (!currentNotice) {
            return c.json({ notice: null });
        }
        return c.json({ notice: currentNotice });
    })
    /**
     * PUT /status-notice - Set or update notice (admin only)
     */
    .put("/", async (c) => {
        const authHeader = c.req.header("Authorization");
        const providedKey = authHeader?.startsWith("Bearer ")
            ? authHeader.slice(7)
            : null;

        if (!providedKey || providedKey !== c.env.PLN_ENTER_TOKEN) {
            throw new HTTPException(401, { message: "Unauthorized" });
        }

        let body: unknown;
        try {
            body = await c.req.json();
        } catch {
            throw new HTTPException(400, { message: "Invalid JSON body" });
        }

        if (!body || typeof body !== "object") {
            throw new HTTPException(400, { message: "Invalid request body" });
        }

        const { message, link, linkLabel } = body as {
            message?: unknown;
            link?: unknown;
            linkLabel?: unknown;
        };

        if (typeof message !== "string" || message.trim().length === 0) {
            throw new HTTPException(400, {
                message: "Message is required and must be non-empty",
            });
        }

        if (message.length > 500) {
            throw new HTTPException(400, {
                message: "Message must be 500 characters or less",
            });
        }

        if (link !== undefined && typeof link !== "string") {
            throw new HTTPException(400, {
                message: "Link must be a string",
            });
        }

        if (link && !isValidUrl(link)) {
            throw new HTTPException(400, {
                message: "Link must be a valid URL",
            });
        }

        if (linkLabel !== undefined && typeof linkLabel !== "string") {
            throw new HTTPException(400, {
                message: "Link label must be a string",
            });
        }

        currentNotice = {
            message: message.trim(),
            link: link ? link.trim() : undefined,
            linkLabel: linkLabel ? linkLabel.trim() : undefined,
            createdAt: new Date().toISOString(),
            createdBy: "admin",
        };

        return c.json({ success: true, notice: currentNotice });
    })
    /**
     * DELETE /status-notice - Clear notice (admin only)
     */
    .delete("/", async (c) => {
        const authHeader = c.req.header("Authorization");
        const providedKey = authHeader?.startsWith("Bearer ")
            ? authHeader.slice(7)
            : null;

        if (!providedKey || providedKey !== c.env.PLN_ENTER_TOKEN) {
            throw new HTTPException(401, { message: "Unauthorized" });
        }

        currentNotice = null;
        return c.json({ success: true, notice: null });
    });

function isValidUrl(str: string): boolean {
    try {
        const url = new URL(str);
        return url.protocol === "https:" || url.protocol === "http:";
    } catch {
        return false;
    }
}
