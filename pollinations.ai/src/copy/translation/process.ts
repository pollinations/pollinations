/**
 * Copy Processing Service
 * Handles translation and creative rephrasing of copy content
 *
 * Modes:
 * - translate: true → literal translation only
 * - transform: true → creative rephrasing with variation
 */

import { generateText } from "../../services/pollinationsAPI";
import { COPY_GUIDELINES } from "./guidelines";

interface CopyItem {
    id: string;
    text: string;
    mode: "translate" | "transform";
}

/**
 * Extract all processable text from copy object
 *
 * Supported formats:
 * - String: "text" → translate mode (default)
 * - Object with transform: { text: "...", transform: true } → transform mode
 * - Object with translate (legacy): { text: "...", translate: true } → translate mode
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
        // Handle direct strings - these are translate items
        if (typeof obj === "string" && parent && parentKey) {
            const id = path.join(".");
            items.push({ id, text: obj, mode: "translate" });
            pointers[id] = (newText: string) => {
                parent[parentKey] = newText;
            };
            return;
        }

        if (!obj || typeof obj !== "object") return;

        const node = obj as Record<string, unknown>;

        // Check for object with text property (transform or legacy translate)
        if (typeof node.text === "string") {
            const mode = node.transform === true ? "transform" : "translate";
            const id = path.join(".");
            items.push({ id, text: node.text, mode });
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
 * Process copy items - handles both translation and transformation
 *
 * @param items - Copy items to process
 * @param targetLanguage - Target language code (e.g., "en", "zh", "es")
 */
export async function processCopy(
    items: CopyItem[],
    targetLanguage: string,
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

INPUT JSON:
${JSON.stringify(items, null, 2)}

Process all items now:`;

    console.log(
        `📝 [COPY] Processing ${items.length} items (${translateCount} translate, ${transformCount} transform) → ${targetLanguage}`,
    );

    const response = await generateText(prompt);

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
