import { AzureOpenAI } from 'openai';
import dotenv from 'dotenv';
import { imageGenerationPrompt } from './pollinationsPrompt.js';
import { searchToolDefinition, performWebSearch } from './tools/searchTool.js';

dotenv.config();

const openai = new AzureOpenAI({
    apiVersion: process.env.AZURE_OPENAI_API_VERSION,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    apiKey: process.env.AZURE_OPENAI_API_KEY,
});

async function generateTextBase(messages, options, performSearch = false) {
    if (!hasSystemMessage(messages)) {
        const systemContent = options.jsonMode
            ? 'Respond in simple json format'
            : 'You are a helpful assistant.\n\n' + imageGenerationPrompt;
        messages = [{ role: 'system', content: systemContent }, ...messages];
    }

    console.log("calling openai with messages", messages);

    const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        seed: options.seed,
        response_format: options.jsonMode ? { type: 'json_object' } : undefined,
        tools: performSearch ? [searchToolDefinition] : undefined,
        tool_choice: performSearch ? "auto" : undefined
    });

    const responseMessage = completion.choices[0].message;

    // Handle tool calls if present
    if (responseMessage.tool_calls) {
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
            }
        }

        // Get final response after tool use
        const secondResponse = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages,
            seed: options.seed,
            response_format: options.jsonMode ? { type: 'json_object' } : undefined
        });

        return secondResponse.choices[0].message.content;
    }

    return responseMessage.content;
}

function hasSystemMessage(messages) {
    return messages.some(message => message.role === 'system');
}

export async function generateText(messages, options) {
    return generateTextBase(messages, options, false);
}

export async function generateTextWithSearch(messages, options) {
    return generateTextBase(messages, options, true);
}
