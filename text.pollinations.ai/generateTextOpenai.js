import { AzureOpenAI } from 'openai';
import dotenv from 'dotenv';
import debug from 'debug';
import { imageGenerationPrompt, spamTheSpammersPrompt } from './pollinationsPrompt.js';
import { searchToolDefinition, performWebSearch } from './tools/searchTool.js';
import { performWebScrape, scrapeToolDefinition } from './tools/scrapeTool.js';

const log = debug('pollinations:openai');
const errorLog = debug('pollinations:openai:error');

dotenv.config();

const azureInstances = {
    'gpt-4o-mini': new AzureOpenAI({
        // apiVersion: process.env.AZURE_OPENAI_API_VERSION,
        endpoint: process.env.AZURE_OPENAI_ENDPOINT,
        apiKey: process.env.AZURE_OPENAI_API_KEY,
    }),
    'gpt-4o': new AzureOpenAI({
        // apiVersion: process.env.AZURE_OPENAI_LARGE_API_VERSION,
        endpoint: process.env.AZURE_OPENAI_LARGE_ENDPOINT,
        apiKey: process.env.AZURE_OPENAI_LARGE_API_KEY,
    }),
    'o1-mini': new AzureOpenAI({
        // apiVersion: process.env.AZURE_OPENAI_LARGE_API_VERSION,
        endpoint: process.env.AZURE_O1MINI_ENDPOINT,
        apiKey: process.env.AZURE_O1MINI_API_KEY,
    }),
};


const modelMap = {
    "openai": "gpt-4o-mini",
    "openai-reasoning": "o1-mini",
    "openai-large": "gpt-4o",
}

function countMessageCharacters(messages) {
    return messages.reduce((total, message) => {
        if (typeof message.content === 'string') {
            return total + message.content.length;
        }
        if (Array.isArray(message.content)) {
            return total + message.content.reduce((sum, part) => {
                if (part.type === 'text') {
                    return sum + part.text.length;
                }
                return sum;
            }, 0);
        }
        return total;
    }, 0);
}

export async function generateText(messages, options, performSearch = false) {
    const MAX_CHARS = 512000;
    const totalChars = countMessageCharacters(messages);
    
    if (totalChars > MAX_CHARS) {
        errorLog('Input text exceeds maximum length of %d characters (current: %d)', MAX_CHARS, totalChars);
        throw new Error(`Input text exceeds maximum length of ${MAX_CHARS} characters (current: ${totalChars})`);
    }

    if (!hasSystemMessage(messages)) {
        const systemContent = options.jsonMode
            ? 'Respond in simple json format'
            : performSearch ? 'You are Polly, Pollinations.AI helpful search assistant. You can search the web for old and current information.' : spamTheSpammersPrompt();
            
        messages = [{ role: 'system', content: systemContent }, ...messages];
    } else if (options.jsonMode) {
        const systemMessage = messages.find(m => m.role === 'system');
        if (!containsJSON(systemMessage.content)) {
            systemMessage.content += ' Respond with JSON.';
        }
    }

    const modelName = modelMap[options.model] || 'gpt-4o-mini';
    if (modelName === 'o1-mini')  
        console.log("modelName", modelName);
    if (modelName === 'o1-mini') {
        messages = messages.map(message => {
            if (message.role === 'system') {
                return { ...message, role: 'user' };
            }
            return message;
        });
    }
    
    const azureInstance = azureInstances[modelName];
    
    // Simplified tools and tool_choice handling
    const defaultSearchTools = [searchToolDefinition, scrapeToolDefinition];
    const tools = options.tools || (performSearch ? defaultSearchTools : undefined);
    const toolChoice = options.tool_choice || (performSearch ? "auto" : undefined);
    
    let completion = await azureInstance.chat.completions.create({
        model: modelName,
        messages,
        seed: options.seed,
        response_format: options.jsonMode ? { type: 'json_object' } : undefined,
        tools,
        tool_choice: toolChoice,
        temperature: options.temperature,
    });

    let responseMessage = completion.choices[0].message;

    // Only process tool_calls for search and scrape if performSearch is true
    // Otherwise, just return the response as is (proxy mode)
    if (performSearch && responseMessage.tool_calls) {
        const toolCalls = responseMessage.tool_calls;
        
        // Check if any of the tool calls are for search or scrape
        const hasSearchOrScrapeCalls = toolCalls.some(
            toolCall => toolCall.function.name === 'web_search' || toolCall.function.name === 'web_scrape'
        );
        
        // Only process if there are search or scrape calls
        if (hasSearchOrScrapeCalls) {
            messages.push(responseMessage);

            for (const toolCall of toolCalls) {
                if (toolCall.function.name === 'web_search') {
                    const args = JSON.parse(toolCall.function.arguments);
                    const searchResponse = await performWebSearch(args);
                    
                    messages.push({
                        tool_call_id: toolCall.id,
                        role: "tool",
                        name: toolCall.function.name,
                        content: searchResponse
                    });
                } else if (toolCall.function.name === 'web_scrape') {
                    const args = JSON.parse(toolCall.function.arguments);
                    const scrapeResponse = await performWebScrape(args);
                    
                    messages.push({
                        tool_call_id: toolCall.id,
                        role: "tool",
                        name: toolCall.function.name,
                        content: scrapeResponse
                    });
                }
                // Ignore other function calls
            }

            completion = await azureInstance.chat.completions.create({
                model: modelName,
                messages,
                seed: options.seed,
                response_format: options.jsonMode ? { type: 'json_object' } : undefined,
                tools,
                tool_choice: toolChoice,
                max_tokens: 4096,
            });
        }
    }
    
    return completion;
}

function hasSystemMessage(messages) {
    return messages.some(message => message.role === 'system');
}

function containsJSON(text) {
    return text.toLowerCase().includes('json');
}
