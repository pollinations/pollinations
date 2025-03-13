/**
 * modelDonationWrapper.js
 * 
 * This module provides a wrapper for model handlers to catch errors and return 
 * a donation message when models run out of credits.
 */

import debug from 'debug';

const log = debug('pollinations:donation-wrapper');
const errorLog = debug('pollinations:donation-wrapper:error');

/**
 * Creates a wrapped version of a model handler that catches errors
 * and returns a donation message.
 * 
 * @param {Function} modelHandler - The original model handler function
 * @param {string} modelName - The name of the model being wrapped
 * @param {Object} options - Options for the wrapper
 * @returns {Function} A wrapped handler function
 */
export function wrapModelWithDonationMessage(modelHandler, modelName, options = {}) {
    // Donation message configuration
    const donationConfig = {
        threshold: options.threshold || 50,
        currentDonations: options.currentDonations || 47,
        kofiLink: options.kofiLink || 'https://ko-fi.com/pollinationsai',
        ...options
    };

    // Return the wrapped handler function
    return async function wrappedHandler(messages, handlerOptions = {}) {
        try {
            // Attempt to run the original model handler
            return await modelHandler(messages, handlerOptions);
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
                            content: formatDonationMessage(modelName, donationConfig)
                        },
                        finish_reason: "stop"
                    }
                ],
                usage: {
                    prompt_tokens: 0,
                    completion_tokens: 0,
                    total_tokens: 0
                },
                donation_request: true
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
## ⚠️ ${modelName} credits have run out

We need your help to keep this service running! Our AI models rely on external APIs that require credits.

### We're so close!

We need to reach **$${config.threshold}** to reactivate ${modelName} for everyone.
**$${config.currentDonations}** has already been donated - we're only **$${remainingNeeded}** away!

**Your donation can make the difference!** Even a small contribution of $3 could bring ${modelName} back online.

### Our Promise

When we reach our goal, ${modelName} will be guaranteed to remain online for a full week for all users.

[💰 Donate Now at Ko-fi](${config.kofiLink})

Thank you for helping keep Pollinations.AI free and accessible for everyone! 🙏
`;
}

export default wrapModelWithDonationMessage;
