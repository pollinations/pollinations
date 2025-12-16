/**
 * Pollinations Reasoning Service
 *
 * Functions and schemas for advanced reasoning and thinking models
 * Chains deep-think models before generating final content
 */

import {
    createMCPResponse,
    createTextContent,
    buildUrl,
} from "../utils/coreUtils.js";
import { z } from "zod";

// Constants
const TEXT_API_BASE_URL = "https://text.pollinations.ai";

/**
 * Deep thinking models available for reasoning
 */
const REASONING_MODELS = {
    "deepseek-r1": {
        name: "DeepSeek R1",
        description: "Advanced reasoning model with step-by-step thinking",
        specialties: ["Complex problem solving", "Mathematical reasoning", "Code analysis"],
        thinking: true
    },
    "kimi-k2-thinking": {
        name: "Kimi K2 Thinking", 
        description: "Deep thinking model with extended reasoning chains",
        specialties: ["Philosophical reasoning", "Creative problem solving", "Strategic thinking"],
        thinking: true
    },
    "gemini-2.0-thinking": {
        name: "Gemini 2.0 Thinking",
        description: "Google's reasoning model with multi-step analysis",
        specialties: ["Scientific reasoning", "Data analysis", "Logical deduction"],
        thinking: true
    }
};

/**
 * Internal function to generate text with reasoning
 *
 * @param {string} prompt - The main prompt/question
 * @param {string} reasoningPrompt - The reasoning/instruction prompt
 * @param {Object} options - Generation options
 * @returns {Object} - Response with reasoning and final answer
 */
async function _generateReasoningInternal(prompt, reasoningPrompt, options = {}) {
    const { 
        reasoningModel = "deepseek-r1", 
        finalModel = "openai",
        maxReasoningTokens = 2000,
        maxFinalTokens = 1000,
        temperature = 0.7,
        json = false
    } = options;

    // Step 1: Generate reasoning/thinking
    const reasoningUrl = buildUrl(TEXT_API_BASE_URL, encodeURIComponent(reasoningPrompt), {
        model: reasoningModel,
        max_tokens: maxReasoningTokens,
        temperature: 0.3, // Lower temperature for more focused reasoning
        json: json ? "true" : undefined
    });

    // Step 2: Generate final answer based on reasoning
    const finalPrompt = `Based on the following reasoning, provide a concise final answer to the original question.

Original Question: ${prompt}

Reasoning: [See reasoning above]

Final Answer:`;

    const finalUrl = buildUrl(TEXT_API_BASE_URL, encodeURIComponent(finalPrompt), {
        model: finalModel,
        max_tokens: maxFinalTokens,
        temperature,
        json: json ? "true" : undefined
    });

    return {
        reasoningUrl,
        finalUrl,
        reasoningModel,
        finalModel,
        prompt,
        reasoningPrompt
    };
}

/**
 * Performs deep reasoning on a complex question or problem
 *
 * @param {Object} params - The parameters for reasoning
 * @param {string} params.prompt - The main question or problem to solve
 * @param {string} [params.context] - Additional context or background information
 * @param {string} [params.reasoningModel="deepseek-r1"] - Model to use for reasoning step
 * @param {string} [params.finalModel="openai"] - Model to use for final answer
 * @param {number} [params.maxReasoningTokens=2000] - Maximum tokens for reasoning
 * @param {number} [params.maxFinalTokens=1000] - Maximum tokens for final answer
 * @param {number} [params.temperature=0.7] - Temperature for final generation
 * @param {boolean} [params.json=false] - Whether to return JSON format
 * @returns {Promise<Object>} - MCP response with reasoning process and final answer
 */
