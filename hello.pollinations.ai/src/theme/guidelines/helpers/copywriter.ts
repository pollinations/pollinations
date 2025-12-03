/**
 * Writing Helper Functions for GEN COPY Pipeline
 * Combines prompt assembly + API calls for copy generation
 */

import { assembleCopyPrompt } from "../../buildPrompts";
import { generateText } from "../../../services/pollinationsAPI";
import { ALL_COPY } from "../../copy/index";

const MODEL = "gemini-large";

// ==============================================
// TYPE DEFINITIONS
// ==============================================

export interface PageCopy {
    [key: string]: {
        text: string;
        transforms?: string[];
    };
}

export type ThemeCopy = Record<string, any>;

// ==============================================
// COPY GENERATION HELPER
// ==============================================

/**
 * GEN COPY Pipeline
 * Generates all site copy based on theme and context
 * Uses ETL (Extract-Transform-Load) pattern for performance
 */
export async function generateCopy(
    themeVibe: string,
    isMobile: boolean,
    pageCopyObjects: ThemeCopy,
    targetLanguage = "en",
    signal?: AbortSignal,
): Promise<{ full: ThemeCopy; flat: Record<string, string> }> {
    // Deep clone to safely modify
    const contentToTransform = JSON.parse(JSON.stringify(pageCopyObjects));

    // 2. Extract Jobs (ETL Step 1)
    const { jobs, pointers } = extractCopyJobs(contentToTransform, isMobile);

    if (jobs.length === 0) {
        return {
            full: contentToTransform,
            flat: {},
        };
    }

    // 3. Transform (ETL Step 2 - API Call)
    const fullPrompt = assembleCopyPrompt(themeVibe, jobs, targetLanguage);

    console.log(`📝 [COPYWRITER] → Rewriting ${jobs.length} text items...`);

    try {
        const response = await generateText(fullPrompt, 42, MODEL, signal);

        // 4. Load (ETL Step 3 - Re-hydration)
        let newTexts: Record<string, string> = {};

        // Parse JSON object from response
        const jsonMatch = response.match(/\[[\s\S]*\]/); // Match Array now
        if (jsonMatch) {
            const responseArray = JSON.parse(jsonMatch[0]);
            if (Array.isArray(responseArray)) {
                responseArray.forEach((item: any) => {
                    if (item.id && item.text) {
                        newTexts[item.id] = item.text;
                    }
                });
            }
        } else {
            // Fallback: Try matching object if LLM ignored instructions and returned map
            const objectMatch = response.match(/\{[\s\S]*\}/);
            if (objectMatch) {
                const obj = JSON.parse(objectMatch[0]);
                // Check if it's a map or the jobs object wrapped
                if (obj.jobs && Array.isArray(obj.jobs)) {
                    obj.jobs.forEach((item: any) => {
                        if (item.id && item.text) {
                            newTexts[item.id] = item.text;
                        }
                    });
                } else {
                    // Assume map
                    newTexts = obj;
                }
            } else {
                throw new Error("No JSON Array or Object found in response");
            }
        }

        // Update nodes based on IDs
        let updatedCount = 0;
        Object.entries(newTexts).forEach(([id, text]) => {
            if (pointers[id]) {
                pointers[id](text as string);
                updatedCount++;
            }
        });

        console.log(`📝 [COPYWRITER] ← ${updatedCount} items rewritten`);

        return {
            full: contentToTransform,
            flat: newTexts,
        };
    } catch (error) {
        console.error(`Error generating copy:`, error);
        // Fallback: Return original structure and empty flat object
        return {
            full: pageCopyObjects,
            flat: {},
        };
    }
}

/**
 * Hydrates a flat copy object (ID -> Text) into the full ThemeCopy structure
 */
export function hydrateCopy(flatCopy: Record<string, string>): ThemeCopy {
    // 1. Clone the base structure (ALL_COPY)
    // We need to import ALL_COPY dynamically or pass it in to avoid circular deps if possible
    // But since this is a helper, we can import it.
    // However, to be safe and clean, we'll re-import it here or assume it's available.
    // For now, let's use the same extraction logic to find pointers on a fresh clone of ALL_COPY.

    // We need to import ALL_COPY. Since we can't easily change imports in this replace block without context,
    // let's assume we can import it at the top or use a passed base.
    // Actually, let's use the imported ALL_COPY from index if available, or re-import.
    // To avoid circular dependency issues with `index.ts` importing this file, we might need a different approach.
    // But `index.ts` imports `writing-helpers`? No, `index.ts` exports `ALL_COPY`.
    // `writing-helpers` imports `generateText`.

    // Let's rely on the caller passing the base or just import it.
    // Since `index.ts` aggregates everything, importing it here might be circular if `index.ts` eventually imports something that imports this.
    // But `index.ts` is just data.

    // Let's try importing ALL_COPY inside the function to be safe, or just import at top.
    // For now, I'll add the import at the top in a separate edit if needed, but I can't do it here.
    // Wait, I can just use the `extractCopyJobs` on a fresh clone of `ALL_COPY`.

    // I will add the import in a separate step.

    const contentToTransform = JSON.parse(JSON.stringify(ALL_COPY));
    const { pointers } = extractCopyJobs(contentToTransform, false); // Mobile doesn't matter for hydration

    Object.entries(flatCopy).forEach(([id, text]) => {
        if (pointers[id]) {
            pointers[id](text);
        }
    });

    return contentToTransform;
}

/**
 * Helper to extract text nodes and create update pointers
 */
export function extractCopyJobs(root: unknown, isMobile: boolean) {
    const jobs: { id: string; text: string; limit: number }[] = [];
    const pointers: Record<string, (newText: string) => void> = {};

    function traverse(obj: unknown, path: string[]) {
        if (!obj || typeof obj !== "object") return;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const node = obj as any;

        // Check if this is a text node with transform: true
        if (node.text && node.transform === true) {
            const id = path.join(".");
            const text = node.text as string;

            // Calculate word count from source text
            const wordCount = text.trim().split(/\s+/).length;
            let limit = wordCount;

            // Apply mobile reduction if needed (only for longer texts)
            if (isMobile && wordCount > 5) {
                limit = Math.max(5, Math.floor(wordCount * 0.6));
            }

            jobs.push({
                id,
                text,
                limit,
            });

            // Save closure to update this specific node
            pointers[id] = (newText: string) => {
                node.text = newText;
            };
        }

        // Recursively check children
        Object.keys(node).forEach((key) => {
            // Skip 'transform' boolean and 'text' string
            if (key !== "transform" && key !== "text") {
                traverse(node[key], [...path, key]);
            }
        });
    }

    traverse(root, []);
    return { jobs, pointers };
}
