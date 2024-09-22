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

    // If json mode is activated and there is no system message, prepend the system message
    if (jsonMode && !hasSystemMessage(messages)) {
        messages = [{ role: 'system', content: 'Respond in simple JSON format' }, ...messages];
    }

    try {
        const response = await axios.post(claudeEndpoint, {
            model: "claude-3-5-sonnet-20240620",
            max_tokens: 1024,
            messages: messages,
            system: seed ? `Use ${seed} as your random seed.` : undefined
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

function hasSystemMessage(messages) {
    return messages.some(message => message.role === 'system');
}

export default generateTextClaude;