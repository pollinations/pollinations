import { Agent, getAgentByName } from "agents";

type BeeState = {
    turns: number;
};

function json(data: unknown, init: ResponseInit = {}): Response {
    const headers = new Headers(init.headers);
    headers.set("content-type", "application/json; charset=utf-8");
    return new Response(JSON.stringify(data), { ...init, headers });
}

function card(origin: string) {
    return {
        protocolVersion: "0.3.0",
        name: "Minimal Cloudflare Bee",
        description: "Cloudflare Agents SDK reference bee.",
        url: `${origin}/a2a`,
        preferredTransport: "JSONRPC",
        defaultInputModes: ["text/plain"],
        defaultOutputModes: ["text/plain"],
        capabilities: { streaming: false },
        skills: [
            {
                id: "reply",
                name: "Reply",
                description: "Echoes a message and persists turn count.",
                tags: ["minimal", "cloudflare"],
            },
        ],
    };
}

async function readText(request: Request): Promise<string> {
    const body = (await request.json()) as {
        text?: string;
        message?: { parts?: Array<{ text?: string }> };
        params?: { message?: { parts?: Array<{ text?: string }> } };
    };
    return (
        body.text ??
        body.message?.parts?.find((part) => part.text)?.text ??
        body.params?.message?.parts?.find((part) => part.text)?.text ??
        ""
    );
}

export class MinimalCloudflareBee extends Agent<Env, BeeState> {
    initialState = { turns: 0 };

    reply(text: string) {
        const next = { turns: this.state.turns + 1 };
        this.setState(next);

        return {
            text: `Cloudflare bee turn ${next.turns}: ${text}`,
            state: next,
        };
    }

    async onRequest(request: Request): Promise<Response> {
        const url = new URL(request.url);
        if (
            request.method === "GET" &&
            url.pathname === "/.well-known/agent-card.json"
        ) {
            return json(card(url.origin));
        }

        if (
            request.method === "POST" &&
            (url.pathname === "/message" || url.pathname === "/web/messages")
        ) {
            return json(this.reply(await readText(request)));
        }

        if (request.method === "POST" && url.pathname === "/a2a") {
            const body = (await request.json()) as {
                id?: string | number | null;
                params?: { message?: { parts?: Array<{ text?: string }> } };
            };
            const text =
                body.params?.message?.parts?.find((part) => part.text)?.text ??
                "";
            const reply = this.reply(text);
            return json({
                jsonrpc: "2.0",
                id: body.id ?? null,
                result: {
                    message: {
                        role: "agent",
                        parts: [{ kind: "text", text: reply.text }],
                    },
                    metadata: { state: reply.state },
                },
            });
        }

        return json({ error: "Not found" }, { status: 404 });
    }
}

export default {
    async fetch(request: Request, env: Env) {
        const agent = await getAgentByName(env.MinimalCloudflareBee, "default");
        return agent.fetch(request);
    },
};
