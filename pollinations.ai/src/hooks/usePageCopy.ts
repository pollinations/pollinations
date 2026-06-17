import { useEffect, useState } from "react";
import { processCopy } from "../copy/translation/process";
import { getBrowserLanguage } from "../utils";

/**
 * Hook to translate a page's copy based on current language
 * Each page calls this with its static copy object
 *
 * @param staticCopy - The page's static copy object
 * @param noTranslate - Optional set of copy keys to skip translation (pass-through as-is)
 * @returns { copy, isTranslating }
 */
export function usePageCopy<T extends Record<string, unknown>>(
    staticCopy: T,
    noTranslate?: Set<string>,
): { copy: T; isTranslating: boolean } {
    const language = getBrowserLanguage();
    const [translatedCopy, setTranslatedCopy] = useState<T>(staticCopy);
    const [isTranslating, setIsTranslating] = useState(false);

    useEffect(() => {
        // If English, use original
        if (language === "en") {
            setTranslatedCopy(staticCopy);
            return;
        }

        // Extract flat strings only, skipping no-translate keys
        // (arrays handled by useTranslate in components)
        const items = Object.entries(staticCopy)
            .filter(
                ([key, v]) => typeof v === "string" && !noTranslate?.has(key),
            )
            .map(([id, text]) => ({ id, text: text as string }));

        if (items.length === 0) {
            setTranslatedCopy(staticCopy);
            return;
        }

        setIsTranslating(true);

        processCopy(items, language)
            .then((translated) => {
                // Rebuild copy with translated strings
                const result = { ...staticCopy };
                for (const { id, text } of translated) {
                    (result as Record<string, unknown>)[id] = text;
                }
                setTranslatedCopy(result as T);
            })
            .catch(console.error)
            .finally(() => setIsTranslating(false));
    }, [language, staticCopy, noTranslate]);

    return { copy: translatedCopy, isTranslating };
}
