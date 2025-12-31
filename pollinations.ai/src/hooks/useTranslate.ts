import { useEffect, useMemo, useState } from "react";
import { processCopy } from "../copy/translation/process";
import { getBrowserLanguage } from "../utils";

/**
 * Hook to translate an array of items by field name
 *
 * @param items - Array of items to translate
 * @param field - Name of the string field to translate
 */
export function useTranslate<T, K extends keyof T>(
    items: T[],
    field: K,
): { translated: T[]; isTranslating: boolean } {
    const language = getBrowserLanguage();
    const [translated, setTranslated] = useState<T[]>(items);
    const [isTranslating, setIsTranslating] = useState(false);

    // Stable key for items to avoid re-runs when array reference changes but content is the same
    const _itemsKey = useMemo(() => JSON.stringify(items), [items]);

    // Keep translated in sync with items when items change (show original immediately)
    useEffect(() => {
        setTranslated(items);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items]);

    useEffect(() => {
        if (items.length === 0) {
            return;
        }

        // If English, use original (already set above)
        if (language === "en") {
            return;
        }

        setIsTranslating(true);

        const copyItems = items.map((item, i) => ({
            id: `item-${i}`,
            text: String(item[field] ?? ""),
        }));

        processCopy(copyItems, language)
            .then((processed) => {
                const result = items.map((item, i) => ({
                    ...item,
                    [field]: processed[i]?.text || item[field],
                }));
                setTranslated(result);
            })
            .catch(() => setTranslated(items))
            .finally(() => setIsTranslating(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [field, language, items]);

    return { translated, isTranslating };
}
