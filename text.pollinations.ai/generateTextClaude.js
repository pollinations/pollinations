import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const claudeEndpoint = 'https://api.anthropic.com/v1/messages';

async function generateTextClaude(messages, { jsonMode = false, seed = null }) {
    // Check if the total character count of the stringified input is greater than 60000
    const stringifiedMessages = JSON.stringify(messages);
    if (stringifiedMessages.length > 60000) {
        throw new Error('Input messages exceed the character limit of 60000.');
    }

    const { messages: processedMessages, systemMessage } = extractSystemMessage(messages, jsonMode, seed);

    try {
        const convertedMessages = await convertToClaudeFormat(processedMessages);
        const response = await axios.post(claudeEndpoint, {
            model: "claude-3-5-sonnet-20240620",
            max_tokens: 1024,
            messages: convertedMessages,
            system: systemMessage
        }, {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01'
            }
        });

        return response.data.content[0].text;
    } catch (error) {
        console.error('Error calling Claude API:', error.message);
        if (error.response && error.response.data && error.response.data.error) {
            console.error('Error details:', error.response.data.error);
        }
        throw error;
    }
}

function extractSystemMessage(messages, jsonMode, seed) {
    let systemMessage = undefined;
    messages = messages.map(message => {
        if (message.role === 'system') {
            systemMessage = message.content;
            return null;
        }
        return message;
    }).filter(message => message !== null);

    if (jsonMode && !systemMessage) {
        systemMessage = 'Respond in simple JSON format';
    }

    return {
        messages,
        systemMessage: systemMessage
    };
}

async function convertToClaudeFormat(messages) {
    return Promise.all(messages.map(async message => {
        if (Array.isArray(message.content)) {
            const convertedContent = await Promise.all(message.content.map(async item => {
                if (item.type === 'text') {
                    return {
                        type: 'text',
                        text: item.text
                    };
                } else if (item.type === 'image_url') {
                    const imageUrl = item.image_url.url;
                    if (imageUrl.startsWith('data:image/')) {
                        // Handle base64 image
                        const [mediaType, base64Data] = imageUrl.split(',');
                        return {
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: mediaType.split(':')[1].split(';')[0],
                                data: base64Data,
                            }
                        };
                    } else {
                        // Handle URL image
                        try {
                            const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
                            const base64Data = Buffer.from(response.data, 'binary').toString('base64');
                            const mediaType = response.headers['content-type'];
                            return {
                                type: 'image',
                                source: {
                                    type: 'base64',
                                    media_type: mediaType,
                                    data: base64Data,
                                }
                            };
                        } catch (error) {
                            console.error('Error fetching image:', error);
                            throw new Error('Failed to fetch and convert image to base64');
                        }
                    }
                }
            }));
            return {
                role: message.role,
                content: convertedContent
            };
        } else {
            return message;
        }
    }));
}

export default generateTextClaude;