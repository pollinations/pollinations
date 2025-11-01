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

    // Call text service directly to route
    const textServiceUrl = c.env.TEXT_SERVICE_URL || "https://text.pollinations.ai";
    const routerResponse = await fetch(`${textServiceUrl}/${encodeURIComponent(routerPrompt)}?model=openai-fast`);
    
    const decision = (await routerResponse.text()).trim().toLowerCase();
    
    // Proxy directly to backend services
    const imageServiceUrl = c.env.IMAGE_SERVICE_URL || "https://image.pollinations.ai";
    
    // Add auth token back to params for backend
    params.set("key", token);
    
    if (decision.includes("image")) {
        // Route to image service (prepend /prompt)
        return fetch(`${imageServiceUrl}/prompt${path}?${params.toString()}`);
    } else {
        // Route to text service
        return fetch(`${textServiceUrl}${path}?${params.toString()}`);
    }
});
