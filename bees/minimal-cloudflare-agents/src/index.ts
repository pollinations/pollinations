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

export class MinimalCloudflareBee extends Agent<Env, BeeState> {
    initialState = { turns: 0 };

    async onRequest(request: Request): Promise<Response> {
        const url = new URL(request.url);
        if (
            request.method === "GET" &&
            url.pathname === "/.well-known/agent-card.json"
        ) {
            return json(card(url.origin));
        }
        if (request.method !== "POST" || url.pathname !== "/message") {
            return json({ error: "Not found" }, { status: 404 });
        }

        const body = (await request.json()) as { text?: string };
        const next = { turns: this.state.turns + 1 };
        this.setState(next);

        return json({
            text: `Cloudflare bee turn ${next.turns}: ${body.text ?? ""}`,
            state: next,
        });
    }
}

export default {
    async fetch(request: Request, env: Env) {
        const agent = await getAgentByName(env.MinimalCloudflareBee, "default");
        return agent.fetch(request);
    },
};
