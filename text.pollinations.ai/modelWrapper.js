import debug from 'debug';

const log = debug('pollinations:modelWrapper');
const errorLog = debug('pollinations:error');

/**
 * Creates a wrapped model function with fallback and timeout capabilities
 * @param {Function} primaryModel - Primary model generation function
 * @param {Function} fallbackModel - Fallback model generation function
 * @param {Object} options - Configuration options
 * @param {number} options.timeout - Timeout in milliseconds (default: 30000)
 * @param {Object} options.fallbackOptions - Options to override when falling back (e.g., model name)
 * @returns {Function} Wrapped model function
 */
export function createModelWithFallback(primaryModel, fallbackModel, options = {}) {
    const {
        timeout = 30000,
        fallbackOptions = {}
    } = options;

    return async function wrappedModel(messages, modelOptions = {}) {
        // Create a promise that rejects after the timeout
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`Model timed out after ${timeout}ms`));
            }, timeout);
        });

        try {
            // Try primary model with timeout
            log('Attempting primary model');
            const result = await Promise.race([
                primaryModel(messages, modelOptions),
                timeoutPromise
            ]);
            log('Primary model succeeded');
            return result;
        } catch (error) {
            errorLog('Primary model failed:', error);

            if (!fallbackModel) {
                throw error;
            }

            // Try fallback model with merged options
            try {
                log('Attempting fallback model');
                const fallbackResult = await fallbackModel(messages, {
                    ...modelOptions,
                    ...fallbackOptions
                });
                log('Fallback model succeeded');
                return fallbackResult;
            } catch (fallbackError) {
                errorLog('Fallback model failed:', fallbackError);
                throw fallbackError;
            }
        }
    };
}