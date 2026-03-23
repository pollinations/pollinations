import { useEffect, useMemo, useState } from "react";
import type { CopyItem } from "../copy/translation/types";
import { generateText } from "../services/pollinationsAPI";
import { getBrowserLanguage, memoizeAsync } from "../utils";

/** Feature flag — flip to false to disable globally */
const ENABLED = true;

const PRETTIFY_PROMPT = `Rewrite each description in zine-style. Output ONLY numbered entries — no intro, no commentary.

Each entry starts with its number (e.g. "1.") on the first line, then continues with markdown on the following lines until the next number.

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

Example format:
1. **Paint with AI** — *your canvas, infinite.*
- Drop a prompt, get art. \`Flux\` models, real-time preview.
- Remix, iterate, share. 🖌️
2. **Chat without limits.**
- Build convos with \`GPT\`, \`Claude\`, and more.
- *Zero config, pure signal.* 💬`;

function buildPrompt(items: CopyItem[], language: string): string {
    const lines = items
        .map((item, i) => {
            const namePrefix = item.name ? `[${item.name}] ` : "";
            const emojiPrefix = item.titleEmoji
                ? `[title: ${item.titleEmoji}] `
                : "";
            return `${i + 1}. ${emojiPrefix}${namePrefix}${item.text}`;
        })
        .join("\n");

    if (language === "en") {
        return `${PRETTIFY_PROMPT}\n\n${lines}`;
    }

    return `First translate each description to ${language} (natural, idiomatic — not word-for-word). Then restyle the translated text in zine format.

${PRETTIFY_PROMPT}

IMPORTANT: The final output MUST be in ${language}. Translate first, then apply zine styling.

${lines}`;
}

function parseNumberedEntries(
    response: string,
    fallback: CopyItem[],
): CopyItem[] {
    try {
        const entries: string[] = [];
        let current: string[] = [];

        for (const line of response.split("\n")) {
            if (/^\d+\.\s*$/.test(line) || /^\d+\.\s/.test(line)) {
                if (current.length > 0) {
                    entries.push(current.join("\n"));
                }
                current = [
                    line
                        .replace(/^\d+\.\s*/, "")
                        .replace(/^\[title:\s*[^\]]*\]\s*/, "")
                        .trim(),
                ];
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

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function cacheKey(items: CopyItem[], language: string): string {
    const hash = items.map((i) => i.text).join("|");
    return `prettify:${language}:${hash.slice(0, 100)}:${items.length}`;
}

function readCache(key: string): CopyItem[] | null {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const entry = JSON.parse(raw);
        if (Date.now() - entry.timestamp > CACHE_TTL_MS) return null;
        return entry.data;
    } catch {
        return null;
    }
}

function writeCache(key: string, data: CopyItem[]): void {
    try {
        localStorage.setItem(
            key,
            JSON.stringify({ data, timestamp: Date.now() }),
        );
    } catch {
        // localStorage full — silently ignore
    }
}

async function processItems(
    items: CopyItem[],
    language: string,
): Promise<CopyItem[]> {
    const key = cacheKey(items, language);
    const cached = readCache(key);
    if (cached) {
        console.log(`✅ [PRETTIFY] Serving ${items.length} items from cache`);
        return cached;
    }

    console.log(
        `✨ [PRETTIFY] Processing ${items.length} items (lang: ${language})`,
    );
    const prompt = buildPrompt(items, language);
    const response = await generateText(prompt, undefined, "openai-fast");
    const result = parseNumberedEntries(response, items);
    writeCache(key, result);
    console.log("✅ [PRETTIFY] Done");
    return result;
}

const memoizedProcess = memoizeAsync(
    processItems,
    (items, language) =>
        `prettify:${language}:${items.length}:${items.map((i) => i.id).join(",")}`,
);

/**
 * Combined hook: translates (if needed) and prettifies in a single API call.
 * For English browsers, only prettifies. For others, translates then prettifies.
 */
export function useTranslateAndPrettify<T, K extends keyof T>(
    items: T[],
    field: K,
    nameField?: keyof T,
    emojiField?: keyof T,
): { processed: T[]; isProcessing: boolean } {
    const language = getBrowserLanguage();
    const [processed, setProcessed] = useState<T[]>(items);
    const [isProcessing, setIsProcessing] = useState(false);

    const itemsKey = useMemo(() => JSON.stringify(items), [items]);

    // Keep in sync when items change
    // biome-ignore lint/correctness/useExhaustiveDependencies: itemsKey is a stable serialization
    useEffect(() => {
        setProcessed(items);
    }, [itemsKey]);

    // biome-ignore lint/correctness/useExhaustiveDependencies: itemsKey is a stable serialization
    useEffect(() => {
        if (!ENABLED || items.length === 0) return;

        setIsProcessing(true);

        const copyItems = items.map((item, i) => ({
            id: `item-${i}`,
            text: String(item[field] ?? ""),
            name: nameField ? String(item[nameField] ?? "") : undefined,
            titleEmoji: emojiField ? String(item[emojiField] ?? "") : undefined,
        }));

        memoizedProcess(copyItems, language)
            .then((result) => {
                const updated = items.map((item, i) => ({
                    ...item,
                    [field]: result[i]?.text || item[field],
                }));
                setProcessed(updated);
            })
            .catch((err) => {
                console.error("❌ [PRETTIFY] Hook error:", err);
                setProcessed(items);
            })
            .finally(() => setIsProcessing(false));
    }, [itemsKey, field, language]);

    return { processed, isProcessing };
}
