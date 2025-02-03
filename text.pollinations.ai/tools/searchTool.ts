import axios from 'axios'
import dotenv from 'dotenv'
import debug from 'debug'

dotenv.config()

const BING_SEARCH_ENDPOINT = 'https://api.bing.microsoft.com/v7.0/search'
const BING_API_KEY = process.env.BING_API_KEY

// Add timeout constant
const SEARCH_TIMEOUT = 20000 // 10 seconds timeout for search

const log = debug('pollinations:search')
const errorLog = debug('pollinations:search:error')
const perfLog = debug('pollinations:search:perf')

export const searchToolDefinition = {
    type: 'function',
    function: {
        name: 'web_search',
        description: 'Search the web for current information about a topic. Try to get as many results as possible (minimum 20, maximum 100).',
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'The search query'
                },
                num_results: {
                    type: 'number',
                    description: 'Number of results to return (min 20, max 100)',
                    default: 20
                }
            },
            required: ['query']
        }
    }
}

export async function performWebSearch(options: Record<string, any> & { query: string, num_results: number }) {
    const { query, num_results } = options

    const startTime = performance.now()
    try {
        log('Starting web search with query: \'%s\', requesting %d results', query, num_results)
        
        perfLog('Initiating Bing API request at %d ms', performance.now() - startTime)
        const response = await axios.get(BING_SEARCH_ENDPOINT, {
            params: { q: query, count: num_results },
            headers: { 'Ocp-Apim-Subscription-Key': BING_API_KEY },
            timeout: SEARCH_TIMEOUT
        })
        perfLog('Bing API response received after %d ms', performance.now() - startTime)

        log('Received %d results from Bing API', response.data.webPages?.value?.length || 0)
        
        const results = response.data.webPages.value.map((result: Record<string, any>) => ({
            title: result.name,
            snippet: result.snippet,
            url: result.url,
            published: result.datePublishedDisplayText,
            crawled: result.dateLastCrawled,
            publisher: result.publisher,
            thumbnailUrl: result.thumbnailUrl
        }))

        perfLog('Search completed in %d ms', performance.now() - startTime)
        return JSON.stringify(results)
    } catch (error: any) {
        const errorMessage = error.code === 'ECONNABORTED' 
            ? `Search timed out after ${SEARCH_TIMEOUT}ms` 
            : error.response?.data?.error || error.message
            
        errorLog('Search API error after %d ms: %s', performance.now() - startTime, errorMessage)
        return JSON.stringify({ 
            error: 'Failed to perform web search',
            details: errorMessage,
            timeElapsed: Math.round(performance.now() - startTime)
        })
    }
}
