/**
 * Copy Processing Service
 * Handles translation and creative rephrasing of copy content
 *
 * Modes:
 * - translate: true → literal translation only
 * - transform: true → creative rephrasing with variation
 */

import { generateText } from "../../services/pollinationsAPI";
import { COPY_CONFIG } from "../config";
import { COPY_GUIDELINES } from "./guidelines";

interface CopyItem {
    id: string;
    text: string;
    mode: "translate" | "transform";
}

/**
 * Get a random variation seed (1 to maxSeed)
 */
export function getVariationSeed(): number {
    return Math.floor(Math.random() * COPY_CONFIG.maxSeed) + 1;
}

/**
 * Extract all processable text from copy object
 * Finds items with translate: true OR transform: true
 */
export function extractCopyItems(root: Record<string, unknown>): {
    items: CopyItem[];
    pointers: Record<string, (newText: string) => void>;
} {
    const items: CopyItem[] = [];
    const pointers: Record<string, (newText: string) => void> = {};

    function traverse(obj: unknown, path: string[]) {
        if (!obj || typeof obj !== "object") return;

        const node = obj as Record<string, unknown>;

        // Check for translate or transform flag
        if (typeof node.text === "string") {
            const mode =
                node.transform === true
                    ? "transform"
                    : node.translate === true
                      ? "translate"
                      : null;

            if (mode) {
                const id = path.join(".");
                items.push({ id, text: node.text, mode });
                pointers[id] = (newText: string) => {
                    node.text = newText;
                };
            }
        }

        // Recursively check children
        for (const key of Object.keys(node)) {
            if (key !== "translate" && key !== "transform" && key !== "text") {
                traverse(node[key], [...path, key]);
            }
        }
    }

    traverse(root, []);
    return { items, pointers };
}

// Legacy alias for backwards compatibility
export const extractTranslatableText = extractCopyItems;

/**
 * Process copy items - handles both translation and transformation
 *
 * @param items - Copy items to process
 * @param targetLanguage - Target language code (e.g., "en", "zh", "es")
 * @param variationSeed - Seed 1-5 for transform variation (affects caching)
 * @param signal - Optional abort signal
 */
export async function processCopy(
    items: CopyItem[],
    targetLanguage: string,
    variationSeed: number = 1,
    signal?: AbortSignal,
): Promise<CopyItem[]> {
    if (items.length === 0) {
        return items;
    }

    // Count items by mode for logging
    const translateCount = items.filter((i) => i.mode === "translate").length;
    const transformCount = items.filter((i) => i.mode === "transform").length;

    // Skip processing if English and no transform items (nothing to do)
    if (targetLanguage === "en" && transformCount === 0) {
        return items;
    }

    // Single unified prompt for all items
    const prompt = `${COPY_GUIDELINES}

TARGET_LANGUAGE: "${targetLanguage}"
VARIATION_SEED: ${variationSeed}

INPUT JSON:
${JSON.stringify(items, null, 2)}

Process all items now:`;

    console.log(
        `📝 [COPY] Processing ${items.length} items (${translateCount} translate, ${transformCount} transform) → ${targetLanguage}, seed ${variationSeed}`,
    );

    const response = await generateText(
        prompt,
        variationSeed,
        COPY_CONFIG.model,
        signal,
    );

    const result = parseJsonResponse(response, items);
    console.log(`✅ [COPY] Done`);

    return result;
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

// Legacy alias
export const translateCopy = processCopy;

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
