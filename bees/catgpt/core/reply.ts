import { CAT_SYSTEM } from "./prompt.ts";
import type { CatReplyOptions } from "./types.ts";

const DEFAULT_ENDPOINT = "https://gen.pollinations.ai/v1/chat/completions";
const DEFAULT_MODEL = "claude-fast";

export async function generateCatReply(
  question: string,
  imageUrl: string | null = null,
  opts: CatReplyOptions = {},
): Promise<string> {
  const userContent = imageUrl
    ? [
        { type: "text", text: question },
        { type: "image_url", image_url: { url: imageUrl } },
      ]
    : question;

  const res = await fetch(opts.endpoint ?? DEFAULT_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: opts.model ?? DEFAULT_MODEL,
      messages: [
        { role: "system", content: CAT_SYSTEM },
        { role: "user", content: userContent },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Cat reply failed: ${res.status}`);
  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices[0].message.content.trim().replace(/^["']|["']$/g, "");
}
