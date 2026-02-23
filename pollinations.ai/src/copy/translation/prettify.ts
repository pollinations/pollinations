/**
 * Prettify app descriptions with light markdown formatting.
 * Uses a simple numbered-line format to minimize tokens.
 */

import { generateText } from "../../services/pollinationsAPI";
import { memoizeAsync } from "../../utils";

interface CopyItem {
    id: string;
    text: string;
    name?: string;
}

const PRETTIFY_PROMPT = `Rewrite each app description in zine-style for a creative AI showcase. Output ONLY numbered entries — no intro, no commentary.

Each entry starts with its number (e.g. "1.") on the first line, then continues with markdown on the following lines until the next number.

CRITICAL — preserve facts:
- NEVER change, rename, or replace app names or project names — keep them exactly as given
- NEVER invent new names, nicknames, or aliases for the app
- Preserve all proper nouns, tool names, model names, and URLs exactly
- Only restyle the description — do not alter what the app is or does

Style guide:
- One emoji at the start — no emoji spam
- **Bold** the hook or key feature (1-2 bold phrases max)
- *Italic* for attitude or vibe words
- Use \`inline code\` for tech terms, model names, or tools
- Use markdown line breaks and short bullet lists to spread across 2-4 lines
- Aim for 20–30 words — let it breathe across multiple lines
- Zine energy: raw, direct, no corporate fluff
- Same meaning, more personality

Example format:
1. 🎨 **Paint with AI** — *your canvas, infinite.*
- Drop a prompt, get art. \`Flux\` models, real-time preview.
- Remix, iterate, share.
2. 🤖 **Chat without limits.**
Build convos with \`GPT\`, \`Claude\`, and more — *zero config, pure signal.*`;

async function prettifyDescriptions(
    items: CopyItem[],
    apiKey?: string,
): Promise<CopyItem[]> {
    const lines = items
        .map((item, i) => {
            const prefix = item.name ? `[${item.name}] ` : "";
            return `${i + 1}. ${prefix}${item.text}`;
        })
        .join("\n");
    const prompt = `${PRETTIFY_PROMPT}\n\n${lines}`;

    console.log(`✨ [PRETTIFY] Processing ${items.length} descriptions`);

    const response = await generateText(prompt, undefined, undefined, apiKey);
    const result = parseNumberedEntries(response, items);
    console.log("✅ [PRETTIFY] Done");

    return result;
}

const memoizedPrettify = memoizeAsync(
    prettifyDescriptions,
    (items, apiKey) =>
        `prettify:${apiKey || "default"}:${items.map((i) => i.id).join(",")}`,
);

export async function prettifyCopy(
    items: CopyItem[],
    apiKey?: string,
): Promise<CopyItem[]> {
    if (items.length === 0) return items;
    return memoizedPrettify(items, apiKey);
}

function parseNumberedEntries(
    response: string,
    fallback: CopyItem[],
): CopyItem[] {
    try {
        // Split on lines that start with a number + dot (e.g. "1.", "12.")
        // Group all lines between numbered markers as one entry
        const entries: string[] = [];
        let current: string[] = [];

        for (const line of response.split("\n")) {
            if (/^\d+\.\s/.test(line)) {
                if (current.length > 0) {
                    entries.push(current.join("\n"));
                }
                current = [line.replace(/^\d+\.\s*/, "").trim()];
            } else if (current.length > 0) {
                current.push(line);
            }
        }
        if (current.length > 0) {
            entries.push(current.join("\n"));
        }

        if (entries.length < fallback.length) {
            throw new Error(
                `Expected ${fallback.length} entries, got ${entries.length}`,
            );
        }

        return fallback.map((item, i) => ({
            ...item,
            text: entries[i]?.trim() || item.text,
        }));
    } catch (err) {
        console.error("❌ [PRETTIFY] Failed to parse response:", err);
        return fallback;
    }
}
