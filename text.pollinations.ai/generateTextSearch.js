import { generateText } from './generateTextOpenai.js';
import { searchToolDefinition, performWebSearch } from './tools/searchTool.js';
import { performWebScrape, scrapeToolDefinition } from './tools/scrapeTool.js';

export async function generateTextWithSearch(messages, options = {}) {
    const searchTools = [searchToolDefinition, scrapeToolDefinition];
    const searchHandlers = {
        web_search: performWebSearch,
        web_scrape: performWebScrape
    };

    return generateText(messages, {
        ...options,
        tools: searchTools,
        tool_handlers: searchHandlers
    });
}