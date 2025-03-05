import { generateTextPortkey } from './generateTextPortkey.js';
import { searchToolDefinition } from './tools/searchTool.js';
import { scrapeToolDefinition } from './tools/scrapeTool.js';
import { performWebSearch } from './tools/searchTool.js';
import { performWebScrape } from './tools/scrapeTool.js';
import debug from 'debug';

const log = debug('pollinations:search');
const errorLog = debug('pollinations:search:error');

// Define default search tools
const defaultSearchTools = [searchToolDefinition, scrapeToolDefinition];

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
        log('Generating text with search capabilities');

        // If streaming is enabled, we need to handle it differently
        if (options.stream) {
            log('Streaming mode detected, passing through to generateText');
            // For streaming, pass through to generateText with properly configured search tools
            
            // Set the system message for search if not already present
            const hasSystemMessage = messages.some(message => message.role === 'system');
            const updatedMessages = [...messages];
            if (!hasSystemMessage) {
                updatedMessages.unshift({ 
                    role: 'system', 
                    content: `You are Polly, Pollinations.AI helpful search assistant. You can search the web for old and current information. Today's date is ${new Date().toLocaleDateString()}.`
                });
            }
            
            // Configure search options for streaming
            const searchOptions = {
                ...options,
                model: 'openai-large',
                tools: defaultSearchTools,
                tool_choice: 'auto',
                parallel_tool_calls: false // Disable parallel tool calls
            };
            
            // Pass the properly configured request to generateText for streaming
            return await generateTextPortkey(updatedMessages, searchOptions);
        }
        
        // Set the system message for search if not already present
        const hasSystemMessage = messages.some(message => message.role === 'system');
        if (!hasSystemMessage) {
            messages = [
                { 
                    role: 'system', 
                    content: `You are Polly, Pollinations.AI helpful search assistant. You can search the web for old and current information. Today's date is ${new Date().toLocaleDateString()}.` 
                }, 
                ...messages
            ];
        }
        
        // Use the OpenAI large model for search by default
        const searchOptions = {
            ...options,
            model: options.model || 'openai-large',
            tools: options.tools || defaultSearchTools,
            tool_choice: options.tool_choice || 'auto',
            parallel_tool_calls: false // Disable parallel tool calls
        };
        
        // Call the vanilla OpenAI function
        let completion = await generateTextPortkey(messages, searchOptions);
        
        // Process any search tool calls (only for non-streaming responses)
        if (completion.choices && 
            completion.choices[0] && 
            completion.choices[0].message && 
            completion.choices[0].message.tool_calls) {
            completion = await processSearchToolCalls(
                completion, 
                messages, 
                searchOptions
            );
        }
        
        return completion;
    } catch (error) {
        errorLog('Error in generateTextSearch:', error);
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
            toolCall => toolCall.function.name === 'web_search' || toolCall.function.name === 'web_scrape'
        );
        
        // Only process if there are search or scrape calls
        if (hasSearchOrScrapeCalls) {
            log('Processing search/scrape tool calls');
            
            // Add the assistant's response with tool calls to the messages
            const updatedMessages = [...messages, responseMessage];

            // Process each tool call
            for (const toolCall of toolCalls) {
                if (toolCall.function.name === 'web_search') {
                    log('Processing web_search tool call');
                    const args = JSON.parse(toolCall.function.arguments);
                    const searchResponse = await performWebSearch(args);
                    
                    updatedMessages.push({
                        tool_call_id: toolCall.id,
                        role: "tool",
                        name: toolCall.function.name,
                        content: searchResponse
                    });
                } else if (toolCall.function.name === 'web_scrape') {
                    log('Processing web_scrape tool call');
                    const args = JSON.parse(toolCall.function.arguments);
                    const scrapeResponse = await performWebScrape(args);
                    
                    updatedMessages.push({
                        tool_call_id: toolCall.id,
                        role: "tool",
                        name: toolCall.function.name,
                        content: scrapeResponse
                    });
                }
                // Ignore other function calls
            }

            // Make a follow-up call with the tool results
            log('Making follow-up call with tool results');
            const followUpOptions = {
                // Keep all options from original call
                ...options,
                // Ensure reasonable max tokens
                max_tokens: options.max_tokens || 4096,
                // Ensure response format is maintained
                response_format: options.jsonMode ? { type: 'json_object' } : undefined
            };
            
            return await generateTextPortkey(updatedMessages, followUpOptions);
        }
        
        // If no search or scrape calls, return the original completion
        log('No search/scrape tool calls to process');
        return completion;
    } catch (error) {
        errorLog('Error in generateTextSearch:', error);
        throw error;
    }
}

export default generateTextSearch;