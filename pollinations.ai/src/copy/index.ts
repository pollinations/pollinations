/**
 * Copy Module
 * Central export for all copy-related functionality
 */

export { COPY_GUIDELINES } from "./translation/guidelines";
export {
    applyTranslations,
    extractCopyItems,
    processCopy,
} from "./translation/process";

/**
 * Get text from a copy field (handles both string and object formats)
 *
 * Usage:
 *   getText(pageCopy.title) // works for both "Title" and { text: "Title", transform: true }
 */
export function getText(field: string | { text: string } | undefined): string {
    if (typeof field === "string") return field;
    if (field && typeof field.text === "string") return field.text;
    return "";
}
