import { Hono } from "hono";
import type { Env } from "../../../src/env";

export const llmRouterRoutes = new Hono<Env>().get("*", async (c) => {
    // Catch-all router: extract path + query params (excluding 'key')
    const path = c.req.path;
    const url = new URL(c.req.url);
    const params = new URLSearchParams(url.search);
    
    // Get auth token BEFORE deleting key param
    const authHeader = c.req.header("authorization");
    const token = authHeader?.replace("Bearer ", "") || params.get("key");
    
    params.delete("key"); // Remove auth param from prompt
    
    const queryString = params.toString();
    const fullPrompt = queryString ? `${path}?${queryString}` : path;
    
    // Ask openai-fast to route the request
    const routerPrompt = `You are a router. Given this request: "${fullPrompt}", respond with ONLY "image" or "text" (no explanation).
If it mentions generating/creating images, photos, pictures, or visual content, respond "image".
Otherwise respond "text".`;
    
    if (!token) {
        return c.json({ error: "Authentication required" }, 401);
    }

    // Call gen's /text endpoint for routing decision (uses openai-fast model)
    // This calls /text/:prompt which goes through proxy routes, not the catch-all router
    // This prevents infinite loops since we're using a specific route, not the catch-all
    const genServiceUrl = c.env.GEN_SERVICE_URL || "https://gen.pollinations.ai";
    const routerResponse = await fetch(`${genServiceUrl}/text/${encodeURIComponent(routerPrompt)}?model=openai-fast`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    
    const decision = (await routerResponse.text()).trim().toLowerCase();
    
    // Route to gen's proxy endpoints (not backend services directly)
    // This keeps everything within gen's architecture
    if (decision.includes("image")) {
        // Route to gen's /image endpoint
        return fetch(`${genServiceUrl}/image${path}?${params.toString()}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
    } else {
        // Route to gen's /text endpoint
        return fetch(`${genServiceUrl}/text${path}?${params.toString()}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
    }
});
