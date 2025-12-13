import { addTools } from "./pipe.js";

/**
 * Creates a transform function that enables Gemini's code execution capability
 * This allows the model to generate and run Python code to solve problems
 * Uses the Portkey format: { type: "code_execution" }
 * @returns {Function} Transform function that adds code execution tools
 * @example
 * const codeExecTransform = createCodeExecutionTransform();
 * const result = codeExecTransform(messages, {});
 * // Returns: { messages, options: { tools: [{ type: "code_execution" }] } }
 */
export function createCodeExecutionTransform() {
    return addTools([
        {
            type: "code_execution",
        },
    ]);
}
