/**
 * Language utilities for translation
 */

/**
 * Get browser language code (e.g., "en", "zh", "es")
 */
export function getBrowserLanguage(): string {
    const lang = navigator.language.split("-")[0];
    return lang || "en";
}
