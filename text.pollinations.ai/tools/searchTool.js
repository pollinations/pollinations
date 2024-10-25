import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const BING_SEARCH_ENDPOINT = 'https://api.bing.microsoft.com/v7.0/search';
const BING_API_KEY = process.env.BING_API_KEY;

export const searchToolDefinition = {
    type: "function",
    function: {
        name: "web_search",
        description: "Search the web for current information about a topic. Try to get as many results as possible (minimum 20, maximum 100).",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "The search query"
                },
                num_results: {
                    type: "number",
                    description: "Number of results to return (min 20, max 100)",
                    default: 20
                }
            },
            required: ["query"]
        }
    }
};

export async function performWebSearch({ query, num_results = 20 }) {
    try {
        console.log("Performing web search with query", query, "and num_results", num_results);
        const response = await axios.get(BING_SEARCH_ENDPOINT, {
            params: { q: query, count: num_results },
            headers: { "Ocp-Apim-Subscription-Key": BING_API_KEY }
        });

        console.log("Bing search response", JSON.stringify(response.data, null, 2));

        const results = response.data.webPages.value
            // .slice(0, Math.min(num_results, 20))
            .map(result => ({
                title: result.name,
                snippet: result.snippet,
                url: result.url
            }));
        console.log("Search results", JSON.stringify(results, null, 2));
        return JSON.stringify(results);
    } catch (error) {
        console.error('Search API error:', error);
        return JSON.stringify({ error: 'Failed to perform web search' });
    }
}
