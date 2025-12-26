import { useEffect, useState } from "react";
import { processCopy } from "../copy";
import { useCopy } from "../ui/contexts/CopyContext";

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
    const { language } = useCopy();
    const [translated, setTranslated] = useState<T[]>(items);
    const [isTranslating, setIsTranslating] = useState(false);

    useEffect(() => {
        if (items.length === 0) {
            setTranslated([]);
            return;
        }

        // If English, use original
        if (language === "en") {
            setTranslated(items);
            return;
        }

        setIsTranslating(true);

        const copyItems = items.map((item, i) => ({
            id: `item-${i}`,
            text: String(item[field] ?? ""),
            mode: "translate" as const,
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
    }, [items, field, language]);

    return { translated, isTranslating };
}
