import type { IncomingMessage } from "node:http";
import debug from "debug";
import type { ImageParams } from "./params.ts";
import { pimpPrompt } from "./promptEnhancer.ts";
import { detectLanguage, sanitizeString } from "./translateIfNecessary.ts";

const logPrompt = debug("pollinations:prompt");
const logPerf = debug("pollinations:perf");
const logError = debug("pollinations:error");
const memoizedPrompts = new Map();

export type TimingStep = { step: string; timestamp: number };

export const normalizeAndTranslatePrompt = async (
    originalPrompt: string,
    req: IncomingMessage,
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

    // check from the request headers if the user most likely speaks english (value starts with en)
    const englishLikely = req.headers["accept-language"]?.startsWith("en");

    if (!englishLikely) {
        const startTime = Date.now();
        try {
            const detectedLanguage = await detectLanguage(prompt);
            if (detectedLanguage !== "en") {
                enhance = true;
            }
        } catch (error) {
            logError(error);
            enhance = true;
        }
        const endTime = Date.now();
        logPerf(`Translation time: ${endTime - startTime}ms`);
    }

    if (enhance) {
        logPrompt("pimping prompt", prompt, seed);
        prompt = await pimpPrompt(prompt, seed);
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
