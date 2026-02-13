/**
 * Creates a transform function that wraps a model with additional functionality
 * This is a placeholder for future model transformation needs
 */

/**
 * Creates a simple model override transform
 * @param {string} targetModel - The model to override to
 * @returns {Function} Transform function
 */
export function createModelOverride(targetModel) {
    return (messages, options) => ({
        messages,
        options: { ...options, model: targetModel },
    });
}
