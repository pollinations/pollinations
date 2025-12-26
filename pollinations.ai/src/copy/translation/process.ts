/**
 * Copy Processing Service
 * Handles translation of copy content with natural, idiomatic rephrasing
 */

import { generateText } from "../../services/pollinationsAPI";
import { COPY_GUIDELINES } from "./guidelines";

interface CopyItem {
    id: string;
    text: string;
}

/**
 * Wraps an async function to deduplicate concurrent calls with the same key.
 * While a promise is pending, subsequent calls with the same key return the same promise.
 */
function memoizeAsync<T, Args extends unknown[]>(
    fn: (...args: Args) => Promise<T>,
    keyFn: (...args: Args) => string,
): (...args: Args) => Promise<T> {
    const pending = new Map<string, Promise<T>>();
    return (...args: Args) => {
        const key = keyFn(...args);
        const existing = pending.get(key);
        if (existing) return existing;

        const promise = fn(...args).finally(() => pending.delete(key));
        pending.set(key, promise);
        return promise;
    };
}

/**
 * Extract all processable text from copy object
 * All strings are extracted for translation
 */
export function extractCopyItems(root: Record<string, unknown>): {
    items: CopyItem[];
    pointers: Record<string, (newText: string) => void>;
} {
    const items: CopyItem[] = [];
    const pointers: Record<string, (newText: string) => void> = {};

    function traverse(
        obj: unknown,
        path: string[],
        parent?: Record<string, unknown>,
        parentKey?: string,
    ) {
        // Handle direct strings
        if (typeof obj === "string" && parent && parentKey) {
            const id = path.join(".");
            items.push({ id, text: obj });
            pointers[id] = (newText: string) => {
                parent[parentKey] = newText;
            };
            return;
        }

        if (!obj || typeof obj !== "object") return;

        const node = obj as Record<string, unknown>;

        // Check for object with text property (legacy format)
        if (typeof node.text === "string") {
            const id = path.join(".");
            items.push({ id, text: node.text });
            pointers[id] = (newText: string) => {
                node.text = newText;
            };
            return; // Don't traverse into text objects
        }

        // Recursively check children
        for (const key of Object.keys(node)) {
            traverse(node[key], [...path, key], node, key);
        }
    }

    traverse(root, []);
    return { items, pointers };
}

/**
 * Process copy items - translates with natural, idiomatic rephrasing
 */
async function translateCopy(
    items: CopyItem[],
    targetLanguage: string,
): Promise<CopyItem[]> {
    const prompt = `${COPY_GUIDELINES}

TARGET_LANGUAGE: "${targetLanguage}"

INPUT JSON:
${JSON.stringify(items, null, 2)}

Process all items now:`;

    console.log(
        `📝 [COPY] Processing ${items.length} items → ${targetLanguage}`,
    );

    const response = await generateText(prompt);
    const result = parseJsonResponse(response, items);
    console.log(`✅ [COPY] Done`);

    return result;
}

// Memoized version - deduplicates concurrent identical requests
const memoizedTranslate = memoizeAsync(
    translateCopy,
    (items, lang) => `${lang}:${items.map((i) => i.id).join(",")}`,
);

/**
 * Process copy items - translates with natural, idiomatic rephrasing
 * Deduplicates concurrent identical requests automatically
 */
export async function processCopy(
    items: CopyItem[],
    targetLanguage: string,
): Promise<CopyItem[]> {
    if (items.length === 0 || targetLanguage === "en") {
        return items;
    }
    return memoizedTranslate(items, targetLanguage);
}

/**
 * Parse JSON array from LLM response
 */
function parseJsonResponse(response: string, fallback: CopyItem[]): CopyItem[] {
    try {
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            throw new Error("No JSON array found in response");
        }
        return JSON.parse(jsonMatch[0]) as CopyItem[];
    } catch (err) {
        console.error("❌ [COPY] Failed to parse response:", err);
        return fallback;
    }
}

/**
 * Apply translated items back to copy object
 */
export function applyTranslations(
    translatedItems: CopyItem[],
    pointers: Record<string, (newText: string) => void>,
): void {
    for (const item of translatedItems) {
        const pointer = pointers[item.id];
        if (pointer) {
            pointer(item.text);
        }
    }
}
