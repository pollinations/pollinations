import { AzureOpenAI } from 'openai';
import dotenv from 'dotenv';
import { imageGenerationPrompt } from './pollinationsPrompt.js';
import { searchToolDefinition, performWebSearch } from './tools/searchTool.js';
import { performWebScrape, scrapeToolDefinition } from './tools/scrapeTool.js';

dotenv.config();

const openai = new AzureOpenAI({
    apiVersion: process.env.AZURE_OPENAI_API_VERSION,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    apiKey: process.env.AZURE_OPENAI_API_KEY,
});

export async function generateText(messages, options, performSearch = false) {
    if (!hasSystemMessage(messages)) {
        const systemContent = options.jsonMode
            ? 'Respond in simple json format'
            : 'You are a helpful assistant.\n\n' + imageGenerationPrompt();
        messages = [{ role: 'system', content: systemContent }, ...messages];
    }

    console.log("calling openai with messages", messages);

    let completion;
    let responseMessage;
    let attempts = 0;
    const maxAttempts = 3;

    do {
        completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages,
            seed: options.seed + attempts,
            response_format: options.jsonMode ? { type: 'json_object' } : undefined,
            tools: performSearch ? [searchToolDefinition, scrapeToolDefinition] : undefined,
            tool_choice: performSearch ? "auto" : undefined
        });

        responseMessage = completion.choices[0].message;
        attempts++;
    } while ((!responseMessage.content || responseMessage.content === '') && attempts < maxAttempts);

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

        // Get next response after tool use
        attempts = 0;
        do {
            completion = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages,
                seed: options.seed + attempts,
                response_format: options.jsonMode ? { type: 'json_object' } : undefined,
                tools: [searchToolDefinition, scrapeToolDefinition],
                tool_choice: "auto"
            });
            responseMessage = completion.choices[0].message;
            attempts++;
        } while ((!responseMessage.content || responseMessage.content === '') && attempts < maxAttempts);
    }

    return responseMessage.content;
}

function hasSystemMessage(messages) {
    return messages.some(message => message.role === 'system');
}
