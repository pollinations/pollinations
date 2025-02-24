import { generateText } from './generateTextOpenai.js';
import debug from 'debug';

const log = debug('pollinations:search');
const errorLog = debug('pollinations:search:error');

/**
 * Generates text with search capabilities using OpenAI's function calling
 * This is a wrapper around the vanilla OpenAI call that enables web search and scraping
 * 
 * @param {Array} messages - Array of message objects
 * @param {Object} options - Options for text generation
 * @returns {Object} - OpenAI-compatible response
 */
export async function generateTextSearch(messages, options = {}) {
    try {
        log('Generating text with search capabilities');
        
        // Set the system message for search if not already present
        const hasSystemMessage = messages.some(message => message.role === 'system');
        if (!hasSystemMessage) {
            messages = [
                { 
                    role: 'system', 
                    content: 'You are Polly, Pollinations.AI helpful search assistant. You can search the web for old and current information.' 
                }, 
                ...messages
            ];
        }
        
        // Use the OpenAI large model for search by default
        const searchOptions = {
            ...options,
            model: options.model || 'openai-large'
        };
        
        // Call the vanilla OpenAI function with search enabled
        const completion = await generateText(messages, searchOptions, true);
        
        return completion;
    } catch (error) {
        errorLog('Error in generateTextSearch:', error);
        throw error;
    }
}

export default generateTextSearch;