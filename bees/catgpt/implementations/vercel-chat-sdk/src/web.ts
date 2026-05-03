import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { CAT_SYSTEM, buildComicImageUrl } from "../../../core";

// Edge-style streaming chat handler.
// Pairs with `useChat()` on the client; we stream the cat reply token-by-token
// and tack the comic URL on as a tool result at the end.
export async function handleChatRequest(req: Request): Promise<Response> {
  const { messages, imageUrl } = (await req.json()) as {
    messages: Array<{ role: string; content: string }>;
    imageUrl?: string;
  };
  const auth = req.headers.get("authorization");
  const apiKey = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;

  const ai = createOpenAI({
    baseURL: "https://gen.pollinations.ai/v1",
    apiKey: apiKey ?? "anonymous",
  });

  const result = await streamText({
    model: ai("claude-fast"),
    system: CAT_SYSTEM,
    messages,
    onFinish: async ({ text }) => {
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      const question = typeof lastUser?.content === "string" ? lastUser.content : "";
      // Side-channel: comic URL is computed deterministically from (question, reply).
      // The web client can rebuild it the same way, or the server can push it
      // as a custom data part in a streaming response.
      const reply = text.trim().replace(/^["']|["']$/g, "");
      console.log("comic:", buildComicImageUrl(question, reply, imageUrl ?? null, { apiKey }));
    },
  });

  return result.toDataStreamResponse();
}

export default { fetch: handleChatRequest };
