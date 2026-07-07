import { beforeEach, describe, expect, it, vi } from "vitest";
import { POLLINATIONS_AGENT_SDK_SOURCE } from "../src/services/pollinations-agent-sdk.ts";
import { PROMPT_AGENT_TEMPLATE_SOURCE } from "../src/services/prompt-agent-template.ts";

// Load the deployed template + its SDK module part and drive the default fetch
// handler, mocking global fetch so the base-model and tool calls are
// controllable. This exercises the SDK's tool loop, streaming SSE framing, and
// tool-error recovery for real rather than by string match.
//
// At deploy the two are uploaded as separate ES-module parts and the template's
// `import "./pollinations-agent.mjs"` is wired by Cloudflare. The Workers test
// pool can't dynamically import data: URLs, so we simulate that wiring in one
// function scope: strip the SDK's `export` keywords so its declarations become
// locals, drop the template's `import` line, and rewrite `export default X` to
// `return X`. defineAgent is then in scope for the template body.
type AgentModule = {
    default: {
        fetch: (
            request: Request,
            env: Record<string, string>,
        ) => Promise<Response>;
    };
};

async function loadTemplate(): Promise<AgentModule["default"]> {
    const sdkBody = POLLINATIONS_AGENT_SDK_SOURCE.replaceAll(
        /export (function|const|async function) /g,
        "$1 ",
    );
    const templateBody = PROMPT_AGENT_TEMPLATE_SOURCE.replace(
        /^\s*import\s+\{[^}]*\}\s+from\s+["']\.\/pollinations-agent\.mjs["'];?/m,
        "",
    ).replace(/export default /, "return ");
    const factory = new Function(`${sdkBody}\n${templateBody}`);
    return factory() as AgentModule["default"];
}

const BASE_ENV = {
    SYSTEM_PROMPT: "You are a test agent.",
    BASE_MODEL: "openai",
    TOOLS_JSON: JSON.stringify(["web_search"]),
    MCP_JSON: "[]",
    POLLINATIONS_KEY: "sk_test",
    GEN_BASE_URL: "https://gen.test.example",
    BEE_AUTH_TOKEN: "secret-token",
};

function chatRequest(body: Record<string, unknown>): Request {
    return new Request("https://bee.example.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: "Bearer secret-token",
        },
        body: JSON.stringify(body),
    });
}

