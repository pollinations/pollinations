import debug from "debug";
import type { ImageParams } from "./params.ts";
import { pimpPrompt } from "./promptEnhancer.ts";
import { sanitizeString } from "./translateIfNecessary.ts";

const logPrompt = debug("pollinations:prompt");
const memoizedPrompts = new Map();

export type TimingStep = { step: string; timestamp: number };
export type MinimalRequest = {
    headers: Record<string, string | string[] | undefined>;
    url: string;
};

export const normalizeAndTranslatePrompt = async (
    originalPrompt: string,
    req: MinimalRequest,
    timingInfo: TimingStep[],
    safeParams: ImageParams,
) => {
    // if it is not a string make it a string
    originalPrompt = `${originalPrompt}`;

    let { enhance, seed } = safeParams;

    // Generate a memoization key that includes the seed
    const memoKey = `${originalPrompt}_seed_${seed}`;

    if (memoizedPrompts.has(memoKey)) {
        return memoizedPrompts.get(memoKey);
    }

    logPrompt("promptRaw", originalPrompt);
    timingInfo.push({
        step: "Start prompt normalization and translation",
        timestamp: Date.now(),
    });

    let prompt = originalPrompt;

    // Sanitize prompt
    prompt = sanitizeString(prompt);

    // If the user's accept-language isn't English, assume the prompt may need
    // translation/enhancement. The prompt enhancer (LLM) handles this — there
    // is no separate translation service.
    const acceptLanguage = req.headers["accept-language"];
    const englishLikely =
        typeof acceptLanguage === "string" && acceptLanguage.startsWith("en");
    if (!englishLikely) enhance = true;

    if (enhance) {
        logPrompt("pimping prompt", prompt, seed);
        prompt = (await pimpPrompt(prompt, seed)) || prompt;
        logPrompt(`Pimped prompt: ${prompt}`);
    }

    timingInfo.push({
        step: "End prompt normalization and translation",
        timestamp: Date.now(),
    });

    const result = {
        prompt, // The processed prompt
        wasPimped: enhance,
    };

    memoizedPrompts.set(memoKey, result);
    return result;
};
