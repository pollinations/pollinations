import fetch from 'node-fetch';
import TurndownService from 'turndown';

const turndownService = new TurndownService();

// Assuming ~4 chars per token, and wanting to stay well under the 128k token limit
const MAX_TOTAL_CHARS = 100000; // ~25k tokens total
const MAX_CONTENT_LENGTH = 30000; // ~7.5k tokens per URL
let totalCharsScraped = 0; // Track total characters across all scrapes

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

function truncateMarkdown(markdown, maxLength) {
    if (markdown.length <= maxLength) return markdown;

    let truncateIndex = markdown.lastIndexOf('\n\n', maxLength);
    if (truncateIndex === -1) {
        truncateIndex = markdown.lastIndexOf('. ', maxLength);
    }
    if (truncateIndex === -1) {
        truncateIndex = maxLength;
    }

    return markdown.substring(0, truncateIndex) + '\n\n... (content truncated)';
}

export async function performWebScrape({ urls }) {
    try {
        // If we've already scraped too much content, return early
        if (totalCharsScraped >= MAX_TOTAL_CHARS) {
            return JSON.stringify({
                warning: 'Maximum context length reached. Skipping additional scraping.',
                results: []
            });
        }

        console.log("Performing web scrape for URLs:", urls);
        
        // Limit the number of URLs
        const limitedUrls = urls.slice(0, 2); // Reduced to 2 URLs max
        
        const results = [];
        
        // Process URLs sequentially to better control total content
        for (const url of limitedUrls) {
            try {
                // Check if we've hit the limit
                if (totalCharsScraped >= MAX_TOTAL_CHARS) {
                    break;
                }

                const response = await fetch(url);
                const html = await response.text();
                const markdown = turndownService.turndown(html);
                
                // Calculate remaining space
                const remainingSpace = MAX_TOTAL_CHARS - totalCharsScraped;
                const maxForThisUrl = Math.min(MAX_CONTENT_LENGTH, remainingSpace);
                
                // Truncate content
                const truncatedContent = truncateMarkdown(markdown, maxForThisUrl);
                
                // Update total chars scraped
                totalCharsScraped += truncatedContent.length;
                
                results.push({
                    url,
                    success: true,
                    content: truncatedContent
                });
            } catch (error) {
                results.push({
                    url,
                    success: false,
                    error: error.message
                });
            }
        }

        // Reset counter periodically (e.g., after 1 hour) to allow new scraping sessions
        setTimeout(() => {
            totalCharsScraped = 0;
        }, 60 * 60 * 1000);

        return JSON.stringify({
            results,
            charsScraped: totalCharsScraped,
            remainingCapacity: MAX_TOTAL_CHARS - totalCharsScraped
        });
    } catch (error) {
        return JSON.stringify({ error: 'Failed to perform web scraping' });
    }
}
