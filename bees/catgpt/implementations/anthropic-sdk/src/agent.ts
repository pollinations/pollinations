import Anthropic from "@anthropic-ai/sdk";
import { CAT_SYSTEM, buildComicImageUrl } from "../../../core/index.ts";

export type Turn = { reply: string; comicUrl: string };

// Pollinations exposes claude-fast over Anthropic's wire format too. Talk to
// it the same way you'd talk to api.anthropic.com — just a baseURL flip.
//
// Note: Pollinations primarily routes Anthropic models through its OpenAI-
// compat endpoint (via Portkey). Talking to it via the Anthropic SDK directly
// works when the route is registered for native messages; otherwise route
// through /v1/chat/completions instead. This variant exists to compare the
// SDK ergonomics for bee authors who already use Anthropic.
function client(apiKey?: string) {
  return new Anthropic({
    baseURL: "https://gen.pollinations.ai/anthropic",
    apiKey: apiKey ?? "anonymous",
  });
}

export async function ask(
  question: string,
  imageUrl?: string,
  apiKey?: string,
): Promise<Turn> {
  const c = client(apiKey);

  const userContent = imageUrl
    ? [
        { type: "text" as const, text: question },
        // Anthropic accepts an image as a URL block since SDK 0.30+.
        { type: "image" as const, source: { type: "url" as const, url: imageUrl } },
      ]
    : question;

  const msg = await c.messages.create({
    model: "claude-fast",
    max_tokens: 64,
    system: CAT_SYSTEM,
    messages: [{ role: "user", content: userContent }],
  });

  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim()
    .replace(/^["']|["']$/g, "");

  return {
    reply: text,
    comicUrl: buildComicImageUrl(question, text, imageUrl ?? null, { apiKey }),
  };
}
