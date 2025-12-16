// polly is love polly is life

/**
 * Pollinations Reasoning Service
 *
 * Functions and schemas for advanced reasoning and thinking models
 * Chains deep-think models before generating final content
 * Supports authenticated requests via API keys or tokens
 */

import {
    createMCPResponse,
    createTextContent,
    buildUrl,
} from "../utils/coreUtils.js";
import { z } from "zod";
import { getCurrentAccessToken } from "./authService.js";

// Constants
const TEXT_API_BASE_URL = "https://gen.pollinations.ai/text";

/**
 * Get authentication headers for API requests
 * Supports API key from environment variable or token-based auth
 * @returns {Object} Headers object with authentication if available
 */
function getAuthHeaders() {
    const headers = {
        'User-Agent': 'PollinationsMCP/1.0',
        'X-Source': 'pollinations-mcp',
        'X-Client-Version': '1.0.0'
    };
    
    // Check for access token from auth service first
    const accessToken = getCurrentAccessToken();
    if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
        return headers;
    }
    
    // Fallback to API key in environment variable
    if (process.env.POLLINATIONS_API_KEY) {
        headers['Authorization'] = `Bearer ${process.env.POLLINATIONS_API_KEY}`;
    }
    
    return headers;
}

/**
 * Deep thinking models available for reasoning
 * Note: These are the actual model names available from gen.pollinations.ai
 */
const REASONING_MODELS = {
    "deepseek": {
        name: "DeepSeek R1",
        description: "State-of-the-art reasoning model",
        specialties: ["Advanced logic", "Mathematical proofs", "Complex analysis"],
        thinking: true
    },
    "openai": {
        name: "OpenAI GPT",
        description: "Powerful reasoning and analysis model",
        specialties: ["Complex problem solving", "Mathematical reasoning", "Code analysis"],
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
        reasoningModel = "deepseek", 
        finalModel = "openai",
        maxReasoningTokens = 2000,
        maxFinalTokens = 1000,
        temperature = 0.7,
        json = false
    } = options;

    try {
        // Step 1: Generate reasoning/thinking
        const reasoningUrl = buildUrl(TEXT_API_BASE_URL, encodeURIComponent(reasoningPrompt), {
            model: reasoningModel,
            max_tokens: maxReasoningTokens,
            temperature: 0.3,
            json: undefined // Always use plain text for reasoning step
        });

        // Fetch the actual reasoning text from the API
        console.error(`Fetching reasoning from: ${reasoningUrl}`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        const reasoningResponse = await fetch(reasoningUrl, {
            method: 'GET',
            headers: getAuthHeaders(),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        if (!reasoningResponse.ok) {
            throw new Error(`Reasoning API error: ${reasoningResponse.status} ${reasoningResponse.statusText}`);
        }

        const reasoningText = await reasoningResponse.text();
        
        if (!reasoningText || reasoningText.trim().length === 0) {
            throw new Error('Empty reasoning response from API');
        }

        // Step 2: Generate final answer based on actual reasoning
        const finalPrompt = `Based on this reasoning, give a concise answer:

Reasoning: ${reasoningText}

Answer:`;

        const finalUrl = buildUrl(TEXT_API_BASE_URL, encodeURIComponent(finalPrompt), {
            model: finalModel,
            max_tokens: maxFinalTokens,
            temperature,
            json: json ? "true" : undefined
        });

        // Fetch the final answer
        console.error(`Fetching final answer from: ${finalUrl}`);
        const finalController = new AbortController();
        const finalTimeoutId = setTimeout(() => finalController.abort(), 10000); // 10 second timeout
        
        const finalResponse = await fetch(finalUrl, {
            method: 'GET',
            headers: getAuthHeaders(),
            signal: finalController.signal
        });
        
        clearTimeout(finalTimeoutId);

        if (!finalResponse.ok) {
            throw new Error(`Final answer API error: ${finalResponse.status} ${finalResponse.statusText}`);
        }

        const finalAnswer = await finalResponse.text();
        
        if (!finalAnswer || finalAnswer.trim() === '') {
            throw new Error('Empty final answer response from API');
        }

        return {
            reasoningUrl,
            finalUrl,
            reasoningModel,
            finalModel,
            prompt,
            reasoningPrompt,
            reasoningText,
            finalAnswer // Include the actual final answer
        };
    } catch (error) {
        throw new Error(`Reasoning chain failed: ${error.message}`);
    }
}

/**
 * Performs deep reasoning on a complex question or problem
 *
 * @param {Object} params - The parameters for reasoning
 * @param {string} params.prompt - The main question or problem to solve
 * @param {string} [params.context] - Additional context or background information
 * @param {string} [params.reasoningModel="deepseek"] - Model to use for reasoning step
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
        reasoningModel = "deepseek",
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
        const reasoningPrompt = `Think through this step by step and show your reasoning:

${context ? `Context: ${context}\n\n` : ""}Question: ${prompt}`;

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
                `🧠 Reasoning Process:\n${result.reasoningText}\n\n` +
                `💡 Final Answer:\n${result.finalAnswer}\n\n` +
                `This process used ${reasoningModel} for deep thinking, then ${finalModel} for the final concise answer.`,
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
 * @param {string} [params.reasoningModel="deepseek"] - Model for mathematical reasoning
 * @param {boolean} [params.showSteps=true] - Whether to show solution steps
 * @returns {Promise<Object>} - MCP response with mathematical solution
 */
async function solveMathProblem(params) {
    const { problem, reasoningModel = "deepseek", showSteps = true } = params;

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
                `🧠 Solution Process:\n${result.reasoningText}\n\n` +
                `💡 Final Answer:\n${result.finalAnswer}\n\n` +
                `This mathematical analysis used ${reasoningModel} for deep logical reasoning.`,
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
 * @param {string} [params.reasoningModel="deepseek"] - Model for code reasoning
 * @returns {Promise<Object>} - MCP response with code analysis
 */
async function analyzeCodeWithReasoning(params) {
    const { 
        code, 
        language = "unknown", 
        question = "What does this code do and are there any potential issues?",
        reasoningModel = "deepseek" 
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
                `🧠 Detailed Analysis:\n${result.reasoningText}\n\n` +
                `💡 Summary:\n${result.finalAnswer}\n\n` +
                `This code analysis used ${reasoningModel} for deep logical reasoning about functionality, bugs, and improvements.`,
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
                .enum(["deepseek", "openai"])
                .optional()
                .describe("Model to use for the reasoning step (default: deepseek)"),
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
                .enum(["deepseek", "openai"])
                .optional()
                .describe("Model for mathematical reasoning (default: deepseek)"),
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
                .enum(["deepseek", "openai"])
                .optional()
                .describe("Model for code analysis (default: deepseek)"),
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