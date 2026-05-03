// OpenAI-compatible chat completions surface for CatGPT.
//
// Lets any OpenAI client point at this and use `model: "catgpt"`. Mirrors the
// Polly registry pattern (shared/registry/text.ts:861) — same idea, packaged as
// a standalone surface adapter so any bee can opt in.
//
// Two response shapes:
//   - non-streaming: a single OpenAI ChatCompletion object
//   - streaming:     SSE chunks shaped like OpenAI's `chat.completion.chunk`
//
// Image is exposed as a custom `metadata.comic_url` field on the assistant
// message — non-standard but harmless to clients that ignore it. A future
// variant could emit a tool call instead.

import {
  CAT_SYSTEM,
  generateCatReply,
  buildComicImageUrl,
} from "../../core/index.ts";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
};

type ChatCompletionRequest = {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
};

function pickQuestionAndImage(messages: ChatMessage[]): {
  question: string;
  imageUrl: string | null;
} {
  // The most recent user turn defines the question. Image (if any) comes from
  // the same turn's content blocks.
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return { question: "", imageUrl: null };

  if (typeof lastUser.content === "string") {
    return { question: lastUser.content, imageUrl: null };
  }

  let question = "";
  let imageUrl: string | null = null;
  for (const block of lastUser.content) {
    if (block.type === "text" && block.text) question += block.text;
    if (block.type === "image_url" && block.image_url?.url) imageUrl = block.image_url.url;
  }
  return { question, imageUrl };
}

function completionId(): string {
  return `chatcmpl-${Math.random().toString(36).slice(2, 12)}`;
}

function nonStreamingResponse(reply: string, comicUrl: string) {
  return {
    id: completionId(),
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: "catgpt",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: reply,
          // Non-standard but the natural place for it.
          metadata: { comic_url: comicUrl, system: CAT_SYSTEM.split("\n")[0] },
        },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

function* streamingChunks(reply: string, comicUrl: string): Generator<string> {
  const id = completionId();
  const created = Math.floor(Date.now() / 1000);
  const base = { id, object: "chat.completion.chunk", created, model: "catgpt" };

  // First chunk: role.
  yield `data: ${JSON.stringify({
    ...base,
    choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
  })}\n\n`;

  // Stream the reply word-by-word — CatGPT replies are 2–8 words so this is
  // honest, not theatrical.
  const words = reply.split(/(\s+)/);
  for (const word of words) {
    if (!word) continue;
    yield `data: ${JSON.stringify({
      ...base,
      choices: [{ index: 0, delta: { content: word }, finish_reason: null }],
    })}\n\n`;
  }

  // Final chunk with comic_url in metadata + stop reason.
  yield `data: ${JSON.stringify({
    ...base,
    choices: [
      {
        index: 0,
        delta: { metadata: { comic_url: comicUrl } },
        finish_reason: "stop",
      },
    ],
  })}\n\n`;

  yield "data: [DONE]\n\n";
}

export async function handleChatCompletions(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  const body = (await req.json().catch(() => null)) as ChatCompletionRequest | null;
  if (!body || !Array.isArray(body.messages)) {
    return new Response("invalid request", { status: 400 });
  }

  const auth = req.headers.get("authorization");
  const apiKey = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;

  const { question, imageUrl } = pickQuestionAndImage(body.messages);
  const reply = await generateCatReply(question, imageUrl, { apiKey });
  const comicUrl = buildComicImageUrl(question, reply, imageUrl, { apiKey });

  if (body.stream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of streamingChunks(reply, comicUrl)) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });
    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        "connection": "keep-alive",
      },
    });
  }

  return Response.json(nonStreamingResponse(reply, comicUrl));
}

export default { fetch: handleChatCompletions };
