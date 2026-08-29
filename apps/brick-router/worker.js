import { Container, getContainer } from "@cloudflare/containers";
import { hasAgentRunToken } from "./auth.js";

export class BrickContainer extends Container {
    defaultPort = 8000;
    sleepAfter = "2h";
}

function json(body, status = 200) {
    return Response.json(body, { status });
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        if (request.method === "GET" && url.pathname === "/") {
            return json({ service: "brick", status: "ok" });
        }
        if (request.method === "GET" && url.pathname === "/health") {
            return getContainer(env.BRICK, "brick").fetch(request);
        }
        if (
            request.method !== "POST" ||
            url.pathname !== "/v1/chat/completions"
        ) {
            return json({ error: "Not found" }, 404);
        }
        if (!hasAgentRunToken(request)) {
            return json({ error: "Agent run token required" }, 401);
        }
        return getContainer(env.BRICK, "brick").fetch(request);
    },
};
