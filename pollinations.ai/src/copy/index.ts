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
 * Get text from a copy field (handles both string and legacy object formats)
 */
export function getText(field: string | { text: string } | undefined): string {
    if (typeof field === "string") return field;
    if (field && typeof field.text === "string") return field.text;
    return "";
}
