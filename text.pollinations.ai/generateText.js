import { AzureOpenAI } from 'openai';
import { DefaultAzureCredential } from '@azure/identity';
import dotenv from 'dotenv';
import helpSystem from './help.js';

dotenv.config();

const AZURE_OPENAI_API_VERSION = process.env.AZURE_OPENAI_API_VERSION || '2023-03-15-preview';
const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT || 'https://pollinations.openai.azure.com';
const AZURE_OPENAI_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o-mini';

class AzureOpenAIClient {
    constructor() {
        this.credential = new DefaultAzureCredential();
        this.openai = new AzureOpenAI({
            apiVersion: AZURE_OPENAI_API_VERSION,
            azure: {
                apiKey: process.env.AZURE_OPENAI_API_KEY,
                endpoint: AZURE_OPENAI_ENDPOINT,
                deploymentName: AZURE_OPENAI_DEPLOYMENT,
            },
        });
    }

    async generate(messages, options = {}) {
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
            const result = await this.openai.chat.completions.create({
                model: AZURE_OPENAI_DEPLOYMENT,
                messages: processedMessages,
                seed,
                response_format: jsonMode ? { type: 'json_object' } : undefined,
            });

            return result.choices[0]?.message?.content || '';
        } catch (error) {
            console.error('Error generating text:', error);
            throw new Error('Failed to generate text');
        }
    }
}

export default new AzureOpenAIClient();