import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const llamaEndpoint = process.env.AZURE_LLAMA_ENDPOINT + process.env.AZURE_LLAMA_CHAT_COMPLETION_ROUTE;

async function generateTextLlama(messages, { jsonMode = false }) {
    // Check if the total character count of the stringified input is greater than 60000
    const stringifiedMessages = JSON.stringify(messages);
    if (stringifiedMessages.length > 60000) {
        throw new Error('Input messages exceed the character limit of 60000.');
    }

    // if json mode is activated and there is no system message, prepend the system message
    if (jsonMode && !hasSystemMessage(messages)) {
        messages = [{ role: 'system', content: 'Respond in simple JSON format' }, ...messages];
    }

    try {
        const response = await axios.post(llamaEndpoint, {
            messages,
            max_tokens: 800,
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.AZURE_LLAMA_API_KEY}`
            }
        });

        return response.data.choices[0].message.content;
    } catch (error) {
        if (error.response && error.response.status === 400 && error.response.data.status === 'Auth token must be passed as a header called Authorization') {
            console.error('Authentication error: Invalid or missing Authorization header');
            throw new Error('Authentication failed: Please check your API key and ensure it\'s correctly set in the Authorization header');
        }
        console.error('Error calling Llama API:', error.message);
        if (error.response && error.response.data && error.response.data.error) {
            console.error('Error details:', error.response.data.error);
        }
        throw error;
    }
}

function hasSystemMessage(messages) {
    return messages.some(message => message.role === 'system');
}

export default generateTextLlama;