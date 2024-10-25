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

/**
 * Scrapes multiple URLs in parallel and converts their content to markdown
 * @param {Object} params - Parameters object
 * @param {string[]} params.urls - Array of URLs to scrape
 * @returns {Promise<string>} JSON string containing the scraping results
 */
export async function performWebScrape({ urls }) {
    try {
        console.log("Performing web scrape for URLs:", urls);
        
        const scrapePromises = urls.map(async (url) => {
            try {
                const response = await fetch(url);
                const html = await response.text();
                const markdown = turndownService.turndown(html);
                return {
                    url,
                    success: true,
                    content: markdown
                };
            } catch (error) {
                console.error(`Error scraping ${url}:`, error);
                return {
                    url,
                    success: false,
                    error: error.message
                };
            }
        });

        const results = await Promise.all(scrapePromises);
        console.log("Scraping completed for", results.length, "URLs");
        
        return JSON.stringify(results);
    } catch (error) {
        console.error('Scraping operation failed:', error);
        return JSON.stringify({ error: 'Failed to perform web scraping' });
    }
}
