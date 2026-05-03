import { Agent } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import { buildComicImageUrl, CAT_SYSTEM } from "../../../core/index.ts";

export type ConversationId = string;
export type Turn = { reply: string; comicUrl: string };

const agents = new Map<ConversationId, Agent>();

// pi-ai supports OpenAI-compatible endpoints; we point it at Pollinations.
function newAgent() {
    return new Agent({
        initialState: {
            systemPrompt: CAT_SYSTEM,
            // Pollinations exposes claude-fast over its OpenAI-compat endpoint.
            // pi-ai's openai provider is the closest fit.
            model: getModel("openai", "claude-fast"),
            thinkingLevel: "minimal",
            tools: [],
            messages: [],
        },
        getApiKey(provider) {
            if (provider === "openai")
                return process.env.TEXT_POLLINATIONS_TOKEN;
            return undefined;
        },
        getBaseUrl(provider) {
            if (provider === "openai") return "https://gen.pollinations.ai/v1";
            return undefined;
        },
    } as any);
}

function getOrCreate(id: ConversationId): Agent {
    const existing = agents.get(id);
    if (existing) return existing;
    const a = newAgent();
    agents.set(id, a);
    return a;
}

function extractText(messages: unknown[]): string {
    for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i] as {
            role?: string;
            content?: Array<{ type?: string; text?: string }>;
        };
        if (m?.role !== "assistant" || !Array.isArray(m.content)) continue;
        const text = m.content
            .filter((b) => b?.type === "text" && typeof b.text === "string")
            .map((b) => b.text ?? "")
            .join("")
            .trim();
        if (text) return text;
    }
    return "";
}

export async function ask(
    conversationId: ConversationId,
    question: string,
    imageUrl?: string,
    apiKey?: string,
): Promise<Turn> {
    const agent = getOrCreate(conversationId);
    await agent.prompt(question);
    const reply = extractText(agent.state.messages as unknown[]).replace(
        /^["']|["']$/g,
        "",
    );
    return {
        reply,
        comicUrl: buildComicImageUrl(question, reply, imageUrl ?? null, {
            apiKey,
        }),
    };
}
