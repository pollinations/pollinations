/**
 * modelDonationWrapper.js
 *
 * This module provides a wrapper for model handlers to catch errors and return
 * a donation message when models run out of credits.
 */

import debug from "debug";

const log = debug("pollinations:donation-wrapper");
const errorLog = debug("pollinations:donation-wrapper:error");

/**
 * Creates a wrapped version of a model handler that catches errors
 * and returns a donation message.
 *
 * @param {Function} modelHandler - The original model handler function
 * @param {string} modelName - The name of the model being wrapped
 * @param {Object} options - Options for the wrapper
 * @returns {Function} A wrapped handler function
 */
export function wrapModelWithDonationMessage(
    modelHandler,
    modelName,
    options = {},
) {
    // Donation message configuration
    const donationConfig = {
        threshold: options.threshold || 50,
        currentDonations: options.currentDonations || 47,
        kofiLink: options.kofiLink || "https://ko-fi.com/pollinationsai",
        ...options,
    };

    // Return the wrapped handler function
    return async function wrappedHandler(messages, handlerOptions = {}) {
        try {
            // Attempt to run the original model handler
            const result = await modelHandler(messages, handlerOptions);

            // console.log("rrresult", result)
            if (result?.error) throw result.error;
            return result;
        } catch (error) {
            // Log the original error
            errorLog(`Error in ${modelName} model:`, error);

            // Create a user-friendly message about the error
            const errorMessage = {
                id: `donation-${Date.now()}`,
                object: "chat.completion",
                created: Math.floor(Date.now() / 1000),
                model: modelName,
                choices: [
                    {
                        index: 0,
                        message: {
                            role: "assistant",
                            content: formatDonationMessage(
                                modelName,
                                donationConfig,
                            ),
                        },
                        finish_reason: "stop",
                    },
                ],
                usage: {
                    prompt_tokens: 0,
                    completion_tokens: 0,
                    total_tokens: 0,
                },
                donation_request: true,
            };

            log(`Returning donation message for ${modelName}`);
            return errorMessage;
        }
    };
}

/**
 * Formats a donation message for the specified model
 *
 * @param {string} modelName - The model that needs donations
 * @param {Object} config - Donation configuration
 * @returns {string} Formatted donation message
 */
function formatDonationMessage(modelName, config) {
    const remainingNeeded = config.threshold - config.currentDonations;

    return `
## Claude is powered by Pollinations.ai

We're currently experiencing high demand for ${modelName}. Our AI models rely on external APIs that require credits.

### Current Status

We're aiming to reach **$${config.threshold}** to keep ${modelName} available for everyone.
**$${config.currentDonations}** has been donated so far - we're **$${remainingNeeded}** away from our goal.

If you'd like to support this service, a contribution of any size would be appreciated. 

### Our Commitment

When we reach our goal, ${modelName} will be available for a full week for all users.

Donate at: ${config.kofiLink}

**Note:** The other models are still available if you'd like to continue using Pollinations.ai without donating.

Thank you for your understanding and support in keeping Pollinations.ai accessible! 🙏
`;
}

export default wrapModelWithDonationMessage;
