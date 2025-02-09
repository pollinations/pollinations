import fetch from 'node-fetch';
import debug from 'debug';

const log = debug('pollinations:cloudflare-gateway');
const errorLog = debug('pollinations:error');

const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_GATEWAY_ID = process.env.CLOUDFLARE_GATEWAY_ID;
const CLOUDFLARE_AUTH_TOKEN = process.env.CLOUDFLARE_AUTH_TOKEN;

const BASE_URL = `https://gateway.ai.cloudflare.com/v1/${CLOUDFLARE_ACCOUNT_ID}/${CLOUDFLARE_GATEWAY_ID}`;

// Map of model names to their provider endpoints
const MODEL_PROVIDERS = {
    'openai': 'openai',
    'openai-large': 'openai',
    'deepseek': 'deepseek',
    'deepseek-reasoner': 'deepseek',
    'mistral': 'mistral',
    'llama': 'workers-ai',
    'llamalight': 'workers-ai',
    'llamaguard': 'workers-ai',
    'claude-hybridspace': 'anthropic',
    'gemini': 'google-ai-studio',
    'gemini-thinking': 'google-ai-studio'
};

// Map of model names to their actual model IDs on respective providers
const MODEL_IDS = {
    'openai': 'gpt-4',
    'openai-large': 'gpt-4',
    'deepseek': 'deepseek-chat',
    'deepseek-reasoner': 'deepseek-reasoner',
    'mistral': 'mistral-large-latest',
    'llama': '@cf/meta/llama-3.1-70b-chat',
    'llamalight': '@cf/meta/llama-3.1-8b-instruct',
    'llamaguard': '@cf/meta/llamaguard-7b',
    'claude-hybridspace': 'claude-3-haiku-20240307',
    'gemini': 'gemini-pro',
    'gemini-thinking': 'gemini-pro'
};

async function generateText(messages, options = {}) {
    const model = options.model || 'openai';
    const provider = MODEL_PROVIDERS[model];
    const modelId = MODEL_IDS[model];

    if (!provider || !modelId) {
        throw new Error(`Unsupported model: ${model}`);
    }

    if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_GATEWAY_ID || !CLOUDFLARE_AUTH_TOKEN) {
        throw new Error('Missing required Cloudflare configuration');
    }

    const endpoint = `${BASE_URL}/${provider}`;
    let url;
    let body;

    // Configure request based on provider
    switch (provider) {
        case 'openai':
        case 'mistral':
        case 'deepseek':
            url = `${endpoint}/v1/chat/completions`;
            body = {
                model: modelId,
                messages,
                temperature: options.temperature || 0.7,
                stream: options.stream || false
            };
            break;

        case 'workers-ai':
            url = `${endpoint}/${modelId}`;
            body = {
                messages,
                temperature: options.temperature || 0.7,
                stream: options.stream || false
            };
            break;

        case 'anthropic':
            url = `${endpoint}/v1/messages`;
            body = {
                model: modelId,
                messages,
                max_tokens: 1024,
                temperature: options.temperature || 0.7,
                stream: options.stream || false
            };
            break;

        case 'google-ai-studio':
            url = `${endpoint}/v1/models/${modelId}:generateContent`;
            body = {
                contents: messages.map(msg => ({
                    role: msg.role,
                    parts: [{ text: msg.content }]
                })),
                generationConfig: {
                    temperature: options.temperature || 0.7
                }
            };
            break;

        default:
            throw new Error(`Unsupported provider: ${provider}`);
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${CLOUDFLARE_AUTH_TOKEN}`
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`API request failed: ${JSON.stringify(error)}`);
        }

        const data = await response.json();

        // Normalize response to OpenAI format
        return normalizeResponse(data, provider, model);
    } catch (error) {
        errorLog('Error in generateText:', error);
        throw error;
    }
}

function normalizeResponse(data, provider, model) {
    // Default OpenAI-like response structure
    const normalized = {
        id: `pllns_${Date.now()}`,
        object: 'chat.completion',
        created: Date.now(),
        model: model,
        choices: [],
        usage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0
        }
    };

    switch (provider) {
        case 'openai':
        case 'mistral':
        case 'deepseek':
            // Already in OpenAI format
            return data;

        case 'workers-ai':
            normalized.choices = [{
                index: 0,
                message: {
                    role: 'assistant',
                    content: data.response
                },
                finish_reason: 'stop'
            }];
            break;

        case 'anthropic':
            normalized.choices = [{
                index: 0,
                message: {
                    role: 'assistant',
                    content: data.content[0].text
                },
                finish_reason: data.stop_reason || 'stop'
            }];
            if (data.usage) {
                normalized.usage = data.usage;
            }
            break;

        case 'google-ai-studio':
            normalized.choices = [{
                index: 0,
                message: {
                    role: 'assistant',
                    content: data.candidates[0].content.parts[0].text
                },
                finish_reason: 'stop'
            }];
            break;
    }

    return normalized;
}

export { generateText };
