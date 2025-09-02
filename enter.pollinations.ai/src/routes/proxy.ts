import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { proxy } from "hono/proxy";
import type { InsertPolarEvent } from "@/db/schema/event";
import { authenticate } from "@/middleware/authenticate";
import { polar } from "@/middleware/polar.ts";
import { processPolarEvents, storePolarEvents } from "@/polar.ts";
import { generateRandomId } from "@/util.ts";
import type { Env } from "../env.ts";

const freeModels = ["flux"];

export const proxyRoutes = new Hono<Env>()
    .get("/image/:prompt", authenticate, polar, async (c) => {
        console.log("generating image");
        const prompt = c.req.param("prompt");
        const model = c.req.query("model") || "flux";
        const isFreeModel = freeModels.includes(model);
        const user = c.get("user");
        if (!isFreeModel && !user) {
            throw new HTTPException(401, {
                message: "You must be signed in to use this model.",
            });
        }

        const clientIP = c.req.header("cf-connecting-ip") || "";
        const incomingUrl = new URL(c.req.url);

        const targetUrl = new URL("https://image.pollinations.ai");
        targetUrl.pathname = `/prompt/${prompt}`;
        targetUrl.search = incomingUrl.search;
        targetUrl.port = "";
        console.log("targetUrl", targetUrl);

        console.debug("[PROXY] Forwarding to origin:", targetUrl.toString());
        const response = await proxy(targetUrl, {
            ...c.req,
            headers: {
                ...c.req.header(),
                "x-request-id": c.get("requestId"),
                "x-forwarded-for": clientIP,
                "x-forwarded-host": c.req.header("host"),
                "x-real-ip": clientIP,
                "cf-connecting-ip": clientIP,
            },
        });

        if (response.ok && !isFreeModel) {
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
    .get("/text/:prompt", async (c) => {
        return c.json({ success: false });
    });
