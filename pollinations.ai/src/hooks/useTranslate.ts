import { useEffect, useMemo, useRef, useState } from "react";
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

    // Stable serialized key — only changes when item content changes
    const itemsKey = useMemo(() => JSON.stringify(items), [items]);
    const prevKeyRef = useRef<string | null>(null);

    useEffect(() => {
        if (prevKeyRef.current === itemsKey) return;
        prevKeyRef.current = itemsKey;

        // Show originals immediately
        setTranslated(items);

        if (items.length === 0 || language === "en") return;

        let aborted = false;
        setIsTranslating(true);

        const copyItems = items.map((item, i) => ({
            id: `item-${i}`,
            text: String(item[field] ?? ""),
        }));

        processCopy(copyItems, language)
            .then((processed) => {
                if (aborted) return;
                const result = items.map((item, i) => ({
                    ...item,
                    [field]: processed[i]?.text || item[field],
                }));
                setTranslated(result);
            })
            .catch(() => {
                if (!aborted) setTranslated(items);
            })
            .finally(() => {
                if (!aborted) setIsTranslating(false);
            });

        return () => {
            aborted = true;
        };
    }, [items, itemsKey, field, language]);

    return { translated, isTranslating };
}
