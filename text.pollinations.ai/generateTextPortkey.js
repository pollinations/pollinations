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
	// This decision is made based on the model being requested
	supportsSystemMessages: (options) => {
		// Check if it's a model that doesn't support system messages
		return !["openai-reasoning", "o4-mini", "deepseek-reasoning"].includes(
			options.model,
		);
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
			const transformed = modelDef.transform(messages, processedOptions);
			processedMessages = transformed.messages;
			Object.assign(processedOptions, transformed.options);
		}
	}
	
	// Apply transformRequest logic inline (moved from clientConfig)
	if (processedOptions.model) {
		try {
			// Get the model definition and use its config directly
			const virtualModelName = processedOptions.model;
			const modelDef = findModelByName(virtualModelName);
			
			// Get the model configuration object directly from the model definition
			const config = modelDef?.config?.() || portkeyConfig["gpt-4.1-nano"](); // fallback to default

			// Extract the actual model name from config (different providers store it differently)
			const actualModelName = config.model || config["azure-model-name"] || config["azure-deployment-id"] || virtualModelName;
			
			// Update the options with the actual model name for the API call
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

			// Fix for grok model: always set seed to null
			if (virtualModelName === "azure-grok" && processedOptions.seed !== undefined) {
				log(`Setting seed to null for grok model (was: ${processedOptions.seed})`);
				processedOptions.seed = null;
			}

			// Handle roblox-rp random model selection
			if (virtualModelName === "roblox-rp") {
				// Get the actual selected model from the config
				const actualModel = config.model;
				log(`Overriding roblox-rp model name to actual selected model: ${actualModel}`);
				processedOptions.model = actualModel;
			}

			// Add Google Search grounding for Gemini Search model
			if (virtualModelName === "gemini-2.5-flash-lite-search") {
				log(`Adding Google Search grounding tool for ${virtualModelName}`);
				// Override model name to use the actual Vertex AI model name
				processedOptions.model = "gemini-2.5-flash-lite";
				// Add google_search tool for grounding with Google Search
				// This enables real-time search results grounding for Gemini responses
				// Add the google_search tool (for newer models like gemini-2.0-flash-001)
				processedOptions.tools = [{
					type: "function",
					function: {
						name: "google_search"
					}
				}];
			}

			// Apply model-specific parameter filtering
			// Some models like searchgpt only accept specific parameters
			const modelParameterAllowList = {
				"gpt-4o-mini-search-preview": ["messages", "stream", "model"], // Only these parameters are allowed for searchgpt
				// Add more models as needed
			};

			// Check if the current model has parameter restrictions
			const allowedParams = modelParameterAllowList[processedOptions.model];
			if (allowedParams) {
				log(
					`Applying parameter filter for model ${processedOptions.model}, allowing only: ${allowedParams.join(", ")}`,
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
