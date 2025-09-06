import dotenv from "dotenv";
import { genericOpenAIClient } from "./genericOpenAIClient.js";
import debug from "debug";
import { resolveModelConfig } from "./transforms/ModelConfigResolver.js";
import { generateHeaders } from "./transforms/HeaderGenerator.js";
import { sanitizeMessages } from "./transforms/MessageSanitizer.js";
import { checkLimits } from "./transforms/limitChecker.js";
import { processParameters } from "./transforms/parameterProcessor.js";
import { findModelByName } from "./availableModels.js";

dotenv.config();

export const log = debug("pollinations:portkey");
const errorLog = debug("pollinations:portkey:error");

// Model mapping is now handled via mappedModel field in availableModels.js

// Default options
const DEFAULT_OPTIONS = {
	model: "openai-fast",
	jsonMode: false,
};

/**
 * Generates text using a local Portkey gateway with OpenAI-compatible endpoints
 * @param {Array} messages - Array of message objects
 * @param {Object} options - Options for text generation
 * @returns {Object} - OpenAI-compatible response
 */


/**
 * Configuration object for the Portkey client
 */
const clientConfig = {
	// Use Portkey API Gateway URL from .env with fallback to localhost
	endpoint: () =>
		`${process.env.PORTKEY_GATEWAY_URL || "http://localhost:8787"}/v1/chat/completions`,

	// Auth header configuration
	authHeaderName: "Authorization",
	authHeaderValue: () => {
		// Use the actual Portkey API key from environment variables
		return `Bearer ${process.env.PORTKEY_API_KEY}`;
	},

	// Additional headers will be dynamically set in transformRequest
	additionalHeaders: {},

	// Models that don't support system messages will have system messages converted to user messages
	// This decision is now made based on the model definition in availableModels.js
	supportsSystemMessages: (options) => {
		const modelDef = findModelByName(options.model);
		// Default to true if not specified, only return false if explicitly set
		return modelDef?.supportsSystemMessages !== false;
	},


	// Default options
	defaultOptions: DEFAULT_OPTIONS,
};

/**
 * Generates text using a local Portkey gateway with Azure OpenAI models
 */
export async function generateTextPortkey(messages, options = {}) {
	// Create a copy of options to avoid mutating the original
	let processedOptions = { ...options };
	
	// Apply model transform if it exists
	let processedMessages = messages;
	if (processedOptions.model) {
		const modelDef = findModelByName(processedOptions.model);
		if (modelDef?.transform) {
			try {
				const transformed = modelDef.transform(messages, processedOptions);
				const { messages: transformedMessages, options: transformedOptions } = transformed;
				processedMessages = transformedMessages;
				// Merge transformed options without reassigning the const
				Object.assign(processedOptions, transformedOptions);
			} catch (error) {
				console.error('Transform execution failed:', error);
				// Continue with original messages and options if transform fails
			}
		}
	}
	
	// Apply transformations sequentially
	if (processedOptions.model) {
		try {
			// 1. Resolve model configuration
			let result = resolveModelConfig(processedMessages, processedOptions);
			processedMessages = result.messages;
			processedOptions = result.options;
			log("After resolveModelConfig:", !!processedOptions._modelDef, !!processedOptions._modelConfig);

			// 2. Generate headers (async)
			result = await generateHeaders(processedMessages, processedOptions);
			processedMessages = result.messages;
			processedOptions = result.options;
			log("After generateHeaders:", !!processedOptions._modelDef, !!processedOptions._modelConfig);

			// 3. Sanitize messages
			result = sanitizeMessages(processedMessages, processedOptions);
			processedMessages = result.messages;
			processedOptions = result.options;
			log("After sanitizeMessages:", !!processedOptions._modelDef, !!processedOptions._modelConfig);

			// 4. Check limits
			result = checkLimits(processedMessages, processedOptions);
			processedMessages = result.messages;
			processedOptions = result.options;

			// 5. Process parameters
			result = processParameters(processedMessages, processedOptions);
			processedMessages = result.messages;
			processedOptions = result.options;

		} catch (error) {
			errorLog("Error in request transformation:", error);
			throw error;
		}
	}
	
	// Create a fresh config with clean headers for this request
	const requestConfig = {
		...clientConfig,
		additionalHeaders: processedOptions._additionalHeaders || {}
	};
	
	// Remove from options since it's now in config
	if (processedOptions._additionalHeaders) {
		delete processedOptions._additionalHeaders;
	}
	
	return await genericOpenAIClient(processedMessages, processedOptions, requestConfig);
}

