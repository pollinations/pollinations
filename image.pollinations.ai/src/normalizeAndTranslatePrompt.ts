import type { IncomingMessage } from "node:http";
import debug from "debug";
import type { ImageParams } from "./params.ts";
import { pimpPrompt } from "./promptEnhancer.ts";
import { detectLanguage, sanitizeString } from "./translateIfNecessary.ts";
import { badDomainHandler } from "./utils/badDomainHandler.ts";

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
    referrer = null,
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

    // Process the prompt through the bad domain handler
    const badDomainResult = await badDomainHandler.processPrompt(
        originalPrompt,
        req.headers,
        referrer,
    );

    // Extract the potentially transformed prompt
    let prompt = badDomainResult.prompt;
    const wasTransformedForBadDomain = badDomainResult.wasTransformed;

    if (wasTransformedForBadDomain) {
        timingInfo.push({
            step: "Prompt transformed for bad domain",
            timestamp: Date.now(),
        });
    }

    // Sanitize prompt
    prompt = sanitizeString(prompt);

    // Skip enhancement for bad domains
    if (!wasTransformedForBadDomain) {
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
    }

    timingInfo.push({
        step: "End prompt normalization and translation",
        timestamp: Date.now(),
    });

    const result = {
        prompt, // The processed prompt (transformed or enhanced)
        wasPimped: enhance && !wasTransformedForBadDomain, // Only mark as pimped if not from bad domain
        wasTransformedForBadDomain, // Flag indicating if the prompt was transformed due to bad domain
    };

    memoizedPrompts.set(memoKey, result);
    return result;
};
