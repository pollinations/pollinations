import { Agent } from "@mastra/core/agent";
import { createOpenAI } from "@ai-sdk/openai";
import { CAT_SYSTEM, buildComicImageUrl } from "../../../core/index.ts";

export type Turn = { reply: string; comicUrl: string };

// Mastra's Agent wraps an AI SDK model + instructions + (optional) memory and
// tools. Pollinations fits as a custom OpenAI-compat provider.
function pollinations(apiKey?: string) {
  return createOpenAI({
    baseURL: "https://gen.pollinations.ai/v1",
    apiKey: apiKey ?? "anonymous",
  });
}

export function createCatBee(apiKey?: string) {
  const ai = pollinations(apiKey);
  return new Agent({
    name: "CatGPT",
    instructions: CAT_SYSTEM,
    model: ai("claude-fast"),
  });
}

export async function ask(
  question: string,
  imageUrl?: string,
  apiKey?: string,
): Promise<Turn> {
  const bee = createCatBee(apiKey);

  const userContent = imageUrl
    ? [
        { type: "text" as const, text: question },
        { type: "image" as const, image: imageUrl },
      ]
    : question;

  const result = await bee.generate([{ role: "user", content: userContent }]);
  const reply = result.text.trim().replace(/^["']|["']$/g, "");

  return {
    reply,
    comicUrl: buildComicImageUrl(question, reply, imageUrl ?? null, { apiKey }),
  };
}
