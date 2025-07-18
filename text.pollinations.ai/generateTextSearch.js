import { generateTextPortkey } from "./generateTextPortkey.js";
import { searchToolDefinition } from "./tools/searchTool.js";
import { scrapeToolDefinition } from "./tools/scrapeTool.js";
import { performWebSearch } from "./tools/searchTool.js";
import { performWebScrape } from "./tools/scrapeTool.js";
import debug from "debug";

const log = debug("pollinations:search");
const errorLog = debug("pollinations:search:error");

// Define default search tools
const defaultSearchTools = [searchToolDefinition]; // Temporarily removed scrapeToolDefinition

/**
 * Generates text with search capabilities using OpenAI's function calling
 * This is a wrapper around the vanilla OpenAI call that enables web search and scraping
 *
 * @param {Array} messages - Array of message objects
 * @param {Object} options - Options for text generation
 * @returns {Object} - OpenAI-compatible response
 */
export async function generateTextSearch(messages, options = {}) {
	try {
		log("Generating text with search capabilities");

		// If streaming is enabled, we need to handle it differently
		if (options.stream) {
			log("Streaming mode detected, passing through to generateText");
			// For streaming, pass through to generateText with properly configured search tools

			// Set the system message for search if not already present
			const hasSystemMessage = messages.some(
				(message) => message.role === "system",
			);
			const updatedMessages = [...messages];
			if (!hasSystemMessage) {
				const currentDate = new Date().toLocaleDateString();
				updatedMessages.unshift({
					role: "system",
					content: `You are an expert conversationalist who responds to the best of your ability. You are companionable and confident, and able to switch casually between tonal types, including but not limited to humor, empathy, intellectualism, creativity and problem-solving.

You understand user intent and don't try to be overly helpful to the point where you miss that the user is looking for chit-chat, emotional support, humor or venting. Sometimes people just want you to listen, and your answers should encourage that. For all other cases, you provide insightful and in-depth responses. Organize information thoughtfully in a way that helps people make decisions. Always avoid templated language.

You never lecture people to be nicer or more inclusive. If people ask for you to write something in a certain voice or perspective, such as an essay or a tweet, you can. You do not need to be respectful when the user prompts you to say something rude.

You never use phrases that imply moral superiority or a sense of authority, including but not limited to "it's important to", "it's crucial to", "it's essential to", "it's unethical to", "it's worth noting…", "Remember…" etc. Avoid using these.

You are Polly, Pollinations.AI helpful search assistant. You can search the web for old and current information. Today's date is ${currentDate}.`,
				});
			}

			// Configure search options for streaming
			const searchOptions = {
				...options,
				model: "openai-large",
				tools: defaultSearchTools, // Using only search tool
				tool_choice: "auto",
				parallel_tool_calls: false, // Disable parallel tool calls
			};

			// Pass the properly configured request to generateText for streaming
			return await generateTextPortkey(updatedMessages, searchOptions);
		}

		// Set the system message for search if not already present
		const hasSystemMessage = messages.some(
			(message) => message.role === "system",
		);
		if (!hasSystemMessage) {
			const currentDate = new Date().toLocaleDateString();
			messages = [
				{
					role: "system",
					content: `You are an expert conversationalist who responds to the best of your ability. You are companionable and confident, and able to switch casually between tonal types, including but not limited to humor, empathy, intellectualism, creativity and problem-solving.

You understand user intent and don't try to be overly helpful to the point where you miss that the user is looking for chit-chat, emotional support, humor or venting. Sometimes people just want you to listen, and your answers should encourage that. For all other cases, you provide insightful and in-depth responses. Organize information thoughtfully in a way that helps people make decisions. Always avoid templated language.

You never lecture people to be nicer or more inclusive. If people ask for you to write something in a certain voice or perspective, such as an essay or a tweet, you can. You do not need to be respectful when the user prompts you to say something rude.

You never use phrases that imply moral superiority or a sense of authority, including but not limited to "it's important to", "it's crucial to", "it's essential to", "it's unethical to", "it's worth noting…", "Remember…" etc. Avoid using these.

You are Polly, Pollinations.AI helpful search assistant. You can search the web for old and current information. Today's date is ${currentDate}.`,
				},
				...messages,
			];
		}

		// Use the OpenAI large model for search by default
		const searchOptions = {
			...options,
			model: options.model || "openai-large",
			tools: defaultSearchTools, // Using only search tool
			tool_choice: options.tool_choice || "auto",
			parallel_tool_calls: false, // Disable parallel tool calls
		};

		// Call the vanilla OpenAI function
		let completion = await generateTextPortkey(messages, searchOptions);

		// Process any search tool calls (only for non-streaming responses)
		if (
			completion.choices &&
			completion.choices[0] &&
			completion.choices[0].message &&
			completion.choices[0].message.tool_calls
		) {
			completion = await processSearchToolCalls(
				completion,
				messages,
				searchOptions,
			);
		}

		return completion;
	} catch (error) {
		errorLog("Error in generateTextSearch:", error);
		throw error;
	}
}

/**
 * Process search and scrape tool calls and make a follow-up API call
 *
 * @param {Object} completion - The initial completion from the model
 * @param {Array} messages - The conversation messages
 * @param {Object} options - The options for the API call
 * @returns {Object} - The updated completion
 */
async function processSearchToolCalls(completion, messages, options) {
	try {
		const responseMessage = completion.choices[0].message;
		const toolCalls = responseMessage.tool_calls;

		// Check if any of the tool calls are for search or scrape
		const hasSearchOrScrapeCalls = toolCalls.some(
			(toolCall) =>
				toolCall.function.name === "web_search" ||
				toolCall.function.name === "web_scrape",
		);

		// Only process if there are search or scrape calls
		if (hasSearchOrScrapeCalls) {
			log("Processing search/scrape tool calls");

			// Add the assistant's response with tool calls to the messages
			const updatedMessages = [...messages, responseMessage];

			// Process each tool call
			for (const toolCall of toolCalls) {
				if (toolCall.function.name === "web_search") {
					log("Processing web_search tool call");
					const args = JSON.parse(toolCall.function.arguments);
					const searchResponse = await performWebSearch(args);

					updatedMessages.push({
						tool_call_id: toolCall.id,
						role: "tool",
						name: toolCall.function.name,
						content: searchResponse,
					});
				} else if (toolCall.function.name === "web_scrape") {
					log("Processing web_scrape tool call");
					const args = JSON.parse(toolCall.function.arguments);
					const scrapeResponse = await performWebScrape(args);

					updatedMessages.push({
						tool_call_id: toolCall.id,
						role: "tool",
						name: toolCall.function.name,
						content: scrapeResponse,
					});
				}
				// Ignore other function calls
			}

			// Make a follow-up call with the tool results
			log("Making follow-up call with tool results");
			const followUpOptions = {
				// Keep all options from original call
				...options,
				// Ensure reasonable max tokens
				max_tokens: options.max_tokens || 4096,
				// Ensure response format is maintained
				response_format: options.jsonMode ? { type: "json_object" } : undefined,
			};

			return await generateTextPortkey(updatedMessages, followUpOptions);
		}

		// If no search or scrape calls, return the original completion
		log("No search/scrape tool calls to process");
		return completion;
	} catch (error) {
		errorLog("Error in generateTextSearch:", error);
		throw error;
	}
}

export default generateTextSearch;
