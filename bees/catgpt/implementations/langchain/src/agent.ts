import {
    HumanMessage,
    type MessageContent,
    SystemMessage,
} from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { buildComicImageUrl, CAT_SYSTEM } from "../../../core/index.ts";

export type Turn = { reply: string; comicUrl: string };

function model(apiKey?: string) {
    return new ChatOpenAI({
        model: "claude-fast",
        apiKey: apiKey ?? "anonymous",
        configuration: { baseURL: "https://gen.pollinations.ai/v1" },
        maxTokens: 64,
    });
}

export async function ask(
    question: string,
    imageUrl?: string,
    apiKey?: string,
): Promise<Turn> {
    const llm = model(apiKey);

    const userContent: MessageContent = imageUrl
        ? [
              { type: "text", text: question },
              { type: "image_url", image_url: { url: imageUrl } },
          ]
        : question;

    const result = await llm.invoke([
        new SystemMessage(CAT_SYSTEM),
        new HumanMessage({ content: userContent }),
    ]);

    const reply = String(result.content)
        .trim()
        .replace(/^["']|["']$/g, "");

    return {
        reply,
        comicUrl: buildComicImageUrl(question, reply, imageUrl ?? null, {
            apiKey,
        }),
    };
}
