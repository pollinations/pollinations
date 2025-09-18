import { Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { proxy } from "hono/proxy";
import { authenticate } from "@/middleware/authenticate";
import { polar } from "@/middleware/polar.ts";
import type { Env } from "../env.ts";
import { z } from "zod";
import { REGISTRY, ServiceId } from "../registry/registry.ts";
import { track } from "@/middleware/track.ts";

const chatCompletionSchema = z.object({
    model: z.string(),
    messages: z.array(
        z.object({
            role: z.enum(["system", "user", "assistant", "tool"]),
            content: z.string().optional(),
            name: z.string().optional(),
            tool_calls: z.array(z.any()).optional(),
            tool_call_id: z.string().optional(),
        }),
    ),
    max_tokens: z.number().int().positive().optional(),
    temperature: z.number().min(0).max(2).optional(),
    top_p: z.number().min(0).max(1).optional(),
    stream: z.boolean().optional(),
});

export const proxyRoutes = new Hono<Env>()
    .get("/openai/models", async (c) => {
        const targetUrl = proxyUrl(c, "https://text.pollinations.ai");
        console.log(targetUrl);
        return await proxy(targetUrl, {
            ...c.req,
            headers: proxyHeaders(c),
        });
    })
    .use(authenticate)
    .use(polar)
    .post("/openai/chat/completions", track("generate.text"), async (c) => {
        const isFree = c.get("isFreeUsage");
        if (!isFree && !c.var.user) {
            throw new HTTPException(401, {
                message: "You must be signed in to use this model.",
            });
        }

        const targetUrl = proxyUrl(c, "https://text.pollinations.ai");
        const response = await proxy(targetUrl, {
            method: c.req.method,
            headers: proxyHeaders(c),
            body: JSON.stringify(await c.req.json()),
        });

        return response;
    })
    .get("/image/:prompt", track("generate.image"), async (c) => {
        const isFree = c.get("isFreeUsage");
        if (!isFree && !c.var.user) {
            throw new HTTPException(401, {
                message: "You must be signed in to use this model.",
            });
        }

        const targetUrl = proxyUrl(c, "https://image.pollinations.ai/prompt");
        const targetHeaders = proxyHeaders(c);

        const response = await proxy(targetUrl, {
            ...c.req,
            headers: targetHeaders,
        });

        return response;
    });

function proxyHeaders(c: Context): Record<string, string> {
    const clientIP = c.req.header("cf-connecting-ip") || "";
    const clientHost = c.req.header("host") || "";
    return {
        ...c.req.header(),
        "x-request-id": c.get("requestId"),
        "x-forwarded-host": clientHost,
        "x-forwarded-for": clientIP,
        "x-real-ip": clientIP,
    };
}

function proxyUrl(
    c: Context,
    targetBaseUrl: string,
    targetPort: string = "",
    incomingPathPrefix: string = "/api/generate",
): URL {
    const incomingUrl = new URL(c.req.url);
    const targetUrl = new URL(targetBaseUrl);
    const incomingPathname = incomingUrl.pathname.startsWith(incomingPathPrefix)
        ? incomingUrl.pathname.slice(incomingPathPrefix.length)
        : incomingUrl.pathname;
    targetUrl.pathname = joinPaths(targetUrl.pathname, incomingPathname);
    targetUrl.port = targetPort;
    targetUrl.search = incomingUrl.search;
    return targetUrl;
}

function joinPaths(...paths: string[]): string {
    return paths.join("/").replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}
