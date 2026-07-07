// Platform-authored template worker for NO-CODE prompt agents.
//
// A beginner registers `{ systemPrompt, baseModel, tools, mcpServers }` and no
// code. The platform deploys THIS fixed module (via the same source-deploy path
// as user-written bees), injecting the config as env bindings. The worker is a
// thin config-driven consumer of the `@pollinations/agent` SDK: it imports
// `defineAgent` (uploaded alongside as a module part) and wires the injected
// config into one `runTools` call. The SDK owns the OpenAI envelope, auth, SSE
// framing, the bounded tool loop, the built-in tools, the MCP client, and the
// usage/`tool_call_counts` shape — so the owner's declared per-call `toolPrices`
// bill exactly as for any community endpoint (readReportedToolCallCount in
// shared/registry/community-billing.ts).
//
// Unlike queen-bee this runs directly in the Worker — there is no user code to
// isolate, so no sandbox. The source below is the deployed artifact verbatim.
// It imports the SDK by its RELATIVE module-part name; the deploy path uploads
// both parts together (see POLLINATIONS_AGENT_SDK_MODULE_NAME).
//
// Bindings the platform injects at deploy time (all secret_text):
//   SYSTEM_PROMPT    the agent's system prompt
//   BASE_MODEL       the Pollinations model id the loop calls
//   TOOLS_JSON       JSON array of built-in tool names, e.g. ["web_search","image"]
//   MCP_JSON         JSON array of { name, url, auth? } MCP servers
//   POLLINATIONS_KEY owner sk_ key used for every internal gen/image/model call
//   GEN_BASE_URL     the gateway origin the key is valid against (env-specific:
//                    prod uses gen.pollinations.ai, staging its own gen). The
//                    minted key only works against the env that issued it, so
//                    this MUST match — a prod URL with a staging key 401s.
//   BEE_AUTH_TOKEN   shared token the community proxy sends; blocks direct callers
export const PROMPT_AGENT_TEMPLATE_SOURCE = `
import { defineAgent } from "./pollinations-agent.mjs";

// A no-code prompt agent is exactly: run the configured base model with the
// configured built-in tools + MCP servers, over the caller's messages, prefixed
// by the system prompt. The SDK's runTools does all of it; the template only
// reads config out of the injected bindings.
export default defineAgent(async (request, { runTools, env }) => {
    return runTools({
        model: env.BASE_MODEL,
        systemPrompt: env.SYSTEM_PROMPT,
        messages: Array.isArray(request.messages) ? request.messages : [],
        tools: JSON.parse(env.TOOLS_JSON || "[]"),
        mcpServers: JSON.parse(env.MCP_JSON || "[]"),
    });
});
`;
