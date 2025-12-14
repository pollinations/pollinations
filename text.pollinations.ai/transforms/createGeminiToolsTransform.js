import { addDefaultTools } from "./pipe.js";

/** @type {readonly ["code_execution", "google_search", "url_context"]} */
const VALID_TOOLS = ["code_execution", "google_search", "url_context"];

/**
 * Creates a transform that adds Gemini tools for enhanced capabilities
 * Only applies if user hasn't passed their own tools
 * @param {Array<"code_execution" | "google_search" | "url_context">} toolNames - Tool names to add
 * @returns {Function} Transform function that adds Gemini tools as defaults
 */
export function createGeminiToolsTransform(toolNames = [...VALID_TOOLS]) {
    const invalid = toolNames.filter((t) => !VALID_TOOLS.includes(t));
    if (invalid.length) {
        throw new Error(
            `Invalid Gemini tools: ${invalid.join(", ")}. Valid: ${VALID_TOOLS.join(", ")}`,
        );
    }
    return addDefaultTools(toolNames.map((name) => ({ type: name })));
}
