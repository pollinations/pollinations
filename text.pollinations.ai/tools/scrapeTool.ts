import fetch from 'node-fetch'
import TurndownService from 'turndown'
import debug from 'debug'

const turndownService = new TurndownService()
const log = debug('pollinations:scrape')

// Assuming ~4 chars per token, and wanting to stay well under the 128k token limit
const MAX_TOTAL_CHARS = 100000 // ~25k tokens total
const MAX_CONTENT_LENGTH = 30000 // ~7.5k tokens per URL
let totalCharsScraped = 0 // Track total characters across all scrapes

// Add timeout constant
const SCRAPE_TIMEOUT = 30000 // 30 seconds timeout for scraping

export const scrapeToolDefinition = {
    type: 'function',
    function: {
        name: 'web_scrape',
        description: 'Scrape web pages and convert their content to markdown format.',
        parameters: {
            type: 'object',
            properties: {
                urls: {
                    type: 'array',
                    items: {
                        type: 'string'
                    },
                    description: 'Array of URLs to scrape'
                }
            },
            required: ['urls']
        }
    }
}

function truncateMarkdown(markdown: string, maxLength: number) {
    if (markdown.length <= maxLength) return markdown

    let truncateIndex = markdown.lastIndexOf('\n\n', maxLength)
    if (truncateIndex === -1) {
        truncateIndex = markdown.lastIndexOf('. ', maxLength)
    }
    if (truncateIndex === -1) {
        truncateIndex = maxLength
    }

    return markdown.substring(0, truncateIndex) + '\n\n... (content truncated)'
}

export async function performWebScrape(options: Record<string, any> & { urls: string[] }) {
    const { urls } = options

    try {
        if (totalCharsScraped >= MAX_TOTAL_CHARS) {
            return JSON.stringify({
                warning: 'Maximum context length reached. Skipping additional scraping.',
                results: []
            })
        }

        log('Performing web scrape for URLs: %O', urls)
        const limitedUrls = urls.slice(0, 2)
        const results = []

        for (const url of limitedUrls) {
            try {
                if (totalCharsScraped >= MAX_TOTAL_CHARS) break

                // Add timeout to fetch operation
                const controller = new AbortController()
                const timeoutId = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT)

                const response = await fetch(url, { signal: controller.signal as any })
                const html = await response.text()
                clearTimeout(timeoutId)

                const markdown = turndownService.turndown(html)
                const remainingSpace = MAX_TOTAL_CHARS - totalCharsScraped
                const maxForThisUrl = Math.min(MAX_CONTENT_LENGTH, remainingSpace)
                const truncatedContent = truncateMarkdown(markdown, maxForThisUrl)

                totalCharsScraped += truncatedContent.length
                results.push({ url, success: true, content: truncatedContent })
            } catch (error: any) {
                const errorMessage = error.name === 'AbortError'
                    ? 'Scraping timed out'
                    : error.message
                results.push({ url, success: false, error: errorMessage })
            }
        }

        setTimeout(() => { totalCharsScraped = 0 }, 60 * 60 * 1000)

        return JSON.stringify({
            results,
            charsScraped: totalCharsScraped,
            remainingCapacity: MAX_TOTAL_CHARS - totalCharsScraped
        })
    } catch (error: any) {
        return JSON.stringify({
            error: 'Failed to perform web scraping',
            details: error.message
        })
    }
}
