/**
 * Text Generation Service for Cloudflare Workers
 *
 * This module provides text generation capabilities migrated from text.pollinations.ai.
 * It's designed to run in a Cloudflare Worker environment with native fetch and Web Streams.
 */

// Re-export transforms
export * from "./transforms/index.js";

// Re-export prompts
export {
    BASE_PROMPTS,
    midijourneyPrompt,
    chickyTutorPrompt,
} from "./prompts.js";

// Re-export configs (excluding ProviderConfig to avoid conflict with types.ts)
export {
    extractResourceName,
    extractDeploymentName,
    extractApiVersion,
    createAzureModelConfig,
    createScalewayModelConfig,
    createBedrockLambdaModelConfig,
    createBedrockNativeConfig,
    createMyceliGrok4FastConfig,
    createPerplexityModelConfig,
    createOVHcloudModelConfig,
    createFireworksModelConfig,
    createVertexAIModelConfig,
    generatePortkeyHeaders,
} from "./configs/index.js";

// Re-export types (ProviderConfig comes from here)
export * from "./types.js";

// Re-export utils
export {
    validateAndNormalizeMessages,
    normalizeOptions,
    formatToOpenAIResponse,
    generateRequestId,
    cleanUndefined,
    cleanNullAndUndefined,
    createErrorResponse,
    parseSSEData,
    formatSSE,
    formatSSEDone,
} from "./utils.js";

// Import types for function signature
import type { TextGenerationRequest, TextGenerationResponse } from "./types.js";

/**
 * Placeholder for the main text generation function.
 * This will be implemented to call Portkey gateway directly.
 *
 * For now, the proxy.ts continues to forward requests to text.pollinations.ai.
 * This function will be used when we're ready to handle generation directly.
 */
export async function generateText(
    _options: TextGenerationRequest,
    _env: Record<string, string>,
): Promise<TextGenerationResponse | ReadableStream> {
    throw new Error(
        "Direct text generation not yet implemented. Use proxy to text.pollinations.ai for now.",
    );
}
