import { handleA2ARequest } from "../../../surfaces/a2a/handler.ts";
import { handleChatCompletions } from "../../../surfaces/openai-compat/handler.ts";
import { handleChatRequest as handleWebChat } from "../../../surfaces/web-chat/handler.ts";

// Bun variant: same surface composition as the hono variant, but using Bun's
// native APIs — no framework. Demonstrates that the surface adapters work
// directly as Bun route handlers (Bun.serve `routes` accepts Request-handler
// functions natively).

export const routes = {
    "/": new Response(
        "CatGPT (bun variant). See /.well-known/agent-card.json, /a2a, /v1/chat/completions, /chat.\n",
    ),
    "/.well-known/agent-card.json": (req: Request) => handleA2ARequest(req),
    "/a2a": (req: Request) => handleA2ARequest(req),
    "/v1/chat/completions": (req: Request) => handleChatCompletions(req),
    "/chat": (req: Request) => handleWebChat(req),
};
