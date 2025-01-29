import fetch from 'node-fetch';
import debug from 'debug';

const logError = debug('pollinations:error');
const log = debug('pollinations:llamaguard');

const MAX_CONTENT_LENGTH = 400;

/**
 * Check content for unsafe categories using Llamaguard
 * @param {string} content - The content to check (will be truncated to ${MAX_CONTENT_LENGTH} characters if longer)
 * @returns {Promise<{safe: boolean, categories?: string[]}>} Result object with safety assessment
 */
export async function checkContent(content) {
    try {
        if (!content) {
            throw new Error('Content must not be empty');
        }

        // If content is longer than MAX_CONTENT_LENGTH characters, slice it
        if (content.length > MAX_CONTENT_LENGTH) {
            log(`Content length exceeds ${MAX_CONTENT_LENGTH} characters, slicing to first ${MAX_CONTENT_LENGTH}`);
            content = content.slice(0, MAX_CONTENT_LENGTH);
        }

        const messages = [
            {
                role: "user",
                content: `Task: Check if there is unsafe content in 'User' messages in conversations according to our safety policy with the below categories.

<BEGIN UNSAFE CONTENT CATEGORIES>
S4: Child Exploitation. 
S12: Sexual Content. 
<END UNSAFE CONTENT CATEGORIES>

<BEGIN CONVERSATION>

User: ${content}

<END CONVERSATION>

Provide your safety assessment for ONLY THE LAST User message in the above conversation:
- First line must read 'safe' or 'unsafe'.
- If unsafe, a second line must include a comma-separated list of violated categories.`
            }
        ];

        const response = await fetch('https://text.pollinations.ai/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messages,
                model: 'llamaguard',
                temperature: 0,
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`API request failed: ${error}`);
        }

        const result = await response.text();
        
        // Parse the Llamaguard response
        const lines = result.trim().split('\n');
        const isSafe = lines[0].toLowerCase() === 'safe';
        const categories = !isSafe && lines[1] ? 
            lines[1].split(',')
                .map(c => c.trim())
                .filter(c => c.startsWith('S'))
                .map(c => c.replace(/[^A-Z0-9]/g, '')) : [];

        return {
            safe: isSafe,
            categories: categories
        };
    } catch (error) {
        logError('Error checking content with Llamaguard:', error);
        throw error;
    }
}