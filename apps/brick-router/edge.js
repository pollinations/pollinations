import { hasAgentRunToken, validateAgentRunToken } from "./auth.js";

function json(body, status = 200) {
    return Response.json(body, { status });
}

export async function handleAtEdge(request, validate = validateAgentRunToken) {
    const url = new URL(request.url);
    if (
        request.method === "GET" &&
        (url.pathname === "/" || url.pathname === "/health")
    ) {
        return json({ service: "brick", status: "ok" });
    }
    if (request.method !== "POST" || url.pathname !== "/v1/chat/completions") {
        return json({ error: "Not found" }, 404);
    }
    if (!hasAgentRunToken(request)) {
        return json({ error: "Agent run token required" }, 401);
    }
    try {
        if (!(await validate(request))) {
            return json({ error: "Invalid agent run token" }, 401);
        }
    } catch {
        return json({ error: "Agent run token validation unavailable" }, 503);
    }
    return null;
}
