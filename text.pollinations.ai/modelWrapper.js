import debug from 'debug';

const log = debug('pollinations:modelWrapper');
const errorLog = debug('pollinations:error');

/**
 * Creates a wrapped model function with fallback and timeout capabilities
 * @param {Function} primaryModel - Primary model generation function
 * @param {Function} fallbackModel - Fallback model generation function
 * @param {Object} options - Configuration options
 * @param {number} options.timeout - Timeout in milliseconds (default: 30000)
 * @param {string} options.primaryName - Name of primary model for logging
 * @param {string} options.fallbackName - Name of fallback model for logging
 * @returns {Function} Wrapped model function
 */
export function createModelWithFallback(primaryModel, fallbackModel, options = {}) {
    const {
        timeout = 30000,
        primaryName = 'primary',
        fallbackName = 'fallback'
    } = options;

    return async function wrappedModel(messages, modelOptions = {}) {
        // Create a promise that rejects after the timeout
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`${primaryName} model timed out after ${timeout}ms`));
            }, timeout);
        });

        try {
            // Try primary model with timeout
            log(`Attempting ${primaryName} model`);
            const result = await Promise.race([
                primaryModel(messages, modelOptions),
                timeoutPromise
            ]);
            log(`${primaryName} model succeeded`);
            return result;
        } catch (error) {
            errorLog(`${primaryName} model failed:`, error);

            if (!fallbackModel) {
                throw error;
            }

            // Try fallback model
            try {
                log(`Attempting ${fallbackName} model`);
                const fallbackResult = await fallbackModel(messages, modelOptions);
                log(`${fallbackName} model succeeded`);
                return fallbackResult;
            } catch (fallbackError) {
                errorLog(`${fallbackName} model failed:`, fallbackError);
                throw fallbackError;
            }
        }
    };
}