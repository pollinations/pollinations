import { AzureOpenAI } from 'openai';
import dotenv from 'dotenv';
import { imageGenerationPrompt, spamTheSpammersPrompt } from './pollinationsPrompt.js';
import { searchToolDefinition, performWebSearch } from './tools/searchTool.js';
import { performWebScrape, scrapeToolDefinition } from './tools/scrapeTool.js';

dotenv.config();

const openai = new AzureOpenAI({
    apiVersion: process.env.AZURE_OPENAI_API_VERSION,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    apiKey: process.env.AZURE_OPENAI_API_KEY,
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

export async function generateText(messages, options, performSearch = false) {
    const MAX_CHARS = 56000;
    const totalChars = countMessageCharacters(messages);
    
    if (totalChars > MAX_CHARS) {
        console.error(`!!!!!!!!!!! Input text exceeds maximum length of ${MAX_CHARS} characters (current: ${totalChars}) !!!!!!!!!!!`);
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

    // Determine which tools to use
    let tools = [];
    if (performSearch) {
        tools = [searchToolDefinition, scrapeToolDefinition];
    }
    if (options.tools && Array.isArray(options.tools)) {
        tools = performSearch ? [...tools, ...options.tools] : options.tools;
    }

    let completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        seed: options.seed,
        response_format: options.jsonMode ? { type: 'json_object' } : undefined,
        stream: options.stream,
        ...(tools.length > 0 && {
            tools,
            tool_choice: options.tool_choice || "auto",
            parallel_tool_calls: options.parallel_tool_calls
        })
    });

    // If streaming is enabled, return the completion directly
    if (options.stream) {
        return completion;
    }

    let responseMessage = completion.choices[0].message;

    // Handle tool calls
    while (responseMessage.tool_calls || 
           (options.tool_choice && options.tool_choice !== "none" && 
            responseMessage.finish_reason === "stop")) {
        const toolCalls = responseMessage.tool_calls || [];
        messages.push(responseMessage);

        for (const toolCall of toolCalls) {
            let toolResponse;
            const args = JSON.parse(toolCall.function.arguments);

            // Handle built-in search tools
            if (toolCall.function.name === 'web_search') {
                toolResponse = await performWebSearch(args);
            } else if (toolCall.function.name === 'web_scrape') {
                toolResponse = await performWebScrape(args);
            }
            // Handle custom tool calls
            else if (options.tool_handlers && typeof options.tool_handlers[toolCall.function.name] === 'function') {
                toolResponse = await options.tool_handlers[toolCall.function.name](args);
            } else {
                console.warn(`No handler found for tool: ${toolCall.function.name}`);
                toolResponse = `Function ${toolCall.function.name} is not implemented`;
            }
            
            messages.push({
                tool_call_id: toolCall.id,
                role: "tool",
                name: toolCall.function.name,
                content: typeof toolResponse === 'string' ? toolResponse : JSON.stringify(toolResponse)
            });
        }

        completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages,
            seed: options.seed,
            response_format: options.jsonMode ? { type: 'json_object' } : undefined,
            tools: tools.length > 0 ? tools : undefined,
            tool_choice: tools.length > 0 ? options.tool_choice || "auto" : undefined,
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