async function deepReasoning(params) {
    const {
        prompt,
        context = "",
        reasoningModel = "deepseek-r1",
        finalModel = "openai",
        maxReasoningTokens = 2000,
        maxFinalTokens = 1000,
        temperature = 0.7,
        json = false
    } = params;

    if (!prompt || typeof prompt !== "string") {
        throw new Error("Prompt is required and must be a string");
    }

    if (!REASONING_MODELS[reasoningModel]) {
        throw new Error(`Unsupported reasoning model: ${reasoningModel}`);
    }

    try {
        // Create reasoning prompt
        const reasoningPrompt = `Please think through this problem step by step. Show your reasoning process clearly.

${context ? `Context: ${context}\n\n` : ""}Question: ${prompt}

Provide a detailed reasoning process that considers multiple perspectives and approaches.`;

        const result = await _generateReasoningInternal(prompt, reasoningPrompt, {
            reasoningModel,
            finalModel,
            maxReasoningTokens,
            maxFinalTokens,
            temperature,
            json
        });

        return createMCPResponse([
            createTextContent(
                `🔍 Deep Reasoning Analysis\n\n` +
                `Question: "${prompt}"\n` +
                `${context ? `Context: "${context}"\n` : ""}` +
                `Reasoning Model: ${REASONING_MODELS[reasoningModel].name}\n` +
                `Final Model: ${finalModel}\n\n` +
                `Reasoning URL: ${result.reasoningUrl}\n` +
                `Final Answer URL: ${result.finalUrl}\n\n` +
                `This process uses ${reasoningModel} for deep thinking, then ${finalModel} for the final concise answer.`,
            ),
        ]);
    } catch (error) {
        throw new Error(`Failed to perform deep reasoning: ${error.message}`);
    }
}

/**
 * Solves complex mathematical problems with step-by-step reasoning
 *
 * @param {Object} params - The parameters for mathematical reasoning
 * @param {string} params.problem - The mathematical problem to solve
 * @param {string} [params.reasoningModel="deepseek-r1"] - Model for mathematical reasoning
 * @param {boolean} [params.showSteps=true] - Whether to show solution steps
 * @returns {Promise<Object>} - MCP response with mathematical solution
 */
async function solveMathProblem(params) {
    const { problem, reasoningModel = "deepseek-r1", showSteps = true } = params;

    if (!problem || typeof problem !== "string") {
        throw new Error("Mathematical problem is required and must be a string");
    }

    try {
        const reasoningPrompt = `Solve this mathematical problem step by step. Show all your work and reasoning.

Problem: ${problem}

Please provide:
1. Understanding of the problem
2. Step-by-step solution
3. Verification of the answer
4. Final answer with proper formatting`;

        const result = await _generateReasoningInternal(problem, reasoningPrompt, {
            reasoningModel,
            finalModel: "openai",
            maxReasoningTokens: 1500,
            maxFinalTokens: 500,
            temperature: 0.3
        });

        return createMCPResponse([
            createTextContent(
                `🧮 Mathematical Problem Solving\n\n` +
                `Problem: "${problem}"\n` +
                `Reasoning Model: ${REASONING_MODELS[reasoningModel].name}\n\n` +
                `Solution Process:\n${result.reasoningUrl}\n\n` +
                `${showSteps ? "Full reasoning with steps available at reasoning URL above." : ""}\n\n` +
                `Final Answer: ${result.finalUrl}`,
            ),
        ]);
    } catch (error) {
        throw new Error(`Failed to solve math problem: ${error.message}`);
    }
}

/**
 * Analyzes code with deep reasoning about functionality, bugs, and improvements
 *
 * @param {Object} params - The parameters for code analysis
 * @param {string} params.code - The code to analyze
 * @param {string} [params.language] - Programming language of the code
 * @param {string} [params.question] - Specific question about the code
 * @param {string} [params.reasoningModel="deepseek-r1"] - Model for code reasoning
 * @returns {Promise<Object>} - MCP response with code analysis
 */
async function analyzeCodeWithReasoning(params) {
    const { 
        code, 
        language = "unknown", 
        question = "What does this code do and are there any potential issues?",
        reasoningModel = "deepseek-r1" 
    } = params;

    if (!code || typeof code !== "string") {
        throw new Error("Code is required and must be a string");
    }

    try {
        const reasoningPrompt = `Analyze this code with deep reasoning. Consider functionality, potential bugs, performance, and best practices.

Language: ${language}
Code:\n\`\`\`${language}\n${code}\n\`\`\`

Question: ${question}

Provide:
1. Code functionality explanation
2. Potential bugs or issues
3. Performance considerations  
4. Suggestions for improvement
5. Security considerations (if applicable)`;

        const result = await _generateReasoningInternal(question, reasoningPrompt, {
            reasoningModel,
            finalModel: "openai",
            maxReasoningTokens: 2000,
            maxFinalTokens: 800,
            temperature: 0.4
        });

        return createMCPResponse([
            createTextContent(
                `💻 Code Analysis with Deep Reasoning\n\n` +
                `Language: ${language}\n` +
                `Lines of Code: ${code.split('\n').length}\n` +
                `Reasoning Model: ${REASONING_MODELS[reasoningModel].name}\n\n` +
                `Analysis Question: "${question}"\n\n` +
                `Detailed Analysis:\n${result.reasoningUrl}\n\n` +
                `Summary: ${result.finalUrl}`,
            ),
        ]);
    } catch (error) {
        throw new Error(`Failed to analyze code: ${error.message}`);
    }
}

