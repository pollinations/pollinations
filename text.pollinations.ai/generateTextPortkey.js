import dotenv from "dotenv";
import { genericOpenAIClient } from "./genericOpenAIClient.js";
import debug from "debug";
import {
	generatePortkeyHeaders,
} from "./portkeyUtils.js";
import { findModelByName } from "./availableModels.js";
import { sanitizeMessagesWithPlaceholder } from "./utils/messageSanitizer.js";
import { portkeyConfig } from "./configs/modelConfigs.js";

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
	const processedOptions = { ...options };
	
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
	
	// Apply transformRequest logic inline (moved from clientConfig)
	if (processedOptions.model) {
		try {
			// Get the model configuration directly from the model definition
			const virtualModelName = processedOptions.model;
			const modelDef = findModelByName(virtualModelName);
			
			if (!modelDef?.config) {
				throw new Error(`Model configuration not found for: ${virtualModelName}`);
			}

			// Get the model configuration object directly from the model definition
			const config = typeof modelDef.config === 'function' ? modelDef.config() : modelDef.config;

			// Extract the actual model name from the config
			const actualModelName = config.model || config["azure-model-name"] || config["azure-deployment-id"] || virtualModelName;
			
			// Update the model name in processedOptions to use the actual model name
			processedOptions.model = actualModelName;

			log(
				"Processing request for model:",
				virtualModelName,
				"→",
				actualModelName,
				"with provider:",
				config.provider,
			);

			// Generate headers (now async call)
			const additionalHeaders = await generatePortkeyHeaders(config);
			log(
				"Added provider-specific headers:",
				JSON.stringify(additionalHeaders, null, 2),
			);

			// Set the headers as a property on the options object that will be used by genericOpenAIClient
			processedOptions._additionalHeaders = additionalHeaders;

			// Determine model configuration early (used by sanitizer and limits)
			const modelConfig = findModelByName(virtualModelName);
			log("Model config:", modelConfig);

			// Sanitize messages and apply provider-specific fixes
			if (Array.isArray(processedMessages)) {
				const { messages: sanitized, replacedCount } = sanitizeMessagesWithPlaceholder(
					processedMessages,
					modelConfig,
					virtualModelName,
				);
				processedMessages = sanitized;
				if (replacedCount > 0) {
					log(`Replaced ${replacedCount} empty user message content with placeholder`);
				}
			}

			// Check if the model has a specific maxInputChars limit in availableModels.js
			// Check model-specific character limit (only if model defines maxInputChars)
			if (modelConfig && modelConfig.maxInputChars) {
				const totalChars = countMessageCharacters(processedMessages);
				if (totalChars > modelConfig.maxInputChars) {
					errorLog(
						"Input text exceeds model-specific limit of %d characters for model %s (current: %d)",
						modelConfig.maxInputChars,
						processedOptions.model,
						totalChars,
					);
					throw new Error(
						`Input text exceeds maximum length of ${modelConfig.maxInputChars} characters for model ${processedOptions.model} (current: ${totalChars})`,
					);
				}
			}

			// For models with specific token limits or those using defaults
			if (!processedOptions.max_tokens) {
				if (modelConfig && modelConfig.maxTokens) {
					// Use model-specific maxTokens if defined
					log(
						`Setting max_tokens to model-specific value: ${modelConfig.maxTokens}`,
					);
					processedOptions.max_tokens = modelConfig.maxTokens;
				} else if (config["max-tokens"]) {
					// Fall back to provider default
					log(`Setting max_tokens to default value: ${config["max-tokens"]}`);
					processedOptions.max_tokens = config["max-tokens"];
				}
			}

			// Apply model-specific sampling parameter defaults if not provided by user
			// Only set defaults if user hasn't provided values (they take precedence)
			const samplingParams = [
				"temperature",
				"top_p",
				"presence_penalty",
				"frequency_penalty",
			];
			samplingParams.forEach((param) => {
				if (processedOptions[param] === undefined && config[param] !== undefined) {
					log(`Setting ${param} to model default value: ${config[param]}`);
					processedOptions[param] = config[param];
				}
			});




			// Apply model-specific parameter filtering if defined in model config
			if (modelConfig && modelConfig.allowedParameters) {
				const allowedParams = modelConfig.allowedParameters;
				log(
					`Applying parameter filter for model ${virtualModelName}, allowing only: ${allowedParams.join(", ")}`,
				);

				// Create a new options object with only allowed parameters
				const filteredOptions = {};

				// Only include parameters that are in the allow list
				for (const param of allowedParams) {
					if (processedOptions[param] !== undefined) {
						filteredOptions[param] = processedOptions[param];
					}
				}

				// Preserve the additional headers
				if (processedOptions._additionalHeaders) {
					filteredOptions._additionalHeaders = processedOptions._additionalHeaders;
				}

				// Use filtered options
				Object.assign(processedOptions, filteredOptions);
			}

		} catch (error) {
			errorLog("Error in request transformation:", error);
			throw error;
		}
	}
	
	// Move additional headers from processedOptions to config for genericOpenAIClient
	if (processedOptions._additionalHeaders) {
		clientConfig.additionalHeaders = {
			...clientConfig.additionalHeaders,
			...processedOptions._additionalHeaders
		};
		// Remove from options since it's now in config
		delete processedOptions._additionalHeaders;
	}
	
	return await genericOpenAIClient(processedMessages, processedOptions, clientConfig);
}

function countMessageCharacters(messages) {
	return messages.reduce((total, message) => {
		if (typeof message.content === "string") {
			return total + message.content.length;
		}
		if (Array.isArray(message.content)) {
			return (
				total +
				message.content.reduce((sum, part) => {
					if (part.type === "text") {
						return sum + part.text.length;
					}
					return sum;
				}, 0)
			);
		}
		return total;
	}, 0);
}
