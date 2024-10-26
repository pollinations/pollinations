import fetch from 'node-fetch';
import TurndownService from 'turndown';

const turndownService = new TurndownService();

export const scrapeToolDefinition = {
    type: "function",
    function: {
        name: "web_scrape",
        description: "Scrape web pages and convert their content to markdown format.",
        parameters: {
            type: "object",
            properties: {
                urls: {
                    type: "array",
                    items: {
                        type: "string"
                    },
                    description: "Array of URLs to scrape"
                }
            },
            required: ["urls"]
        }
    }
};

export async function performWebScrape({ urls }) {
    try {
        const scrapePromises = urls.map(async (url) => {
            try {
                const response = await fetch(url);
                const html = await response.text();
                const markdown = turndownService.turndown(html);
                // Limit content to 2000 chars
                const truncatedContent = markdown.slice(0, 2000);
                return {
                    url,
                    success: true,
                    content: truncatedContent
                };
            } catch (error) {
                return {
                    url,
                    success: false,
                    error: error.message
                };
            }
        });

        const results = await Promise.all(scrapePromises);
        return JSON.stringify(results);
    } catch (error) {
        return JSON.stringify({ error: 'Failed to perform web scraping' });
    }
}
