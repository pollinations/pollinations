import type { IncomingHttpHeaders } from "node:http";
import debug from "debug";

const logger = debug("pollinations:badDomain");
const memoizedResults = new Map();

/**
 * Extracts referrer from headers
 * @param {object} headers - HTTP headers to extract referrer from
 * @param {string|null} explicitReferrer - Optional explicitly provided referrer
 * @returns {string|null} - Extracted referrer
 */
function getRefererFromHeaders(
    headers: IncomingHttpHeaders,
    explicitReferrer: string | null = null,
): string | null {
    if (explicitReferrer) {
        logger(`Using explicitly provided referrer: ${explicitReferrer}`);
        return explicitReferrer;
    }

    logger(`Headers received: ${JSON.stringify(headers)}`);

    const referrer = headers?.referer || headers?.referrer || headers?.origin;

    logger(`Detected referrer from headers: ${referrer || "none"}`);

    // the type is thrown off by referrer, which is not a valid header
    // maybe we can remove this check?
    return (referrer as string) || null;
}

/**
 * Checks if a domain is in the bad domains list
 * @param {string} referrer - The referrer domain to check
 * @returns {boolean} - Whether the domain is in the bad domains list
 */
export function isBadDomain(referrer: string): boolean {
    if (!referrer) return false;

    const badDomains = process.env.BAD_DOMAINS
        ? process.env.BAD_DOMAINS.split(",")
        : [];
    if (badDomains.length === 0) return false;

    // Get lowercased referrer for case-insensitive comparison
    const lowerReferrer = referrer.toLowerCase();
    logger(`Checking referrer: ${lowerReferrer} against bad domains list`);

    // Check if any bad domain is a substring of the referrer
    return badDomains.some((badDomain) => {
        const trimmedBadDomain = badDomain.trim().toLowerCase();
        const isMatch = lowerReferrer.includes(trimmedBadDomain);
        if (isMatch) {
            logger(
                `Found bad domain match: ${trimmedBadDomain} in ${lowerReferrer}`,
            );
        }
        return isMatch;
    });
}

/**
 * Transforms a prompt into its semantic opposite using text.pollinations.ai
 * @param {string} prompt - The original prompt to transform
 * @returns {Promise<string>} - The transformed prompt
 */
export async function transformToOpposite(prompt: string): Promise<string> {
    try {
        const systemPrompt = [
            `Transform the following image prompt into its semantic opposite,`,
            `inverting key attributes like age, gender, clothing status, and subject matter.`,
            `Focus on the opposites that make the result most exaggerated and funny.`,
            `Return ONLY the transformed prompt, with no additional explanation or commentary.`,
        ].join(" ");

        // Encode both the system prompt and user prompt for URL
        const encodedSystemPrompt = encodeURIComponent(systemPrompt);
        const encodedPrompt = encodeURIComponent(prompt);

        // Call text.pollinations.ai with a simple GET request
        const url = [
            `https://text.pollinations.ai/${encodedPrompt}`,
            `?system=${encodedSystemPrompt}&referrer=https://image.pollinations.ai`,
        ].join("");

        logger(`Transforming prompt to opposite: ${prompt}`);

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(
                `Text transformation failed with status: ${response.status}`,
            );
        }

        const transformedPrompt = await response.text();
        logger(`Transformed prompt: ${transformedPrompt}`);

        return transformedPrompt.trim();
    } catch (error) {
        logger(`Error transforming prompt: ${error.message}`);
        // In case of error, return the original prompt with "not" prepended
        return `not ${prompt}`;
    }
}

/**
 * Utility to extract domain from a URL
 * @param {string} url - The URL to extract the domain from
 * @returns {string} - The extracted domain
 */
export function extractDomain(url: string): string {
    try {
        // Handle URLs that don't start with a protocol
        const fullUrl = url.startsWith("http") ? url : `https://${url}`;
        const domain = new URL(fullUrl).hostname;
        return domain.toLowerCase();
    } catch (error) {
        logger(`Error extracting domain from ${url}: ${error.message}`);
        return url.toLowerCase(); // Return original string if not a valid URL
    }
}

type ProcessPromtResult = {
    prompt: string;
    originalPrompt: string;
    wasTransformed: boolean;
    referrer: string | null;
};

/**
 * Processes a prompt based on referrer information
 * @param {string} prompt - Original prompt to process
 * @param {object} headers - HTTP headers to extract referrer from
 * @param {string|null} explicitReferrer - Optional explicitly provided referrer
 * @param {number} transformProbability - Probability (0.0-1.0) to transform bad domain prompts
 * @returns {Promise<ProcessPromtResult>} - Result object with processed prompt and metadata
 */
export async function processPrompt(
    prompt: string,
    headers: IncomingHttpHeaders = {},
    explicitReferrer: string | null = null,
    transformProbability: number = 0.6,
): Promise<ProcessPromtResult> {
    // Extract referrer
    const referrer = getRefererFromHeaders(headers, explicitReferrer);

    // Generate a memoization key
    const memoKey = `${prompt}_referrer_${referrer || "none"}`;

    // Return cached result if available
    if (memoizedResults.has(memoKey)) {
        return memoizedResults.get(memoKey);
    }

    // Default result - no transformation
    const result = {
        prompt: prompt, // Processed prompt (might be transformed)
        originalPrompt: prompt, // Always the original input
        wasTransformed: false, // Flag indicating if transformation occurred
        referrer: referrer || "none", // The referrer that was used for checking
    };

    // Check if referrer is from a bad domain
    if (referrer && isBadDomain(referrer)) {
        // Randomly decide whether to transform based on probability
        const shouldTransform = Math.random() < transformProbability;
        logger(
            `Bad domain detected: ${referrer}, transform decision: ${shouldTransform ? "TRANSFORM" : "KEEP ORIGINAL"}`,
        );

        if (shouldTransform) {
            try {
                // Transform the prompt
                const transformedPrompt = await transformToOpposite(prompt);

                // Update result with transformed prompt
                result.prompt = transformedPrompt;
                result.wasTransformed = true;

                logger(
                    `Transformed prompt for bad domain: ${transformedPrompt}`,
                );
            } catch (error) {
                logger(`Error transforming prompt: ${error.message}`);
                // On error, continue with original prompt
            }
        } else {
            logger(
                `Skipping transformation for bad domain due to random decision`,
            );
        }
    } else {
        logger(`No bad domain detected for referrer: ${referrer || "none"}`);
    }

    // Cache and return the result
    memoizedResults.set(memoKey, result);
    return result;
}

// Export all functions as a single object for easier imports
export const badDomainHandler = {
    processPrompt,
    isBadDomain,
    transformToOpposite,
    extractDomain,
};
