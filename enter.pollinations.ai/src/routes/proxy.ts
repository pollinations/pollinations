import { Context, Hono, HonoRequest } from "hono";
import { HTTPException } from "hono/http-exception";
import { proxy } from "hono/proxy";
import type { InsertPolarEvent } from "@/db/schema/event";
import { authenticate } from "@/middleware/authenticate";
import { polar } from "@/middleware/polar.ts";
import { processPolarEvents, storePolarEvents } from "@/polar.ts";
import { generateRandomId } from "@/util.ts";
import type { Env } from "../env.ts";
import { z } from "zod";
import type { AuthEnv } from "../middleware/authenticate.ts";
import type { PolarEnv } from "../middleware/polar.ts";

type ProxyEnv = Env & AuthEnv & PolarEnv;

const freeImageModels = ["flux"];
const freeTextModels = ["openai"];

export const proxyRoutes = new Hono<ProxyEnv>()
    .use(authenticate)
    .use(polar)
    .get("/image/:prompt", async (c) => {
        const model = c.req.query("model") || "flux";
        const isFree = freeImageModels.includes(model);
        const user = c.get("user");
        if (!isFree && !user) {
            throw new HTTPException(401, {
                message: "You must be signed in to use this model.",
            });
        }

        const targetUrl = proxyUrl(c, "https://image.pollinations.ai");
        const targetHeaders = proxyHeaders(c);

        console.debug("[PROXY] Forwarding to origin:", targetUrl.toString());
        const response = await proxy(targetUrl, {
            ...c.req,
            headers: targetHeaders,
        });

        if (response.ok && !isFree) {
            if (!user)
                throw new Error("Missing user, this should never happen.");
            const events: InsertPolarEvent[] = [
                {
                    id: generateRandomId(),
                    name: "image_generation",
                    userId: user?.id,
                    requestId: c.get("requestId"),
                    metadata: {
                        model,
                        totalPrice: 0.05,
                    },
                },
            ];
            c.executionCtx.waitUntil(
                (async () => {
                    await storePolarEvents(events, c.env);
                    // send to polar directly in development
                    if (c.env.ENVIRONMENT === "development")
                        await processPolarEvents(c.env);
                })(),
            );
        }
        return response;
    })
    .get("/openai/models", async (c) => {
        const targetUrl = proxyUrl(c, "https://text.pollinations.ai");
        return await proxy(targetUrl, {
            ...c.req,
            headers: proxyHeaders(c),
        });
    })
    .on(["POST"], ["/openai/chat/completions", "/openai"], async (c) => {
        const body = await c.req.json();
        const model = body.model || "openai";

        // only simulates free models for now
        const isFree = freeTextModels.includes(model);
        if (!isFree && !c.var.user) {
            throw new HTTPException(401, {
                message: "You must be signed in to use this model.",
            });
        }

        const targetUrl = proxyUrl(c, "https://text.pollinations.ai");
        const response = await proxy(targetUrl, {
            method: c.req.method,
            headers: proxyHeaders(c),
            body: JSON.stringify(body),
        });
        return response;
    });

function proxyHeaders(c: Context<ProxyEnv>): Record<string, string> {
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
    c: Context<ProxyEnv>,
    targetBaseUrl: string,
    targetPort: string = "",
    incomingPathPrefix: string = "/api/generate",
): URL {
    const incomingUrl = new URL(c.req.url);
    const targetUrl = new URL(targetBaseUrl);
    targetUrl.pathname = incomingUrl.pathname.startsWith(incomingPathPrefix)
        ? incomingUrl.pathname.slice(incomingPathPrefix.length)
        : incomingUrl.pathname;
    targetUrl.port = targetPort;
    targetUrl.search = incomingUrl.search;
    return targetUrl;
}
