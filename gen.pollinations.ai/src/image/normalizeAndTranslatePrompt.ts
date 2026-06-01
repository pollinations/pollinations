import debug from "debug";
import type { ImageParams } from "./params.ts";
import { sanitizeString } from "./translateIfNecessary.ts";

const logPrompt = debug("pollinations:prompt");
const memoizedPrompts = new Map();

export const normalizeAndTranslatePrompt = async (
    originalPrompt: string,
    safeParams: ImageParams,
) => {
    // if it is not a string make it a string
    originalPrompt = `${originalPrompt}`;

    const { seed } = safeParams;

    // Generate a memoization key that includes the seed
    const memoKey = `${originalPrompt}_seed_${seed}`;

    if (memoizedPrompts.has(memoKey)) {
        return memoizedPrompts.get(memoKey);
    }

    logPrompt("promptRaw", originalPrompt);

    // Sanitize prompt
    const prompt = sanitizeString(originalPrompt);

    const result = {
        prompt, // The processed prompt
    };

    memoizedPrompts.set(memoKey, result);
    return result;
};
