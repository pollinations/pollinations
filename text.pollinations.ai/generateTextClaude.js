import axios from 'axios';
import { createTextGenerator, ensureSystemMessage } from './generateTextBase.js';
import dotenv from 'dotenv';

dotenv.config();

const CLAUDE_MODEL = 'claude-3-5-haiku-20241022';

/**
 * Converts an image to Claude's format
 */
async function convertImage(imageUrl) {
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
}

/**
 * Preprocesses messages for Claude format
 */
async function preprocessMessages(messages, options) {
    // Handle system message
    messages = ensureSystemMessage(messages, 'You are Claude, a helpful AI assistant.');
    const systemMessage = messages.find(m => m.role === 'system')?.content;
    messages = messages.filter(m => m.role !== 'system');

    // Ensure alternating roles
    const alternatingMessages = [];
    let lastRole = null;

    messages.forEach(message => {
        if (lastRole === message.role) {
            alternatingMessages.push({ 
                role: lastRole === 'user' ? 'assistant' : 'user',
                content: '-' 
            });
        }
        alternatingMessages.push(message);
        lastRole = message.role;
    });

    // Ensure first message is from user
    if (alternatingMessages.length === 0 || alternatingMessages[0].role !== 'user') {
        alternatingMessages.unshift({ role: 'user', content: '-' });
    }

    // Convert messages to Claude format
    const convertedMessages = await Promise.all(alternatingMessages.map(async message => {
        if (Array.isArray(message.content)) {
            const convertedContent = await Promise.all(message.content.map(async item => {
                if (item.type === 'text') {
                    return { type: 'text', text: item?.text || '-' };
                }
                if (item.type === 'image_url') {
                    return await convertImage(item.image_url.url);
                }
                return null;
            }));
            return {
                role: message.role,
                content: convertedContent.filter(Boolean)
            };
        }
        return {
            ...message,
            content: message.content || '-'
        };
    }));

    return { messages: convertedMessages, systemMessage };
}

// Create Claude text generator instance
const generateTextClaude = createTextGenerator({
    endpoint: 'https://api.anthropic.com/v1/messages',
    apiKey: process.env.ANTHROPIC_API_KEY,
    defaultModel: CLAUDE_MODEL,
    customHeaders: {
        'anthropic-version': '2023-06-01'
    },
    preprocessor: preprocessMessages,
    customApiCall: async (endpoint, config) => {
        const { body } = config;
        const requestBody = JSON.parse(body);
        const { messages, systemMessage } = await preprocessMessages(requestBody.messages, requestBody);

        const response = await axios.post(endpoint, {
            model: CLAUDE_MODEL,
            messages,
            system: systemMessage,
            max_tokens: requestBody.max_tokens || 8190,
            temperature: requestBody.temperature || 0.7
        }, {
            headers: config.headers
        });

        return {
            choices: [{
                message: {
                    role: 'assistant',
                    content: response.data.content[0]?.text
                },
                finish_reason: 'stop'
            }],
            model: CLAUDE_MODEL,
            created: Date.now(),
            usage: response.data.usage || {}
        };
    }
});

export default generateTextClaude;