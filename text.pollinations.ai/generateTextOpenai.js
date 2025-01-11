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

    // Determine which tools to use and validate them
    let tools = [];
    if (performSearch) {
        tools = [searchToolDefinition, scrapeToolDefinition];
    }
    if (options.tools && Array.isArray(options.tools)) {
        // Validate each tool has required fields and strict mode settings
        const validatedTools = options.tools.map(tool => {
            if (tool.type !== 'function') {
                throw new Error('Only function type tools are supported');
            }
            
            // Ensure strict mode settings are properly configured
            if (tool.strict) {
                if (!tool.function.parameters.required || 
                    !tool.function.parameters.additionalProperties === false) {
                    throw new Error('Strict mode requires all parameters to be marked as required and additionalProperties to be false');
                }
            }
            return tool;
        });
        
        tools = performSearch ? [...tools, ...validatedTools] : validatedTools;
    }

    // Configure completion options
    const completionOptions = {
        model: 'gpt-4o-mini',
        messages,
        seed: options.seed,
        response_format: options.jsonMode ? { type: 'json_object' } : undefined,
        stream: options.stream,
    };

    // Add tools configuration if any tools are defined
    if (tools.length > 0) {
        completionOptions.tools = tools;
        completionOptions.tool_choice = options.tool_choice || "auto";
        
        // Support for parallel function calling control
        if (options.parallel_tool_calls === false) {
            completionOptions.parallel_tool_calls = false;
        }
    }

    let completion = await openai.chat.completions.create(completionOptions);

    // If streaming is enabled, return the completion directly
    if (options.stream) {
        return completion;
    }

    let responseMessage = completion.choices[0].message;

    // Handle different finish reasons according to OpenAI's recommendations
    if (responseMessage.finish_reason === "length") {
        throw new Error("The conversation was too long for the context window");
    }
    if (responseMessage.finish_reason === "content_filter") {
        throw new Error("The content was filtered due to policy violations");
    }

    // Handle tool calls
    while (responseMessage.tool_calls || 
           (options.tool_choice && options.tool_choice !== "none" && 
            responseMessage.finish_reason === "stop")) {
        const toolCalls = responseMessage.tool_calls || [];
        messages.push(responseMessage);

        for (const toolCall of toolCalls) {
            let toolResponse;
            let args;

            try {
                args = JSON.parse(toolCall.function.arguments);
            } catch (error) {
                console.error(`Failed to parse tool arguments: ${error.message}`);
                throw new Error(`Invalid tool arguments: ${toolCall.function.arguments}`);
            }

            try {
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
            } catch (error) {
                console.error(`Tool execution failed: ${error.message}`);
                toolResponse = `Error executing ${toolCall.function.name}: ${error.message}`;
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
