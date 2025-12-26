import { useEffect, useState } from "react";
import { processCopy } from "../copy";
import { useCopy } from "../ui/contexts/CopyContext";

/**
 * Hook to translate an array of items
 *
 * @param items - Array of items to translate
 * @param getText - Function to extract text from an item
 * @param setText - Function to create a new item with translated text
 * @param mode - "translate" for literal, "transform" for creative
 */
export function useTranslate<T>(
    items: T[],
    getText: (item: T) => string,
    setText: (item: T, text: string) => T,
    mode: "translate" | "transform" = "translate",
): { translated: T[]; isTranslating: boolean } {
    const { language, variationSeed } = useCopy();
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
            text: getText(item),
            mode,
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
    }, [items, language, variationSeed, getText, setText, mode]);

    return { translated, isTranslating };
}