/**
 * Lists available reasoning models and their specialties
 *
 * @returns {Promise<Object>} - MCP response with reasoning models info
 */
async function listReasoningModels() {
    const modelsInfo = Object.entries(REASONING_MODELS).map(([id, info]) => ({
        id,
        name: info.name,
        description: info.description,
        specialties: info.specialties,
        thinking: info.thinking
    }));

    return createMCPResponse([
        createTextContent(
            `🧠 Available Reasoning Models\n\n` +
            modelsInfo.map(model => 
                `• ${model.name} (${model.id})\n` +
                `  ${model.description}\n` +
                `  Specialties: ${model.specialties.join(", ")}\n` +
                `  Thinking Mode: ${model.thinking ? "✅ Enabled" : "❌ Disabled"}\n`
            ).join("\n") +
            `\n💡 Use these models for complex problem solving, analysis, and multi-step reasoning.`,
        ),
    ]);
}

/**
 * Export tools as complete arrays ready to be passed to server.tool()
 */
export const reasoningTools = [
    [
        "deepReasoning",
        "Perform deep reasoning analysis on complex questions with step-by-step thinking",
        {
            prompt: z
                .string()
                .describe("The main question or problem to solve through reasoning"),
            context: z
                .string()
                .optional()
                .describe("Additional context or background information"),
            reasoningModel: z
                .enum(["deepseek-r1", "kimi-k2-thinking", "gemini-2.0-thinking"])
                .optional()
                .describe("Model to use for the reasoning step (default: deepseek-r1)"),
            finalModel: z
                .string()
                .optional()
                .describe("Model to use for the final answer (default: openai)"),
            maxReasoningTokens: z
                .number()
                .optional()
                .describe("Maximum tokens for reasoning step (default: 2000)"),
            maxFinalTokens: z
                .number()
                .optional()
                .describe("Maximum tokens for final answer (default: 1000)"),
            temperature: z
                .number()
                .optional()
                .describe("Temperature for final generation (default: 0.7)"),
            json: z
                .boolean()
                .optional()
                .describe("Whether to return JSON format (default: false)"),
        },
        deepReasoning,
    ],
    [
        "solveMathProblem",
        "Solve complex mathematical problems with detailed step-by-step reasoning",
        {
            problem: z
                .string()
                .describe("The mathematical problem to solve"),
            reasoningModel: z
                .enum(["deepseek-r1", "kimi-k2-thinking", "gemini-2.0-thinking"])
                .optional()
                .describe("Model for mathematical reasoning (default: deepseek-r1)"),
            showSteps: z
                .boolean()
                .optional()
                .describe("Whether to show solution steps (default: true)"),
        },
        solveMathProblem,
    ],
    [
        "analyzeCodeWithReasoning", 
        "Analyze code with deep reasoning about functionality, bugs, and improvements",
        {
            code: z
                .string()
                .describe("The code to analyze"),
            language: z
                .string()
                .optional()
                .describe("Programming language of the code"),
            question: z
                .string()
                .optional()
                .describe("Specific question about the code"),
            reasoningModel: z
                .enum(["deepseek-r1", "kimi-k2-thinking", "gemini-2.0-thinking"])
                .optional()
                .describe("Model for code analysis (default: deepseek-r1)"),
        },
        analyzeCodeWithReasoning,
    ],
    [
        "listReasoningModels",
        "List available reasoning models and their specialties",
        {},
        listReasoningModels,
    ],
];