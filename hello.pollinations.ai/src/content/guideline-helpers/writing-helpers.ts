/**
 * Writing Helper Functions for GEN COPY Pipeline
 * Pure logic - copy generation and transformation functions
 */

import { WRITING_GUIDELINES } from "../guidelines-writing";
import { generateText } from "../../services/pollinationsAPI";

// ==============================================
// TYPE DEFINITIONS
// ==============================================

export interface PageCopy {
    [key: string]: {
        text: string;
        transforms?: string[];
    };
}

export interface ThemeCopy {
    HELLO_PAGE: PageCopy;
    APPS_PAGE: PageCopy;
    DOCS_PAGE: PageCopy;
    COMMUNITY_PAGE: PageCopy;
    PLAY_PAGE: PageCopy;
}

// ==============================================
// COPY GENERATION HELPER
// ==============================================

/**
 * GEN COPY Pipeline
 * Generates all site copy based on theme and context
 * Uses ETL (Extract-Transform-Load) pattern for performance
 */
export async function generateThemeCopy(
    themeVibe: string,
    isMobile: boolean,
    pageCopyObjects: {
        HELLO_PAGE: PageCopy;
        APPS_PAGE: PageCopy;
        DOCS_PAGE: PageCopy;
        COMMUNITY_PAGE: PageCopy;
        PLAY_PAGE: PageCopy;
    },
    targetLanguage = "en",
    signal?: AbortSignal
): Promise<ThemeCopy> {
    // Deep clone to safely modify
    const contentToTransform = JSON.parse(JSON.stringify(pageCopyObjects));

    // 2. Extract Jobs (ETL Step 1)
    const { jobs, pointers } = extractCopyJobs(contentToTransform, isMobile);

    if (jobs.length === 0) {
        return contentToTransform as ThemeCopy;
    }

    // 3. Transform (ETL Step 2 - API Call)
    const fullPrompt = `${WRITING_GUIDELINES}

Theme: "${themeVibe}"
Target Language: "${targetLanguage}"

Input Jobs:
${JSON.stringify(jobs)}

Generate the JSON Array of strings now:`;

    console.log(
        `📄 [COPY] Generating ${jobs.length} items (Mobile: ${isMobile})...`,
    );

    try {
        const response = await generateText(
            fullPrompt,
            42,
            "openai-fast",
            signal,
        );

        // 4. Load (ETL Step 3 - Re-hydration)
        let newTexts: string[] = [];

        // Parse JSON array from response
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            newTexts = JSON.parse(jsonMatch[0]);
        } else {
            throw new Error("No JSON Array found in response");
        }

        // Validate length
        if (Array.isArray(newTexts) && newTexts.length === pointers.length) {
            newTexts.forEach((text, index) => {
                pointers[index](text); // Execute the update function
            });
            console.log(
                `✅ [COPY] Successfully updated ${newTexts.length} text nodes`,
            );
        } else {
            console.warn(
                `⚠️ [COPY] Mismatch: Sent ${pointers.length} jobs, received ${newTexts.length} items. Returning original.`,
            );
        }

        return contentToTransform as ThemeCopy;
    } catch (error) {
        console.error(`Error generating copy:`, error);
        // Fallback: Return original structure (cast as ThemeCopy)
        return pageCopyObjects as unknown as ThemeCopy;
    }
}

/**
 * Helper to extract text nodes and create update pointers
 */
function extractCopyJobs(root: unknown, isMobile: boolean) {
    const jobs: { text: string; limit: number }[] = [];
    const pointers: ((newText: string) => void)[] = [];

    function traverse(obj: unknown) {
        if (!obj || typeof obj !== "object") return;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const node = obj as any;

        // Check if this is a text node with transforms
        if (node.text && Array.isArray(node.transforms)) {
            const transforms = node.transforms as string[];

            // Extract word limit from brevity tag
            const brevityTag = transforms.find((t) => t.startsWith("brevity:"));
            let limit = brevityTag
                ? parseInt(brevityTag.split(":")[1], 10)
                : 50;

            // Apply mobile reduction if needed
            if (isMobile && limit > 0) {
                limit = Math.max(3, Math.floor(limit * 0.6));
            }

            jobs.push({
                text: node.text,
                limit: limit,
            });

            // Save closure to update this specific node
            pointers.push((newText: string) => {
                node.text = newText;
            });
        }

        // Recursively check children
        Object.keys(node).forEach((key) => {
            // Skip 'transforms' array itself and 'text' string
            if (key !== "transforms" && key !== "text") {
                traverse(node[key]);
            }
        });
    }

    traverse(root);
    return { jobs, pointers };
}
