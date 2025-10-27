import { Hono } from "hono";
import { proxy } from "hono/proxy";
import type { Env } from "../env";
import { auth, requireAuth } from "../middleware/auth";
import { logEvent } from "../utils/events";
import { generationHeaders, proxyHeaders } from "@shared/proxy-headers";

export const textRoutes = new Hono<Env>();

// Public endpoint - list models
textRoutes.get("/openai/models", async (c) => {
    const textServiceUrl = c.env.TEXT_SERVICE_URL;
    return await proxy(`${textServiceUrl}/openai/models`, {
        ...c.req,
        headers: proxyHeaders(
            c.req.header(),
            c.get("requestId"),
            c.req.header("cf-connecting-ip"),
            c.req.header("host")
        ),
    });
});

// Authenticated endpoint - text generation
textRoutes.post("/openai", auth, requireAuth, async (c) => {
    const startTime = Date.now();
    const textServiceUrl = c.env.TEXT_SERVICE_URL;

    // Get request body
    const body = await c.req.json();
    const modelRequested = body.model || null;

    // Build target URL
    const targetUrl = new URL(c.req.url);
    targetUrl.protocol = new URL(textServiceUrl).protocol;
    targetUrl.host = new URL(textServiceUrl).host;
    targetUrl.pathname = "/openai";

    // Proxy request
    const response = await proxy(targetUrl.toString(), {
        method: "POST",
        headers: {
            ...proxyHeaders(
                c.req.header(),
                c.get("requestId"),
                c.req.header("cf-connecting-ip"),
                c.req.header("host")
            ),
            ...generationHeaders(c.var.user),
        },
        body: JSON.stringify(body),
    });

    // Log event asynchronously
    c.executionCtx.waitUntil(
        logEvent(c, {
            eventType: "generate.text",
            modelRequested,
            startTime,
            endTime: Date.now(),
            responseStatus: response.status,
        })
    );

    return response;
});

// Also support /v1/chat/completions endpoint
textRoutes.post("/v1/chat/completions", auth, requireAuth, async (c) => {
    const startTime = Date.now();
    const textServiceUrl = c.env.TEXT_SERVICE_URL;

    const body = await c.req.json();
    const modelRequested = body.model || null;

    const targetUrl = new URL(c.req.url);
    targetUrl.protocol = new URL(textServiceUrl).protocol;
    targetUrl.host = new URL(textServiceUrl).host;
    targetUrl.pathname = "/openai";

    const response = await proxy(targetUrl.toString(), {
        method: "POST",
        headers: {
            ...proxyHeaders(
                c.req.header(),
                c.get("requestId"),
                c.req.header("cf-connecting-ip"),
                c.req.header("host")
            ),
            ...generationHeaders(c.var.user),
        },
        body: JSON.stringify(body),
    });

    c.executionCtx.waitUntil(
        logEvent(c, {
            eventType: "generate.text",
            modelRequested,
            startTime,
            endTime: Date.now(),
            responseStatus: response.status,
        })
    );

    return response;
});
