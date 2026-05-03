import { AIChatAgent } from "agents/ai-chat-agent";
import {
  CAT_SYSTEM,
  generateCatReply,
  buildComicImageUrl,
} from "../../../core";

export type Env = {
  CatGPT: DurableObjectNamespace;
  POLLINATIONS_KEY?: string;
};

// Class is required by the Cloudflare DO binding (runtime constraint).
// All real logic lives in the pure functions imported from core/.
export class CatGPT extends AIChatAgent<Env> {
  async onChatMessage(messages: Array<{ role: string; content: string }>) {
    const last = messages[messages.length - 1];
    const question = typeof last?.content === "string" ? last.content : "";
    const apiKey = this.env.POLLINATIONS_KEY;

    const reply = await generateCatReply(question, null, { apiKey });
    const comicUrl = buildComicImageUrl(question, reply, null, { apiKey });

    this.sql`
      CREATE TABLE IF NOT EXISTS turns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question TEXT,
        reply TEXT,
        comic_url TEXT,
        created_at INTEGER
      )
    `;
    this.sql`
      INSERT INTO turns (question, reply, comic_url, created_at)
      VALUES (${question}, ${reply}, ${comicUrl}, ${Date.now()})
    `;

    return {
      role: "assistant",
      content: reply,
      data: { comicUrl, system: CAT_SYSTEM.split("\n")[0] },
    };
  }
}
