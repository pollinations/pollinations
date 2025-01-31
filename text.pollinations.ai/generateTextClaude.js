import axios from 'axios';
import dotenv from 'dotenv';
import { setupLogging, handleSystemMessage, createRequestBody, standardizeResponse } from './src/utils.js';

dotenv.config();

const { log, errorLog } = setupLogging('claude');

const claudeEndpoint = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = "claude-3-5-haiku-20241022";

/**
 * Ensures messages alternate between user and assistant roles
 * @param {Array} messages - Array of messages
 * @returns {Array} Messages with alternating roles
 */
function ensureAlternatingRoles(messages) {
    const alternatingMessages = [];
    let lastRole = null;

    messages.forEach(message => {
        if (lastRole === message.role) {
            const alternateRole = lastRole === 'user' ? 'assistant' : 'user';
            alternatingMessages.push({ role: alternateRole, content: '-' });
        }
        alternatingMessages.push(message);
        lastRole = message.role;
    });

    // Ensure the first message is a user message
    if (alternatingMessages.length === 0 || alternatingMessages[0].role !== 'user') {
        alternatingMessages.unshift({ role: 'user', content: '-' });
    }

    return alternatingMessages;
}

/**
 * Converts messages to Claude's format, handling text and images
 * @param {Array} messages - Array of messages to convert
 * @returns {Promise<Array>} Converted messages in Claude format
 */
async function convertToClaudeFormat(messages) {
    return Promise.all(messages.map(async message => {
        if (Array.isArray(message.content)) {
            const convertedContent = await Promise.all(message.content.map(async item => {
                if (item.type === 'text') {
                    return {
                        type: 'text',
                        text: item?.text || '-'
                    };
                } else if (item.type === 'image_url') {
                    return await convertImageToClaudeFormat(item.image_url.url);
                }
            }));
            return {
                role: message.role,
                content: convertedContent
            };
        }
        return {
            ...message,
            content: message.content || '-'
        };
    }));
}

/**
 * Converts an image URL or base64 to Claude's format
 * @param {string} imageUrl - URL or base64 string of the image
 * @returns {Promise<Object>} Image in Claude format
 */
async function convertImageToClaudeFormat(imageUrl) {
    if (imageUrl.startsWith('data:image/')) {
        const [mediaType, base64Data] = imageUrl.split(',');
        return {
            type: 'image',
            source: {
                type: 'base64',
                media_type: mediaType.split(':')[1].split(';')[0],
                data: base64Data,
            }
        };
    }

    try {
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const base64Data = Buffer.from(response.data, 'binary').toString('base64');
        return {
            type: 'image',
            source: {
                type: 'base64',
                media_type: response.headers['content-type'],
                data: base64Data,
            }
        };
    } catch (error) {
        errorLog('Error fetching image: %s', error);
        throw new Error('Failed to fetch and convert image to base64');
    }
}

async function generateTextClaude(messages, options = {}) {
    const requestId = Math.random().toString(36).substring(7);
    const startTime = Date.now();

    log(`[${requestId}] Starting text generation request`, {
        messageCount: messages.length,
        options
    });

    try {
        // Handle system messages
        messages = handleSystemMessage(messages, options, 'You are Claude, a helpful AI assistant.');
        
        // Extract system message for Claude's specific format
        const systemMessage = messages.find(m => m.role === 'system')?.content;
        messages = messages.filter(m => m.role !== 'system');

        // Ensure alternating roles and convert to Claude format
        const alternatingMessages = ensureAlternatingRoles(messages);
        const convertedMessages = await convertToClaudeFormat(alternatingMessages);

        // Create request body with Claude-specific adjustments
        const requestBody = {
            model: CLAUDE_MODEL,
            max_tokens: options.max_tokens || 8190,
            messages: convertedMessages,
            system: systemMessage,
            temperature: options.temperature || 0.7
        };

        log(`[${requestId}] Sending request to Claude API`, {
            model: CLAUDE_MODEL,
            maxTokens: requestBody.max_tokens,
            temperature: requestBody.temperature
        });

        const response = await axios.post(claudeEndpoint, requestBody, {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01'
            }
        });

        const completionTime = Date.now() - startTime;
        log(`[${requestId}] Successfully generated text`, {
            completionTimeMs: completionTime,
            modelUsed: CLAUDE_MODEL
        });

        // Standardize the response format
        return standardizeResponse({
            choices: [{
                message: {
                    role: 'assistant',
                    content: response.data.content[0]?.text
                },
                finish_reason: 'stop'
            }],
            model: CLAUDE_MODEL,
            created: Math.floor(startTime / 1000),
            usage: response.data.usage || {}
        }, 'Claude');
    } catch (error) {
        errorLog(`[${requestId}] Error in text generation`, {
            error: error.message,
            stack: error.stack,
            completionTimeMs: Date.now() - startTime
        });

        return standardizeResponse({
            error: {
                message: error.response?.data?.error?.message || error.message,
                code: error.response?.status || 500
            }
        }, 'Claude');
    }
}

export default generateTextClaude;