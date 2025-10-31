import { addTools } from "./pipe.js";

/**
 * Creates a transform function that automatically adds Google Search grounding
 * This enables models to access real-time information from Google Search
 * Uses the correct format for Vertex AI: function with name "google_search"
 * @returns {Function} Transform function that adds Google Search tools
 * @example
 * const searchTransform = createGoogleSearchTransform();
 * const result = searchTransform(messages, {});
 * // Returns: { messages, options: { tools: [{ type: "function", function: { name: "google_search" } }] } }
 */
export function createGoogleSearchTransform() {
    // Use the correct format for Vertex AI Google Search
    return addTools([
        {
            type: "function",
            function: {
                name: "google_search",
            },
        },
    ]);
}
