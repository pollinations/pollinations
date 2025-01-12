import { generateText } from './generateTextOpenai.js';
import { searchToolDefinition, performWebSearch } from './tools/searchTool.js';
import { performWebScrape, scrapeToolDefinition } from './tools/scrapeTool.js';

export async function generateTextWithSearch(messages, options = {}) {
    const searchTools = [searchToolDefinition, scrapeToolDefinition];

    let completion = await generateText(messages, {
        ...options,
        tools: searchTools,
    });

    let responseMessage = completion.choices[0].message;

    while (responseMessage.tool_calls || 
           (options.tool_choice && options.tool_choice !== "none" && 
            responseMessage.finish_reason === "stop")) {
        const toolCalls = responseMessage.tool_calls || [];
        messages.push(responseMessage);

        for (const toolCall of toolCalls) {
            let toolResponse;
            const args = JSON.parse(toolCall.function.arguments);

            // Handle search-specific tools
            if (toolCall.function.name === 'web_search') {
                toolResponse = await performWebSearch(args);
            } else if (toolCall.function.name === 'web_scrape') {
                toolResponse = await performWebScrape(args);
            } else {
                console.warn(`Unknown search tool: ${toolCall.function.name}`);
                toolResponse = `Search tool ${toolCall.function.name} is not implemented`;
            }
            
            messages.push({
                tool_call_id: toolCall.id,
                role: "tool",
                name: toolCall.function.name,
                content: typeof toolResponse === 'string' ? toolResponse : JSON.stringify(toolResponse)
            });
        }

        completion = await generateText(messages, {
            ...options,
            tools: searchTools,
        });
        responseMessage = completion.choices[0].message;
    }

    return completion;
}