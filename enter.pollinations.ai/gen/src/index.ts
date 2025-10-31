import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import type { Env } from "../../src/env";
import { proxyRoutes } from "../../src/routes/proxy";
import { logger } from "../../src/middleware/logger";
import { auth } from "../../src/middleware/auth";

const app = new Hono<Env>()
    .use("*", requestId())
    .use("*", logger)
    .use(
        "*",
        cors({
            origin: "*",
            allowHeaders: ["authorization", "content-type"],
            allowMethods: ["GET", "POST", "OPTIONS"],
        })
    )
    .use("*", auth({ allowApiKey: true, allowSessionCookie: false }))
    .route("/", proxyRoutes)
    .get("/health", (c) => c.json({ status: "ok" }))
    .get("/debug-secrets", (c) => {
        const hasGithubId = !!c.env.GITHUB_CLIENT_ID;
        const hasGithubSecret = !!c.env.GITHUB_CLIENT_SECRET;
        const hasJwtSecret = !!c.env.JWT_SECRET;
        console.log("DEBUG: Secrets check", { hasGithubId, hasGithubSecret, hasJwtSecret });
        return c.json({ 
            hasGithubId, 
            hasGithubSecret, 
            hasJwtSecret,
            githubIdPrefix: c.env.GITHUB_CLIENT_ID?.substring(0, 4)
        });
    })
    .get("*", async (c) => {
        // Catch-all router: extract path + query params (excluding 'key')
        const path = c.req.path;
        const url = new URL(c.req.url);
        const params = new URLSearchParams(url.search);
        params.delete("key"); // Remove auth param from prompt
        
        const queryString = params.toString();
        const fullPrompt = queryString ? `${path}?${queryString}` : path;
        
        // Ask openai-fast to route the request
        const routerPrompt = `You are a router. Given this request: "${fullPrompt}", respond with ONLY "image" or "text" (no explanation).
If it mentions generating/creating images, photos, pictures, or visual content, respond "image".
Otherwise respond "text".`;

        // Get auth token from context
        const authHeader = c.req.header("authorization");
        const token = authHeader?.replace("Bearer ", "") || params.get("key");
        
        if (!token) {
            return c.json({ error: "Authentication required" }, 401);
        }

        // Call text service directly to route
        const textServiceUrl = c.env.TEXT_SERVICE_URL || "https://text.pollinations.ai";
        const routerResponse = await fetch(`${textServiceUrl}/${encodeURIComponent(routerPrompt)}?model=openai-fast`);
        
        const decision = (await routerResponse.text()).trim().toLowerCase();
        
        // Proxy directly to backend services
        const imageServiceUrl = c.env.IMAGE_SERVICE_URL || "https://image.pollinations.ai";
        
        if (decision.includes("image")) {
            // Route to image service
            return fetch(`${imageServiceUrl}${path}?${params.toString()}`);
        } else {
            // Route to text service
            return fetch(`${textServiceUrl}${path}?${params.toString()}`);
        }
    });

export default app;
