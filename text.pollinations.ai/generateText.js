import { AzureOpenAI } from 'openai';
import { getBearerTokenProvider, DefaultAzureCredential } from '@azure/identity';
import dotenv from 'dotenv';

dotenv.config();

const credential = new DefaultAzureCredential();
const scope = 'https://cognitiveservices.azure.com/.default';
const azureADTokenProvider = getBearerTokenProvider(credential, scope);

const openai = new AzureOpenAI({
    apiVersion: process.env.AZURE_OPENAI_API_VERSION,
    endpoint: "https://pollinations.openai.azure.com/openai/deployments/gpt-4o-mini/chat/completions?api-version=2023-03-15-preview",
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    deployment: '/deployments/gpt-4o-mini/chat/completions?api-version=2023-03-15-preview'
});

async function generateText(messages, seed = null) {
    const result = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        seed
    });

    return result.choices[0]?.message?.content;
}

export default generateText;