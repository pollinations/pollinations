import { Hono } from "hono";
import { handleA2ARequest } from "../../../surfaces/a2a/handler.ts";
import { handleChatCompletions } from "../../../surfaces/openai-compat/handler.ts";
import { handleChatRequest as handleWebChat } from "../../../surfaces/web-chat/handler.ts";

// Hono variant: prove the bee is "just a hono app". Mounts every surface in
// one place and shows how surface adapters compose.
//
// Runs on Workers, Bun, Deno, Node, Vercel Edge — same code.

export const app = new Hono();

app.get("/", (c) =>
    c.text(
        "CatGPT (hono variant). Endpoints:\n" +
            "  GET  /.well-known/agent-card.json\n" +
            "  POST /a2a\n" +
            "  POST /v1/chat/completions\n" +
            "  POST /chat\n",
    ),
);

// Mount surface adapters. Each one is a Request → Response function from
// surfaces/, so we hand off Hono's `c.req.raw` and return its `Response`.
app.get("/.well-known/agent-card.json", (c) => handleA2ARequest(c.req.raw));
app.post("/a2a", (c) => handleA2ARequest(c.req.raw));
app.post("/v1/chat/completions", (c) => handleChatCompletions(c.req.raw));
app.post("/chat", (c) => handleWebChat(c.req.raw));

export default app;
