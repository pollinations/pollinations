import { AzureOpenAI } from 'openai';
import { DefaultAzureCredential } from '@azure/identity';
import dotenv from 'dotenv';
import helpSystem from './help.js';

dotenv.config();

const openai = new AzureOpenAI({
    apiVersion: process.env.AZURE_OPENAI_API_VERSION || "2024-08-01-preview",
    endpoint: process.env.AZURE_OPENAI_ENDPOINT || "https://pollinations.openai.azure.com/openai/deployments/gpt-4o-mini/chat/completions?api-version=2024-08-01-preview",
    apiKey: process.env.AZURE_OPENAI_API_KEY,
});

export const generate = async (messages, options = {}) => {
    const { seed = null, jsonMode = false, isHelp = false } = options;

    let processedMessages = [...messages];

    if (isHelp) {
        try {
            let helpMessages = helpSystem;

            if (jsonMode && helpMessages.length > 0 && helpMessages[0].role === 'system') {
                helpMessages[0].content += '\n Respond in simple JSON format';
            } else if (jsonMode) {
                helpMessages.unshift({ role: 'system', content: 'Respond in simple JSON format' });
            }

            processedMessages = helpMessages;
        } catch (error) {
            console.error('Error loading help messages:', error);
            throw new Error('Failed to load help messages');
        }
    } else if (jsonMode) {
        processedMessages.unshift({ role: 'system', content: 'Respond in simple JSON format' });
    }

    try {
        const result = await openai.chat.completions.create({
            model: process.env.AZURE_OPENAI_MODEL || 'gpt-4o-mini',
            messages: processedMessages,
            seed,
            response_format: jsonMode ? { type: 'json_object' } : undefined,
        });

        return result.choices[0]?.message?.content || '';
    } catch (error) {
        console.error('Error generating text:', error);
        throw new Error('Failed to generate text');
    }
};

