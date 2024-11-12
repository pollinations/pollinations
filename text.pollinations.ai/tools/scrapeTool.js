import fetch from 'node-fetch';
import TurndownService from 'turndown';

const turndownService = new TurndownService();

// Maximum characters per scraped URL (roughly 1/4 of OpenAI's limit to allow for multiple URLs)
const MAX_CONTENT_LENGTH = 250000;

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
 * Truncates markdown content while trying to maintain content integrity
 * @param {string} markdown - The markdown content to truncate
 * @param {number} maxLength - Maximum length to truncate to
 * @returns {string} Truncated markdown
 */
function truncateMarkdown(markdown, maxLength) {
    if (markdown.length <= maxLength) return markdown;

    // Find a good breaking point (end of a paragraph)
    let truncateIndex = markdown.lastIndexOf('\n\n', maxLength);
    if (truncateIndex === -1) {
        truncateIndex = markdown.lastIndexOf('. ', maxLength);
    }
    if (truncateIndex === -1) {
        truncateIndex = maxLength;
    }

    return markdown.substring(0, truncateIndex) + '\n\n... (content truncated)';
}

/**
 * Scrapes multiple URLs in parallel and converts their content to markdown
 * @param {Object} params - Parameters object
 * @param {string[]} params.urls - Array of URLs to scrape
 * @returns {Promise<string>} JSON string containing the scraping results
 */
export async function performWebScrape({ urls }) {
    try {
        console.log("Performing web scrape for URLs:", urls);
        
        // Limit the number of URLs to prevent excessive content
        const limitedUrls = urls.slice(0, 3);
        if (limitedUrls.length < urls.length) {
            console.log(`Limiting scrape to first ${limitedUrls.length} URLs to prevent context overflow`);
        }

        const scrapePromises = limitedUrls.map(async (url) => {
            try {
                const response = await fetch(url);
                const html = await response.text();
                const markdown = turndownService.turndown(html);
                
                // Truncate the content if it's too long
                const truncatedContent = truncateMarkdown(markdown, MAX_CONTENT_LENGTH);
                
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
