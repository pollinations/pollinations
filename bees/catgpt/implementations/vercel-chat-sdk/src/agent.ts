import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { CAT_SYSTEM, buildComicImageUrl } from "../../../core";

export type Turn = { reply: string; comicUrl: string };

function pollinations(apiKey?: string) {
  return createOpenAI({
    baseURL: "https://gen.pollinations.ai/v1",
    apiKey: apiKey ?? "anonymous",
  });
}

export async function ask(
  question: string,
  imageUrl?: string,
  apiKey?: string,
): Promise<Turn> {
  const ai = pollinations(apiKey);

  const userContent = imageUrl
    ? [
        { type: "text" as const, text: question },
        { type: "image" as const, image: imageUrl },
      ]
    : question;

  const { text } = await generateText({
    model: ai("claude-fast"),
    system: CAT_SYSTEM,
    messages: [{ role: "user", content: userContent }],
  });

  const reply = text.trim().replace(/^["']|["']$/g, "");
  return {
    reply,
    comicUrl: buildComicImageUrl(question, reply, imageUrl ?? null, { apiKey }),
  };
}
