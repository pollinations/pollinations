// The `@pollinations/agent` SDK, shipped as a self-contained ES module.
//
// A community agent worker is uploaded to Cloudflare as a single `index.mjs`
// (the raw `PUT /workers/scripts/{name}` multipart API does NO bundling and no
// npm resolution — bare `import "pkg"` fails at the edge). The multipart API
// DOES accept extra module parts wired by relative-path name, so this SDK ships
// as a SECOND part alongside the user's `index.mjs`, and the user imports it
// with a relative specifier:
//
//   import { defineAgent } from "./pollinations-agent.mjs";
//   export default defineAgent(async (req, { gen, runTools }) => {
//       const out = await runTools({
//           model: "openai",
//           messages: req.messages,
//           tools: ["web_search", "image"],
//           maxRounds: 8,
//       });
//       return out; // { content, toolCallCounts, finishReason }
//   });
//
// `defineAgent` owns everything billing and protocol care about — the OpenAI
// `/chat/completions` + `/models` surface, `BEE_AUTH_TOKEN` auth, SSE framing,
// and the `usage` shape (always emitted, token fields present even when zero,
// plus `tool_call_counts`). A hand-rolled worker can silently report the wrong
// usage shape and break its own billing; this makes that unrepresentable.
//
// The handler returned by `defineAgent` reads the same env bindings the deploy
// path injects: POLLINATIONS_KEY, GEN_BASE_URL, BEE_AUTH_TOKEN. It stays valid
// as a single self-contained ES module (no imports) so it can be uploaded
// verbatim as a module part.
export const POLLINATIONS_AGENT_SDK_SOURCE = String.raw`
// The gateway origin the owner key is valid against, injected per environment.
// Falls back to production if the binding is unset.
function genBase(env) {
    return env.GEN_BASE_URL || "https://gen.pollinations.ai";
}

// An agentic-step ceiling, NOT a retry/timeout: each fetch below is one-shot
// and throws on error. This only bounds how many tool rounds one request may
// take so a looping model can't run up unbounded cost on the owner's key.
const DEFAULT_MAX_TOOL_ROUNDS = 8;

// --- usage accounting -----------------------------------------------------
function addUsage(usage, part) {
    if (!part) return;
    usage.prompt_tokens += part.prompt_tokens ?? 0;
    usage.completion_tokens += part.completion_tokens ?? 0;
}

// --- the gen client -------------------------------------------------------
// A keyless-to-the-user client bound to the injected owner key + gateway. It
// spends the owner's short-lived scoped key on every call, exactly as the owner
// would calling the API themselves. Token usage from each call accumulates into
// the shared usage object so the final response reports the summed total.
function makeGen(env, usage) {
    const key = env.POLLINATIONS_KEY;
    const GEN = genBase(env);
    const authHeader = { authorization: "Bearer " + key };
    return {
        // OpenAI chat completions against a Pollinations model. Returns the raw
        // provider JSON AND a convenience { content }. tools/other options pass
        // through untouched.
        async chat(options) {
            const body = { ...options };
            const res = await fetch(GEN + "/v1/chat/completions", {
                method: "POST",
                headers: { "content-type": "application/json", ...authHeader },
                body: JSON.stringify(body),
            });
            if (!res.ok)
                throw new Error(
                    "chat " + res.status + ": " + (await res.text()),
                );
            const data = await res.json();
            addUsage(usage, data.usage);
            data.content = data.choices?.[0]?.message?.content ?? "";
            return data;
        },
        // Generates an image and returns its URL (a string). Image billing is
        // metered by the gateway on the owner's key like any /image call.
        async image(options) {
            const prompt = encodeURIComponent(String(options?.prompt ?? ""));
            const url = GEN + "/image/" + prompt;
            const res = await fetch(url, { headers: authHeader });
            if (!res.ok)
                throw new Error(
                    "image " + res.status + ": " + (await res.text()),
                );
            return res.url || url;
        },
    };
}

// --- built-in tools -------------------------------------------------------
// Each entry is { schema (the OpenAI function def the base model sees), run
// (executes the call, returns a string result) }. run() throws on upstream
// error. web_search and image are backed by the gen client above.
function builtinTools(gen) {
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
            async run(args) {
                const data = await gen.chat({
                    model: "openai-fast",
                    messages: [
                        {
                            role: "user",
                            content:
                                "Search the web and list the most relevant facts for: " +
                                String(args?.query ?? ""),
                        },
                    ],
                });
                return data.content;
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
                return gen.image({ prompt: String(args?.prompt ?? "") });
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
            clientInfo: { name: "pollinations-agent", version: "1.0" },
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
                part?.type === "text" ? part.text : JSON.stringify(part),
            )
            .join("\n");
    }
    return JSON.stringify(result ?? {});
}

// MCP tools bill under a single "mcp_call" line; built-ins bill under their own
// name. Owners declare matching toolPrices to charge for either.
function billedToolName(name) {
    return name.startsWith("mcp__") ? "mcp_call" : name;
}

// --- the tool loop --------------------------------------------------------
// runTools runs a bounded OpenAI tool-calling loop: call the model with the
// resolved tool schemas, execute any tool calls (built-ins hit gen; MCP tools
// hit the owner's server), feed results back, repeat until the model answers or
// the round ceiling is hit. Returns { content, toolCallCounts, finishReason }.
// The shared usage object (owned by defineAgent) accumulates token usage across
// every internal call so the final response reports the summed total.
export async function runToolsImpl(env, usage, options) {
    const gen = makeGen(env, usage);
    const model = options.model;
    const maxRounds = options.maxRounds ?? DEFAULT_MAX_TOOL_ROUNDS;
    const builtinNames = options.tools ?? [];
    const mcpServers = options.mcpServers ?? [];

    const available = builtinTools(gen);
    const tools = {};
    for (const name of builtinNames) {
        if (available[name]) tools[name] = available[name];
    }
    Object.assign(tools, await loadMcpTools(mcpServers));
    const toolSchemas = Object.values(tools).map((t) => t.schema);

    const messages = [];
    if (options.systemPrompt)
        messages.push({ role: "system", content: options.systemPrompt });
    for (const m of options.messages ?? []) messages.push(m);

    const toolCallCounts = {};

    for (let round = 0; round < maxRounds; round++) {
        const data = await gen.chat({
            model,
            messages,
            ...(toolSchemas.length > 0 ? { tools: toolSchemas } : {}),
        });
        const choice = data.choices?.[0];
        const message = choice?.message ?? { role: "assistant", content: "" };
        const calls = message.tool_calls;
        // Key on tool_calls PRESENCE, not finish_reason: providers mislabel the
        // reason string, but the presence of tool_calls is unambiguous.
        if (!Array.isArray(calls) || calls.length === 0) {
            return {
                content: message.content ?? "",
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
                    result = await tool.run(args);
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
        toolCallCounts,
        finishReason: "length",
    };
}

// --- response framing -----------------------------------------------------
function isAuthorized(request, env) {
    if (!env.BEE_AUTH_TOKEN) return true;
    return (
        request.headers.get("authorization") === "Bearer " + env.BEE_AUTH_TOKEN
    );
}

// Always emit a usage object with the token fields PRESENT (even when zero) and
// tool_call_counts. A missing usage object makes the gateway leave the whole
// request unbilled (tool fees included), so this is not optional.
function buildUsage(usage, toolCallCounts) {
    return {
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
        total_tokens: usage.prompt_tokens + usage.completion_tokens,
        tool_call_counts: toolCallCounts ?? {},
    };
}

// The agent function is not itself streamed; we run it to completion and frame
// the final answer as a two-chunk SSE stream (content delta, then a
// finish+usage chunk) so OpenAI streaming clients work. The usage — including
// tool_call_counts — rides the final event where the gateway reads it for
// billing (track.ts scans stream events for the one carrying usage).
function streamResponse(id, created, model, result, usage) {
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
                        delta: { role: "assistant", content: result.content },
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
                    {
                        index: 0,
                        delta: {},
                        finish_reason: result.finishReason,
                    },
                ],
                usage: buildUsage(usage, result.toolCallCounts),
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

// --- defineAgent ----------------------------------------------------------
// Wraps a user function into a deployable worker. The function receives the
// parsed request ({ messages, model, ...body }) and a context
// ({ gen, runTools }), and returns either a string (the assistant content) or
// { content, toolCallCounts?, finishReason? }. defineAgent owns auth, routing,
// the OpenAI response envelope (streaming and non-streaming), and the usage
// shape — the user never has to get billing-critical framing right by hand.
export function defineAgent(fn) {
    return {
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
                const responseModel = body.model || env.BASE_MODEL || "agent";
                const id = "chatcmpl-" + crypto.randomUUID();
                const created = Math.floor(Date.now() / 1000);
                // usage is shared: gen and runTools accumulate token usage into
                // it, and it is read once when framing the final response.
                const usage = { prompt_tokens: 0, completion_tokens: 0 };
                const gen = makeGen(env, usage);
                const runTools = (options) => runToolsImpl(env, usage, options);
                try {
                    const raw = await fn(body, { gen, runTools, env });
                    const result =
                        typeof raw === "string"
                            ? { content: raw, finishReason: "stop" }
                            : {
                                  content: raw?.content ?? "",
                                  toolCallCounts: raw?.toolCallCounts,
                                  finishReason: raw?.finishReason ?? "stop",
                              };
                    if (body.stream) {
                        return streamResponse(
                            id,
                            created,
                            responseModel,
                            result,
                            usage,
                        );
                    }
                    return Response.json({
                        id,
                        object: "chat.completion",
                        created,
                        model: responseModel,
                        choices: [
                            {
                                index: 0,
                                message: {
                                    role: "assistant",
                                    content: result.content,
                                },
                                finish_reason: result.finishReason,
                            },
                        ],
                        usage: buildUsage(usage, result.toolCallCounts),
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
                    data: [
                        { id: env.BASE_MODEL || "agent", object: "model" },
                    ],
                });
            }
            return new Response("not found", { status: 404 });
        },
    };
}
`;

// The relative module-part name the SDK is uploaded and imported under. The
// user's `index.mjs` imports `./pollinations-agent.mjs`; the deploy path
// uploads THIS source as that part.
export const POLLINATIONS_AGENT_SDK_MODULE_NAME = "pollinations-agent.mjs";
