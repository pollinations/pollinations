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

const MAX_MESSAGE_LENGTH = 500;
const MAX_LINK_LABEL_LENGTH = 100;

function isSameNotice(
    existing: StatusNotice | null,
    message: string,
    link: string | undefined,
    linkLabel: string | undefined,
): boolean {
    if (!existing) return false;
    return (
        existing.message === message &&
        existing.link === (link || undefined) &&
        existing.linkLabel === (linkLabel || undefined)
    );
}

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

        if (message.length > MAX_MESSAGE_LENGTH) {
            throw new HTTPException(400, {
                message: `Message must be ${MAX_MESSAGE_LENGTH} characters or less`,
            });
        }

        if (link !== undefined && typeof link !== "string") {
            throw new HTTPException(400, {
                message: "Link must be a string",
            });
        }

        if (link && !isValidUrl(link)) {
            throw new HTTPException(400, {
                message:
                    "Link must be a valid absolute URL starting with http:// or https://",
            });
        }

        if (linkLabel !== undefined && typeof linkLabel !== "string") {
            throw new HTTPException(400, {
                message: "Link label must be a string",
            });
        }

        if (linkLabel && linkLabel.length > MAX_LINK_LABEL_LENGTH) {
            throw new HTTPException(400, {
                message: `Link label must be ${MAX_LINK_LABEL_LENGTH} characters or less`,
            });
        }

        const trimmedMessage = message.trim();
        const trimmedLink = link ? link.trim() : undefined;
        const trimmedLinkLabel = linkLabel ? linkLabel.trim() : undefined;

        if (
            isSameNotice(
                currentNotice,
                trimmedMessage,
                trimmedLink,
                trimmedLinkLabel,
            )
        ) {
            return c.json({ success: true, notice: currentNotice });
        }

        currentNotice = {
            message: trimmedMessage,
            link: trimmedLink,
            linkLabel: trimmedLinkLabel,
            createdAt: currentNotice?.createdAt ?? new Date().toISOString(),
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
