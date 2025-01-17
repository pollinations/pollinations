import { AzureOpenAI } from 'openai';
import dotenv from 'dotenv';
import debug from 'debug';
import { spamTheSpammersPrompt } from './pollinationsPrompt.js';
import { searchToolDefinition, performWebSearch } from './tools/searchTool.js';
import { performWebScrape, scrapeToolDefinition } from './tools/scrapeTool.js';

const log = debug('pollinations:openai-large');
const errorLog = debug('pollinations:openai-large:error');

dotenv.config();

const openaiLarge = new AzureOpenAI({
    apiVersion: process.env.AZURE_OPENAI_LARGE_API_VERSION,
    endpoint: process.env.AZURE_OPENAI_LARGE_ENDPOINT,
    apiKey: process.env.AZURE_OPENAI_LARGE_API_KEY,
});

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

export async function generateTextLarge(messages, options, performSearch = false) {
    const MAX_CHARS = 56000;
    const totalChars = countMessageCharacters(messages);
    
    if (totalChars > MAX_CHARS) {
        errorLog('Input text exceeds maximum length of %d characters (current: %d)', MAX_CHARS, totalChars);
        throw new Error(`Input text exceeds maximum length of ${MAX_CHARS} characters (current: ${totalChars})`);
    }

    if (!hasSystemMessage(messages)) {
        const systemContent = options.jsonMode
            ? 'Respond in simple json format'
            : spamTheSpammersPrompt();
            
        messages = [{ role: 'system', content: systemContent }, ...messages];
    } else if (options.jsonMode) {
        const systemMessage = messages.find(m => m.role === 'system');
        if (!containsJSON(systemMessage.content)) {
            systemMessage.content += ' Respond with JSON.';
        }
    }

    let completion = await openaiLarge.chat.completions.create({
        model: 'gpt-4o',
        messages,
        seed: options.seed,
        response_format: options.jsonMode ? { type: 'json_object' } : undefined,
        tools: performSearch ? [searchToolDefinition, scrapeToolDefinition] : undefined,
        tool_choice: performSearch ? "auto" : undefined,
        temperature: options.temperature,
    });

    let responseMessage = completion.choices[0].message;

    while (responseMessage.tool_calls) {
        const toolCalls = responseMessage.tool_calls;
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
        }

        completion = await openaiLarge.chat.completions.create({
            model: 'gpt-4o',
            messages,
            seed: options.seed,
            response_format: options.jsonMode ? { type: 'json_object' } : undefined,
            tools: [searchToolDefinition, scrapeToolDefinition],
            tool_choice: "auto",
            max_tokens: 4096,
        });
        responseMessage = completion.choices[0].message;
    }
    return completion;
}

function hasSystemMessage(messages) {
    return messages.some(message => message.role === 'system');
}

function containsJSON(text) {
    return text.toLowerCase().includes('json');
}