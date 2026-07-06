// Queen Bee: an OpenAI-compatible community agent whose work runs inside a
// Cloudflare Sandbox container. Each request gets a fresh sandbox (one
// sandbox per run — sessions are not a security boundary), the agent script
// executes real internal gen calls with the owner's key, and the sandbox is
// destroyed afterwards. Validated end-to-end with exact billing in #11373.
import { getSandbox, Sandbox } from "@cloudflare/sandbox";

export { Sandbox };

type Env = {
    Sandbox: DurableObjectNamespace;
    POLLINATIONS_KEY: string;
};

// Runs INSIDE the container. Reads QUESTION + POLLINATIONS_KEY from env,
// makes two real gen calls (search step + answer step), prints JSON to stdout.
const AGENT_SCRIPT = `
const GEN = "https://gen.pollinations.ai/v1/chat/completions";

async function callGen(model, prompt) {
    const res = await fetch(GEN, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: \`Bearer \${process.env.POLLINATIONS_KEY}\`,
            "user-agent": "queen-bee/1.0",
        },
        body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) throw new Error(\`gen \${model} \${res.status}: \${await res.text()}\`);
    const data = await res.json();
    return { content: data.choices?.[0]?.message?.content ?? "", usage: data.usage ?? {} };
}

const question = process.env.QUESTION ?? "hello";
const search = await callGen("openai-fast", \`You are a search tool. List 3 one-line facts relevant to: \${question}\`);
const answer = await callGen("gemini-fast", \`Search results:\\n\${search.content}\\n\\nUsing these results, answer briefly: \${question}\`);
process.stdout.write(JSON.stringify({
    content: answer.content,
    prompt_tokens: (search.usage.prompt_tokens ?? 0) + (answer.usage.prompt_tokens ?? 0),
    completion_tokens: (search.usage.completion_tokens ?? 0) + (answer.usage.completion_tokens ?? 0),
    internal_calls: [
        { model: "openai-fast", usage: search.usage },
        { model: "gemini-fast", usage: answer.usage },
    ],
}));
`;

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        if (
            request.method === "POST" &&
            url.pathname.endsWith("/chat/completions")
        ) {
            const body = (await request.json()) as {
                messages?: { role: string; content: string }[];
            };
            const question =
                body.messages?.filter((m) => m.role === "user").pop()
                    ?.content ?? "hello";

            const sandbox = getSandbox(env.Sandbox, crypto.randomUUID());
            try {
                await sandbox.writeFile("/workspace/agent.mjs", AGENT_SCRIPT);
                const result = await sandbox.exec("node /workspace/agent.mjs", {
                    env: {
                        QUESTION: question,
                        POLLINATIONS_KEY: env.POLLINATIONS_KEY,
                    },
                });
                if (result.exitCode !== 0) {
                    throw new Error(
                        `agent exited ${result.exitCode}: ${result.stderr}`,
                    );
                }
                const out = JSON.parse(result.stdout) as {
                    content: string;
                    prompt_tokens: number;
                    completion_tokens: number;
                    internal_calls: unknown[];
                };
                return Response.json({
                    id: `chatcmpl-${crypto.randomUUID()}`,
                    object: "chat.completion",
                    created: Math.floor(Date.now() / 1000),
                    model: "queen-bee-v1",
                    choices: [
                        {
                            index: 0,
                            message: {
                                role: "assistant",
                                content: out.content,
                            },
                            finish_reason: "stop",
                        },
                    ],
                    usage: {
                        prompt_tokens: out.prompt_tokens,
                        completion_tokens: out.completion_tokens,
                        total_tokens: out.prompt_tokens + out.completion_tokens,
                        tool_call_counts: { sandbox_run: 1 },
                        internal_calls: out.internal_calls,
                    },
                });
            } catch (err) {
                return Response.json(
                    { error: { message: String(err) } },
                    { status: 502 },
                );
            } finally {
                await sandbox.destroy();
            }
        }
        if (url.pathname.endsWith("/models")) {
            return Response.json({
                object: "list",
                data: [{ id: "queen-bee-v1", object: "model" }],
            });
        }
        return new Response("not found", { status: 404 });
    },
};
