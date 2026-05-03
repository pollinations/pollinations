import {
  generateCatReply,
  buildComicImageUrl,
  type CatTurn,
} from "../../../core/index.ts";

export type AgentInput = {
  question: string;
  imageUrl?: string;
  apiKey?: string;
};

export async function runCatGPT(input: AgentInput): Promise<CatTurn> {
  const reply = await generateCatReply(input.question, input.imageUrl ?? null, {
    apiKey: input.apiKey,
  });
  const comicUrl = buildComicImageUrl(
    input.question,
    reply,
    input.imageUrl ?? null,
    { apiKey: input.apiKey },
  );
  return { question: input.question, imageUrl: input.imageUrl, reply, comicUrl };
}
