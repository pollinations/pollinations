import { useEffect, useState } from "react";
import { processCopy } from "../copy";
import { useCopy } from "../ui/contexts/CopyContext";

/**
 * Hook to translate an array of items
 *
 * @param items - Array of items to translate
 * @param getText - Function to extract text from an item
 * @param setText - Function to create a new item with translated text
 */
export function useTranslate<T>(
    items: T[],
    getText: (item: T) => string,
    setText: (item: T, text: string) => T,
): { translated: T[]; isTranslating: boolean } {
    const { language, variationSeed } = useCopy();
    const [translated, setTranslated] = useState<T[]>(items);
    const [isTranslating, setIsTranslating] = useState(false);

    // biome-ignore lint/correctness/useExhaustiveDependencies: getText/setText are stable by design (same field accessor each render)
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
            text: getText(item),
            mode: "translate" as const,
        }));

        processCopy(copyItems, language, variationSeed)
            .then((processed) => {
                const result = items.map((item, i) =>
                    setText(item, processed[i]?.text || getText(item)),
                );
                setTranslated(result);
            })
            .catch(() => setTranslated(items))
            .finally(() => setIsTranslating(false));
    }, [items, language, variationSeed]);

    return { translated, isTranslating };
}
