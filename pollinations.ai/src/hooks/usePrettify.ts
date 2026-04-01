import { useEffect, useMemo, useState } from "react";
import { prettifyCopy } from "../copy/translation/prettify";

/** Feature flag — flip to false to disable prettification globally */
const PRETTIFY_ENABLED = true;

/**
 * Hook to prettify a string field on an array of items via Pollinations API.
 * Unlike useTranslate, this always runs (not gated on language).
 * Pass apiKey to use the logged-in user's key instead of the default.
 */
export function usePrettify<T, K extends keyof T>(
    items: T[],
    field: K,
    apiKey?: string,
    nameField?: keyof T,
    emojiField?: keyof T,
): { prettified: T[]; isPrettifying: boolean } {
    const [prettified, setPrettified] = useState<T[]>(items);
    const [isPrettifying, setIsPrettifying] = useState(false);

    const itemsKey = useMemo(() => JSON.stringify(items), [items]);

    // Keep in sync when items change
    // biome-ignore lint/correctness/useExhaustiveDependencies: itemsKey is a stable serialization of items to avoid infinite re-renders
    useEffect(() => {
        setPrettified(items);
    }, [itemsKey]);

    // biome-ignore lint/correctness/useExhaustiveDependencies: itemsKey is a stable serialization of items to avoid infinite re-renders
    useEffect(() => {
        if (!PRETTIFY_ENABLED || items.length === 0) return;

        let aborted = false;
        setIsPrettifying(true);

        const copyItems = items.map((item, i) => ({
            id: `item-${i}`,
            text: String(item[field] ?? ""),
            name: nameField ? String(item[nameField] ?? "") : undefined,
            titleEmoji: emojiField ? String(item[emojiField] ?? "") : undefined,
        }));

        // Calls are fired without await — they enter fetchWithRetry's serial queue
        // and execute one at a time. UI updates progressively as each resolves.
        let completed = 0;
        const results = [...items];
        for (const copyItem of copyItems) {
            const idx = copyItems.indexOf(copyItem);
            prettifyCopy([copyItem], apiKey)
                .then(([processed]) => {
                    if (aborted) return;
                    if (processed?.text) {
                        results[idx] = {
                            ...items[idx],
                            [field]: processed.text,
                        } as T;
                        setPrettified([...results]);
                    }
                })
                .catch(() => {}) // keep original on failure
                .finally(() => {
                    if (aborted) return;
                    completed++;
                    if (completed === copyItems.length) setIsPrettifying(false);
                });
        }

        return () => {
            aborted = true;
        };
    }, [itemsKey, field, apiKey]);

    return { prettified, isPrettifying };
}
