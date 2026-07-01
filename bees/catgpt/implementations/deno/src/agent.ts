import { handleA2ARequest } from "../../../surfaces/a2a/handler.ts";
import { handleChatCompletions } from "../../../surfaces/openai-compat/handler.ts";
import { handleChatRequest as handleWebChat } from "../../../surfaces/web-chat/handler.ts";

// Deno variant: same surface composition as bun/hono, on Deno's native
// `Deno.serve`. The surface adapters are pure Request → Response, so they
// drop in unchanged — proves the surfaces are runtime-portable across at
// least three JS runtimes (Node/Hono, Bun, Deno).

export async function route(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/.well-known/agent-card.json") {
        return handleA2ARequest(req);
    }
    if (url.pathname === "/a2a") {
        return handleA2ARequest(req);
    }
    if (url.pathname === "/v1/chat/completions") {
        return handleChatCompletions(req);
    }
    if (url.pathname === "/chat") {
        return handleWebChat(req);
    }
    if (url.pathname === "/") {
        return new Response(
            "CatGPT (deno variant). See /.well-known/agent-card.json, /a2a, /v1/chat/completions, /chat.\n",
        );
    }
    return new Response("not found", { status: 404 });
}
