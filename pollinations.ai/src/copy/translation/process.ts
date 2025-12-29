/**
 * Copy Processing Service
 * Handles translation of copy content with natural, idiomatic rephrasing
 */

import { generateText } from "../../services/pollinationsAPI";
import { memoizeAsync } from "../../utils";
import { COPY_GUIDELINES } from "./guidelines";

interface CopyItem {
    id: string;
    text: string;
}

/**
 * Translate copy items with natural, idiomatic rephrasing
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
