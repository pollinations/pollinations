import { OpenAI } from "@llamaindex/openai";
import type { ChatMessage } from "llamaindex";
import { buildComicImageUrl, CAT_SYSTEM } from "../../../core/index.ts";

export type Turn = { reply: string; comicUrl: string };

// LlamaIndex.TS — `OpenAI` LLM repointed at Pollinations.
//
// LlamaIndex's strength is RAG / data agents, not tiny chat bees, but the
// shape lets us compare the LLM-call ergonomics. For CatGPT this is just
// `llm.chat({ messages })` with the system prompt prepended.
function llm(apiKey?: string) {
    return new OpenAI({
        model: "claude-fast",
        apiKey: apiKey ?? "anonymous",
        baseURL: "https://gen.pollinations.ai/v1",
        maxTokens: 64,
    });
}

export async function ask(
    question: string,
    imageUrl?: string,
    apiKey?: string,
): Promise<Turn> {
    const messages: ChatMessage[] = [
        { role: "system", content: CAT_SYSTEM },
        {
            role: "user",
            content: imageUrl
                ? [
                      { type: "text", text: question },
                      { type: "image_url", image_url: { url: imageUrl } },
                  ]
                : question,
        } as ChatMessage,
    ];

    const result = await llm(apiKey).chat({ messages });
    const content = result.message.content;
    const reply = (
        typeof content === "string"
            ? content
            : content
                  .filter((b) => b.type === "text")
                  .map((b: any) => b.text)
                  .join("")
    )
        .trim()
        .replace(/^["']|["']$/g, "");

    return {
        reply,
        comicUrl: buildComicImageUrl(question, reply, imageUrl ?? null, {
            apiKey,
        }),
    };
}
