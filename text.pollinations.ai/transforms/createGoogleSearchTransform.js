import { addTools } from "./pipe.js";

/**
 * Creates a transform function that automatically adds Google Search grounding
 * This enables models to access real-time information from Google Search
 * Uses the existing addTools helper for consistency
 * @returns {Function} Transform function that adds Google Search tools
 * @example
 * const searchTransform = createGoogleSearchTransform();
 * const result = searchTransform(messages, {});
 * // Returns: { messages, options: { tools: [{ googleSearch: {} }] } }
 */
export function createGoogleSearchTransform() {
    // Use the existing addTools helper with Google Search tool
    return addTools([{ googleSearch: {} }]);
}
