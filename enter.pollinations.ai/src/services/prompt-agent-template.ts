// Platform-authored template worker for NO-CODE prompt agents.
//
// A beginner registers `{ systemPrompt, baseModel, tools, mcpServers }` and no
// code. The platform deploys THIS fixed module (via the same source-deploy path
// as user-written bees), injecting the config as env bindings. The worker runs a
// bounded OpenAI tool-calling loop on the owner's key: it calls the base model
// with the declared tools, executes any tool calls (built-in tools hit our own
// gen/image endpoints; MCP tools go to the owner's MCP server over HTTP), feeds
// results back, and repeats until the model answers. It returns the standard
// chat.completion shape with summed usage plus `usage.tool_call_counts`, so the
// owner's declared per-call `toolPrices` bill exactly as for any community
// endpoint (readReportedToolCallCount in shared/registry/community-billing.ts).
//
// Unlike queen-bee this runs directly in the Worker — there is no user code to
// isolate, so no sandbox. The source below is the deployed artifact verbatim;
// keep it self-contained (no imports) and valid as a single ES module.

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
export const PROMPT_AGENT_TEMPLATE_SOURCE = String.raw`
// The gateway origin the owner key is valid against, injected per environment.
// Falls back to production if the binding is unset.
function genBase(env) {
    return env.GEN_BASE_URL || "https://gen.pollinations.ai";
}
// An agentic-step ceiling, NOT a retry/timeout: each fetch below is one-shot and
// throws on error. This only bounds how many tool rounds one request may take so
// a looping model can't run up unbounded cost on the owner's key.
const MAX_TOOL_ROUNDS = 8;

// --- built-in tools -------------------------------------------------------
// Each entry is { schema (OpenAI function def the base model sees), run (executes
// the call, returns a string result) }. run() throws on upstream error.
function builtinTools(env) {
    const key = env.POLLINATIONS_KEY;
    const authHeader = { authorization: "Bearer " + key };
    const GEN = genBase(env);
    return {
        web_search: {
            schema: {
                type: "function",
                function: {
                    name: "web_search",
                    description:
                        "Search the web and return concise relevant results for a query.",
                    parameters: {
                        type: "object",
                        properties: {
                            query: {
                                type: "string",
                                description: "The search query.",
                            },
                        },
                        required: ["query"],
                    },
                },
            },
            async run(args, usage) {
                const res = await fetch(GEN + "/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        ...authHeader,
                    },
                    body: JSON.stringify({
                        model: "openai-fast",
                        messages: [
                            {
                                role: "user",
                                content:
                                    "Search the web and list the most relevant facts for: " +
                                    String(args?.query ?? ""),
                            },
                        ],
                    }),
                });
                if (!res.ok)
                    throw new Error(
                        "web_search " + res.status + ": " + (await res.text()),
                    );
                const data = await res.json();
                addUsage(usage, data.usage);
                return data.choices?.[0]?.message?.content ?? "";
            },
        },
        image: {
            schema: {
                type: "function",
                function: {
                    name: "image",
                    description:
                        "Generate an image from a text prompt and return its URL.",
                    parameters: {
                        type: "object",
                        properties: {
                            prompt: {
                                type: "string",
                                description: "The image description.",
                            },
                        },
                        required: ["prompt"],
                    },
                },
            },
            async run(args) {
                const prompt = encodeURIComponent(String(args?.prompt ?? ""));
                const url = GEN + "/image/" + prompt;
                const res = await fetch(url, { headers: authHeader });
                if (!res.ok)
                    throw new Error(
                        "image " + res.status + ": " + (await res.text()),
                    );
                return res.url || url;
            },
        },
    };
}

// --- MCP client (Streamable HTTP JSON-RPC) --------------------------------
// Minimal client: initialize -> tools/list -> tools/call. One fetch per call,
// throws on error. Tool names are namespaced mcp__<server>__<tool> so multiple
// servers (and built-ins) never collide.
function mcpToolName(serverName, toolName) {
    return "mcp__" + serverName + "__" + toolName;
}

async function mcpRpc(server, method, params) {
    const headers = {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
    };
    if (server.auth) headers.authorization = "Bearer " + server.auth;
    const res = await fetch(server.url, {
        method: "POST",
        headers,
        body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method,
            params: params ?? {},
        }),
    });
    if (!res.ok)
        throw new Error(
            "mcp " + server.name + " " + method + " " + res.status + ": " +
                (await res.text()),
        );
    // Streamable HTTP may answer with a single JSON body or an SSE stream; for a
    // one-shot request/response we accept either and read the first JSON-RPC
    // message out of the body.
    const text = await res.text();
    const message = parseJsonRpc(text);
    if (message.error)
        throw new Error(
            "mcp " + server.name + " " + method + " error: " +
                JSON.stringify(message.error),
        );
    return message.result;
}

function parseJsonRpc(text) {
    const trimmed = text.trim();
    if (trimmed.startsWith("{")) return JSON.parse(trimmed);
    // SSE framing: pull the JSON out of the last "data:" line.
    let payload = "";
    for (const line of trimmed.split("\n")) {
        const l = line.trim();
        if (l.startsWith("data:")) payload = l.slice(5).trim();
    }
    if (!payload) throw new Error("mcp: empty response body");
    return JSON.parse(payload);
}

async function loadMcpTools(servers) {
    const tools = {};
    for (const server of servers) {
        await mcpRpc(server, "initialize", {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "pollinations-prompt-agent", version: "1.0" },
        });
        const list = await mcpRpc(server, "tools/list", {});
        for (const tool of list?.tools ?? []) {
            const name = mcpToolName(server.name, tool.name);
            tools[name] = {
                schema: {
                    type: "function",
                    function: {
                        name,
                        description: tool.description ?? "",
                        parameters: tool.inputSchema ?? {
                            type: "object",
                            properties: {},
                        },
                    },
                },
                async run(args) {
                    const result = await mcpRpc(server, "tools/call", {
                        name: tool.name,
                        arguments: args ?? {},
                    });
                    return stringifyMcpResult(result);
                },
            };
        }
    }
    return tools;
}

function stringifyMcpResult(result) {
    const content = result?.content;
    if (Array.isArray(content)) {
        return content
            .map((part) =>
                part?.type === "text"
                    ? part.text
                    : JSON.stringify(part),
            )
            .join("\n");
    }
    return JSON.stringify(result ?? {});
}

// --- usage accounting -----------------------------------------------------
function addUsage(usage, part) {
    if (!part) return;
    usage.prompt_tokens += part.prompt_tokens ?? 0;
    usage.completion_tokens += part.completion_tokens ?? 0;
}

// --- the tool loop --------------------------------------------------------
async function callModel(env, model, messages, toolSchemas) {
    const body = { model, messages };
    if (toolSchemas.length > 0) body.tools = toolSchemas;
    const res = await fetch(genBase(env) + "/v1/chat/completions", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: "Bearer " + env.POLLINATIONS_KEY,
        },
        body: JSON.stringify(body),
    });
    if (!res.ok)
        throw new Error(
            "base model " + res.status + ": " + (await res.text()),
        );
    return res.json();
}

async function runAgent(env, userMessages) {
    const builtinNames = JSON.parse(env.TOOLS_JSON || "[]");
    const mcpServers = JSON.parse(env.MCP_JSON || "[]");
    const available = builtinTools(env);
    const tools = {};
    for (const name of builtinNames) {
        if (available[name]) tools[name] = available[name];
    }
    Object.assign(tools, await loadMcpTools(mcpServers));
    const toolSchemas = Object.values(tools).map((t) => t.schema);

    const messages = [];
    if (env.SYSTEM_PROMPT)
        messages.push({ role: "system", content: env.SYSTEM_PROMPT });
    for (const m of userMessages) messages.push(m);

    const usage = { prompt_tokens: 0, completion_tokens: 0 };
    const toolCallCounts = {};

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const data = await callModel(env, env.BASE_MODEL, messages, toolSchemas);
        addUsage(usage, data.usage);
        const choice = data.choices?.[0];
        const message = choice?.message ?? { role: "assistant", content: "" };
        const calls = message.tool_calls;
        // Key on tool_calls PRESENCE, not finish_reason: providers mislabel the
        // reason string, but the presence of tool_calls is unambiguous.
        if (!Array.isArray(calls) || calls.length === 0) {
            return {
                content: message.content ?? "",
                usage,
                toolCallCounts,
                finishReason: "stop",
            };
        }
        messages.push(message);
        for (const call of calls) {
            const name = call.function?.name;
            const tool = tools[name];
            let result;
            if (!tool) {
                result = "Error: unknown tool " + name;
            } else {
                let args = {};
                try {
                    args = JSON.parse(call.function?.arguments || "{}");
                } catch {
                    args = {};
                }
                // A tool failure is fed back to the model as the tool result so
                // it can recover (try another tool, answer without it) rather
                // than failing the whole request. This is NOT a retry — the
                // failed call is not re-attempted; the error is surfaced. The
                // call is still counted (the owner's tool ran).
                try {
                    result = await tool.run(args, usage);
                } catch (err) {
                    result = "Error: " + String(err);
                }
                toolCallCounts[billedToolName(name)] =
                    (toolCallCounts[billedToolName(name)] ?? 0) + 1;
            }
            messages.push({
                role: "tool",
                tool_call_id: call.id,
                content: typeof result === "string" ? result : String(result),
            });
        }
    }
    // Hit the round ceiling without a final answer — return what we have rather
    // than loop forever on the owner's key. finish_reason is "length": the
    // response was cut off by a limit, not a natural stop.
    return {
        content:
            "The agent reached its maximum number of tool-use steps without a final answer.",
        usage,
        toolCallCounts,
        finishReason: "length",
    };
}

// MCP tools bill under a single "mcp_call" line; built-ins bill under their own
// name. Owners declare matching toolPrices to charge for either.
function billedToolName(name) {
    return name.startsWith("mcp__") ? "mcp_call" : name;
}

function isAuthorized(request, env) {
    if (!env.BEE_AUTH_TOKEN) return true;
    return (
        request.headers.get("authorization") ===
        "Bearer " + env.BEE_AUTH_TOKEN
    );
}

function buildUsage(out) {
    return {
        prompt_tokens: out.usage.prompt_tokens,
        completion_tokens: out.usage.completion_tokens,
        total_tokens: out.usage.prompt_tokens + out.usage.completion_tokens,
        tool_call_counts: out.toolCallCounts,
    };
}

// The internal tool loop is not itself streamed; we run it to completion and
// frame the final answer as a two-chunk SSE stream (content delta, then a
// finish+usage chunk) so OpenAI streaming clients work. The usage — including
// tool_call_counts — rides the final event where the gateway reads it for
// billing (track.ts scans stream events for the one carrying usage).
function streamResponse(id, created, model, out) {
    const enc = new TextEncoder();
    const send = (controller, payload) =>
        controller.enqueue(
            enc.encode("data: " + JSON.stringify(payload) + "\n\n"),
        );
    const stream = new ReadableStream({
        start(controller) {
            send(controller, {
                id,
                object: "chat.completion.chunk",
                created,
                model,
                choices: [
                    {
                        index: 0,
                        delta: { role: "assistant", content: out.content },
                        finish_reason: null,
                    },
                ],
            });
            send(controller, {
                id,
                object: "chat.completion.chunk",
                created,
                model,
                choices: [
                    { index: 0, delta: {}, finish_reason: out.finishReason },
                ],
                usage: buildUsage(out),
            });
            controller.enqueue(enc.encode("data: [DONE]\n\n"));
            controller.close();
        },
    });
    return new Response(stream, {
        headers: {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            connection: "keep-alive",
        },
    });
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        if (
            request.method === "POST" &&
            url.pathname.endsWith("/chat/completions")
        ) {
            if (!isAuthorized(request, env)) {
                return Response.json(
                    { error: { message: "Unauthorized" } },
                    { status: 401 },
                );
            }
            const body = await request.json();
            const userMessages = Array.isArray(body.messages)
                ? body.messages
                : [];
            const id = "chatcmpl-" + crypto.randomUUID();
            const created = Math.floor(Date.now() / 1000);
            try {
                const out = await runAgent(env, userMessages);
                if (body.stream) {
                    return streamResponse(id, created, env.BASE_MODEL, out);
                }
                return Response.json({
                    id,
                    object: "chat.completion",
                    created,
                    model: env.BASE_MODEL,
                    choices: [
                        {
                            index: 0,
                            message: { role: "assistant", content: out.content },
                            finish_reason: out.finishReason,
                        },
                    ],
                    usage: buildUsage(out),
                });
            } catch (err) {
                return Response.json(
                    { error: { message: String(err) } },
                    { status: 502 },
                );
            }
        }
        if (url.pathname.endsWith("/models")) {
            return Response.json({
                object: "list",
                data: [{ id: env.BASE_MODEL, object: "model" }],
            });
        }
        return new Response("not found", { status: 404 });
    },
};
`;