describe("prompt-agent template", () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
    });

    it("rejects callers without the auth token", async () => {
        const agent = await loadTemplate();
        const res = await agent.fetch(
            new Request("https://bee.example.com/v1/chat/completions", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ messages: [] }),
            }),
            BASE_ENV,
        );
        expect(res.status).toBe(401);
    });

    it("runs the tool loop and returns a chat.completion with tool_call_counts", async () => {
        // web_search runs as an internal chat call, so every completions call
        // after the first tool-requesting turn returns content.
        let n = 0;
        const fetchMock = vi.fn(async () => {
            n++;
            if (n === 1) {
                return Response.json({
                    choices: [
                        {
                            message: {
                                role: "assistant",
                                content: "",
                                tool_calls: [
                                    {
                                        id: "c1",
                                        function: {
                                            name: "web_search",
                                            arguments: '{"query":"x"}',
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                    usage: { prompt_tokens: 10, completion_tokens: 5 },
                });
            }
            return Response.json({
                choices: [{ message: { role: "assistant", content: "done" } }],
                usage: { prompt_tokens: 4, completion_tokens: 2 },
            });
        });
        vi.stubGlobal("fetch", fetchMock);

        const agent = await loadTemplate();
        const res = await agent.fetch(
            chatRequest({ messages: [{ role: "user", content: "hi" }] }),
            BASE_ENV,
        );
        expect(res.status).toBe(200);
        const json = (await res.json()) as {
            choices: { message: { content: string }; finish_reason: string }[];
            usage: {
                prompt_tokens: number;
                tool_call_counts: Record<string, number>;
            };
        };
        expect(json.choices[0].message.content).toBe("done");
        expect(json.choices[0].finish_reason).toBe("stop");
        // web_search ran once and its usage summed into the total.
        expect(json.usage.tool_call_counts).toEqual({ web_search: 1 });
        expect(json.usage.prompt_tokens).toBeGreaterThan(10);
        // Calls the injected gateway (the minted key is only valid there), not
        // the hardcoded production origin.
        for (const call of fetchMock.mock.calls) {
            const url =
                typeof call[0] === "string"
                    ? call[0]
                    : (call[0] as Request).url;
            expect(url.startsWith("https://gen.test.example")).toBe(true);
        }
    });

    it("streams SSE with usage on the final chunk when stream:true", async () => {
        const fetchMock = vi.fn(async () =>
            Response.json({
                choices: [
                    { message: { role: "assistant", content: "hello world" } },
                ],
                usage: { prompt_tokens: 6, completion_tokens: 4 },
            }),
        );
        vi.stubGlobal("fetch", fetchMock);

        const agent = await loadTemplate();
        const res = await agent.fetch(
            chatRequest({
                messages: [{ role: "user", content: "hi" }],
                stream: true,
            }),
            BASE_ENV,
        );
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toContain("text/event-stream");
        const text = await res.text();
        const events = text
            .split("\n\n")
            .map((block) => block.replace(/^data: /, "").trim())
            .filter((line) => line.length > 0);
        expect(events.at(-1)).toBe("[DONE]");
        const dataEvents = events
            .filter((e) => e !== "[DONE]")
            .map((e) => JSON.parse(e));
        // First chunk carries the content delta; final chunk carries the
        // finish_reason and usage (where the gateway reads tool_call_counts).
        expect(dataEvents[0].choices[0].delta.content).toBe("hello world");
        const finalChunk = dataEvents.at(-1);
        expect(finalChunk.choices[0].finish_reason).toBe("stop");
        expect(finalChunk.usage.tool_call_counts).toEqual({});
        expect(finalChunk.usage.prompt_tokens).toBe(6);
    });

    it("feeds a failing tool's error back to the model instead of 502", async () => {
        let n = 0;
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            const url = new URL(
                typeof input === "string" ? input : (input as Request).url,
            );
            n++;
            // First turn: ask for the image tool.
            if (n === 1) {
                return Response.json({
                    choices: [
                        {
                            message: {
                                role: "assistant",
                                content: "",
                                tool_calls: [
                                    {
                                        id: "c1",
                                        function: {
                                            name: "image",
                                            arguments: '{"prompt":"cat"}',
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                    usage: { prompt_tokens: 3, completion_tokens: 1 },
                });
            }
            // The image tool hits /image/* and fails.
            if (url.pathname.startsWith("/image/")) {
                return new Response("upstream boom", { status: 500 });
            }
            // Next model turn recovers and answers.
            return Response.json({
                choices: [
                    {
                        message: {
                            role: "assistant",
                            content: "sorry, image failed",
                        },
                    },
                ],
                usage: { prompt_tokens: 2, completion_tokens: 2 },
            });
        });
        vi.stubGlobal("fetch", fetchMock);

        const agent = await loadTemplate();
        const res = await agent.fetch(
            chatRequest({
                messages: [{ role: "user", content: "draw a cat" }],
            }),
            { ...BASE_ENV, TOOLS_JSON: JSON.stringify(["image"]) },
        );
        // A tool failure does not fail the request.
        expect(res.status).toBe(200);
        const json = (await res.json()) as {
            choices: { message: { content: string } }[];
            usage: { tool_call_counts: Record<string, number> };
        };
        expect(json.choices[0].message.content).toBe("sorry, image failed");
        // The (failed) tool call is still counted — the owner's tool ran.
        expect(json.usage.tool_call_counts).toEqual({ image: 1 });
    });
});

// Loads the SDK and calls defineAgent with an ARBITRARY user function (the
// "write one function" DX), not the prompt-agent template. `userFnBody` is the
// body of `async (request, { gen, runTools, env }) => { ... }`.
async function loadUserAgent(
    userFnBody: string,
): Promise<AgentModule["default"]> {
    const sdkBody = POLLINATIONS_AGENT_SDK_SOURCE.replaceAll(
        /export (function|const|async function) /g,
        "$1 ",
    );
    const factory = new Function(
        `${sdkBody}\nreturn defineAgent(async (request, { gen, runTools, env }) => {${userFnBody}});`,
    );
    return factory() as AgentModule["default"];
}

describe("defineAgent (SDK direct)", () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
    });

    it("wraps a plain-string return into a chat.completion with zeroed-but-present usage", async () => {
        const fetchMock = vi.fn(async () =>
            Response.json({
                choices: [{ message: { role: "assistant", content: "hi!" } }],
                usage: { prompt_tokens: 7, completion_tokens: 3 },
            }),
        );
        vi.stubGlobal("fetch", fetchMock);

        // A minimal agent: one gen.chat call, return the string.
        const agent = await loadUserAgent(`
            const r = await gen.chat({ model: "openai-fast", messages: request.messages });
            return r.content;
        `);
        const res = await agent.fetch(
            chatRequest({ messages: [{ role: "user", content: "yo" }] }),
            BASE_ENV,
        );
        expect(res.status).toBe(200);
        const json = (await res.json()) as {
            choices: { message: { content: string }; finish_reason: string }[];
            usage: {
                prompt_tokens: number;
                completion_tokens: number;
                total_tokens: number;
                tool_call_counts: Record<string, number>;
            };
        };
        expect(json.choices[0].message.content).toBe("hi!");
        expect(json.choices[0].finish_reason).toBe("stop");
        // gen.chat's token usage accumulated into the response.
        expect(json.usage.prompt_tokens).toBe(7);
        expect(json.usage.total_tokens).toBe(10);
        // The usage object is ALWAYS present with tool_call_counts — a missing
        // usage would make the gateway leave the whole request unbilled.
        expect(json.usage.tool_call_counts).toEqual({});
    });

    it("passes through an object return with explicit toolCallCounts", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => Response.json({ choices: [], usage: {} })),
        );
        // An agent that reports a tool fee without any gen call.
        const agent = await loadUserAgent(`
            return { content: "done", toolCallCounts: { my_tool: 2 } };
        `);
        const res = await agent.fetch(chatRequest({ messages: [] }), BASE_ENV);
        expect(res.status).toBe(200);
        const json = (await res.json()) as {
            choices: { message: { content: string } }[];
            usage: { tool_call_counts: Record<string, number> };
        };
        expect(json.choices[0].message.content).toBe("done");
        expect(json.usage.tool_call_counts).toEqual({ my_tool: 2 });
    });

    it("rejects unauthorized callers before running the function", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        const agent = await loadUserAgent(`return "should not run";`);
        const res = await agent.fetch(
            new Request("https://bee.example.com/v1/chat/completions", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ messages: [] }),
            }),
            BASE_ENV,
        );
        expect(res.status).toBe(401);
        // The user function never ran, so no upstream call was made.
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("surfaces a thrown error as a 502 without crashing the worker", async () => {
        vi.stubGlobal("fetch", vi.fn());
        const agent = await loadUserAgent(`throw new Error("kaboom");`);
        const res = await agent.fetch(chatRequest({ messages: [] }), BASE_ENV);
        expect(res.status).toBe(502);
        const json = (await res.json()) as { error: { message: string } };
        expect(json.error.message).toContain("kaboom");
    });
});
