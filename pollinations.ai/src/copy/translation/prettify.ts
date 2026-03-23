/**
 * Prettify app descriptions with light markdown formatting.
 * Processes each item individually for optimal Cloudflare cache hits.
 */

import { generateText } from "../../services/pollinationsAPI";
import type { CopyItem } from "./types";

const PRETTIFY_PROMPT = `Rewrite this app description in zine-style for a creative AI showcase. Output ONLY the restyled description — no intro, no commentary, no numbering.

CRITICAL — preserve facts:
- NEVER change, rename, or replace app names or project names — keep them exactly as given
- NEVER invent new names, nicknames, or aliases for the app
- Preserve all proper nouns, tool names, model names, and URLs exactly
- Only restyle the description — do not alter what the app is or does
- ALWAYS use markdown link syntax for URLs: [text](url) — NEVER output bare URLs

Style guide:
- **Bold** the hook or key feature (1-2 bold phrases max)
- *Italic* for attitude or vibe words
- Use \`inline code\` for tech terms, model names, or tools
- ALWAYS use 2-3 short bullet points (- ) to spread the description across multiple lines
- Aim for 20–30 words total — let it breathe
- Zine energy: raw, direct, no corporate fluff
- Same meaning, more personality
- End with ONE emoji on the last bullet — at the very end, not the start
- No emoji anywhere else — only at the end of the last bullet

Example input: Free AI anime art generator — describe scenes to get instant illustrations.
Example output:
**Free AI anime art** — *describe it, see it.*
- Drop a scene prompt, get instant illustrations.
- *No signup, pure creative flow.* 🎨`;

async function prettifyOne(item: CopyItem, apiKey?: string): Promise<CopyItem> {
    const namePrefix = item.name ? `[${item.name}] ` : "";
    const emojiPrefix = item.titleEmoji ? `[title: ${item.titleEmoji}] ` : "";
    const prompt = `${PRETTIFY_PROMPT}\n\n${emojiPrefix}${namePrefix}${item.text}`;

    try {
        const response = await generateText(
            prompt,
            undefined,
            "openai-fast",
            apiKey,
        );
        const text = response.replace(/^\[title:\s*[^\]]*\]\s*/, "").trim();
        return { ...item, text: text || item.text };
    } catch (err) {
        console.error(`❌ [PRETTIFY] Failed for ${item.id}:`, err);
        return item;
    }
}

/**
 * Prettify all items, one at a time (serial via fetchWithRetry queue).
 * Each individual call gets cached by Cloudflare, so adding new apps
 * only requires one fresh API call per new app.
 */
export async function prettifyCopy(
    items: CopyItem[],
    apiKey?: string,
): Promise<CopyItem[]> {
    if (items.length === 0) return items;

    console.log(`✨ [PRETTIFY] Processing ${items.length} descriptions`);
    const results: CopyItem[] = [];
    for (const item of items) {
        results.push(await prettifyOne(item, apiKey));
    }
    console.log(`✅ [PRETTIFY] Done — ${items.length} items`);
    return results;
}
