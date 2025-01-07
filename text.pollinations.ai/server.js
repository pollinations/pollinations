import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import crypto from 'crypto';
import debug from 'debug';
import generateTextMistral from './generateTextMistral.js';
import generateTextKarma from './generateTextKarma.js';
import generateTextClaude from './generateTextClaude.js';
import wrapModelWithContext from './wrapModelWithContext.js';
import surSystemPrompt from './personas/sur.js';
import unityPrompt from './personas/unity.js';
import midijourneyPrompt from './personas/midijourney.js';
import rtistPrompt from './personas/rtist.js';
import rateLimit from 'express-rate-limit';
import PQueue from 'p-queue';
import generateTextCommandR from './generateTextCommandR.js';
import sleep from 'await-sleep';
import { availableModels } from './availableModels.js';
import { generateText } from './generateTextOpenai.js';
import { generateText as generateTextRoblox } from './generateTextOpenaiRoblox.js';
import evilPrompt from './personas/evil.js';
import generateTextHuggingface from './generateTextHuggingface.js';
import generateTextOptiLLM from './generateTextOptiLLM.js';
import { generateTextOpenRouter } from './generateTextOpenRouter.js';
import { generateDeepseek } from './generateDeepseek.js';
import { sendToAnalytics } from './sendToAnalytics.js';
const app = express();

const log = debug('pollinations:server');
const errorLog = debug('pollinations:error');

app.use(bodyParser.json({ limit: '5mb' }));
app.use(cors());

// New route handler for root path
app.get('/', (req, res) => {
    res.redirect('https://sur.pollinations.ai');
});

let cache = {};

// Create custom instances of Sur backed by Claude, Mistral, and Command-R
const surOpenai = wrapModelWithContext(surSystemPrompt, generateText);
const surMistral = wrapModelWithContext(surSystemPrompt, generateTextMistral);
// const surCommandR = wrapModelWithContext(surSystemPrompt, generateTextCommandR);
// Create custom instance of Unity backed by Mistral Large
const unityMistralLarge = wrapModelWithContext(unityPrompt, generateTextMistral);
// Create custom instance of Midijourney
const midijourney = wrapModelWithContext(midijourneyPrompt, generateText);
// Create custom instance of Rtist
const rtist = wrapModelWithContext(rtistPrompt, generateText);
// Create custom instance of Evil backed by Command-R
const evilCommandR = wrapModelWithContext(evilPrompt, generateTextMistral);

app.set('trust proxy', true);

// Queue setup per IP address
const queues = new Map();

function getQueue(ip) {
    if (!queues.has(ip)) {
        queues.set(ip, new PQueue({ concurrency: 1 }));
    }
    return queues.get(ip);
}

// Function to get IP address
export function getIp(req) {
    const ip = req.headers["x-bb-ip"] || req.headers["x-nf-client-connection-ip"] || req.headers["x-real-ip"] || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (!ip) return null;
    const ipSegments = ip.split('.').slice(0, 3).join('.');
    return ipSegments;
}

// GET /models request handler
app.get('/models', (req, res) => {
    res.json(availableModels);
});


// SSE endpoint for streaming all responses
app.get('/feed', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    const sendEvent = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Function to handle new responses
    const handleNewResponse = (response, parameters) => {
        sendEvent({ response, parameters });
    };

    // Add the client to a list of connected clients
    const clientId = Date.now();
    connectedClients.set(clientId, handleNewResponse);

    // Remove the client when they disconnect
    req.on('close', () => {
        connectedClients.delete(clientId);
    });
});

// Helper function to handle both GET and POST requests
async function handleRequest(req, res, cacheKeyData, shouldCache = true) {
    const ip = getIp(req);
    const queue = getQueue(ip);

    if (queue.size >= 300) {
        errorLog('Queue size limit exceeded for IP: %s', ip);
        return res.status(429).json({
            error: {
                message: 'Too many requests in queue. Please try again later.',
                status: 429
            }
        });
    }

    const cacheKey = createHashKey(JSON.stringify(cacheKeyData));

    try {
        if (shouldCache && cache[cacheKey]) {
            const cachedResponse = await cache[cacheKey];
            if (cachedResponse instanceof Error) {
                throw cachedResponse;
            }
            log('Cache hit for key: %s', cacheKey);
            return sendResponse(res, cachedResponse);
        }

        log('Request data: %o', cacheKeyData);

        // Send analytics event for text generation request
        sendToAnalytics(req, 'textGenerated', { messages: cacheKeyData.messages, model: cacheKeyData.model, options: cacheKeyData });

        const responsePromise = generateTextBasedOnModel(cacheKeyData.messages, cacheKeyData);

        if (shouldCache) {
            cache[cacheKey] = responsePromise;
        }

        let response;
        try {
            response = await responsePromise;
        } catch (error) {
            errorLog('Error generating text for key %s: %s', cacheKey, error.message);
            delete cache[cacheKey];
            throw error;
        }

        log('Generated response for key: %s', cacheKey);
        sendResponse(res, response);
        await sleep(3000);
    } catch (error) {
        errorLog('Request error for key %s: %s\n%s', cacheKey, error.message, error.stack);
        
        res.status(500).json({
            error: {
                message: error.message || 'An unexpected error occurred while processing your request.',
                status: 500
            }
        });
        await sleep(3000);
    }
}

function sendResponse(res, response) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8'); // Ensure charset is set to utf-8
    res.send(response);
}

// Common function to handle request data
function getRequestData(req, isPost = false) {
    const query = req.query;
    const body = req.body;
    const data = isPost ? { ...query, ...body } : query;

    const jsonMode = data.jsonMode || 
                    (typeof data.json === 'string' && data.json.toLowerCase() === 'true') ||
                    (typeof data.json === 'boolean' && data.json === true) ||
                    data.response_format?.type === 'json_object';
    const seed = data.seed ? parseInt(data.seed, 10) : null;
    const model = data.model || 'openai';
    const systemPrompt = data.system ? data.system : null;
    const temperature = data.temperature ? parseFloat(data.temperature) : undefined;
    const referer = data.referrer || req.get('referrer') || '';
    const isImagePollinationsReferrer = referer.includes('image.pollinations.ai');
    const isRobloxReferrer = req.headers.referer && req.headers.referer.toLowerCase().includes('roblox');
    
    const messages = isPost ? data.messages : [{ role: 'user', content: req.params[0] }];
    if (systemPrompt) {
        messages.unshift({ role: 'system', content: systemPrompt });
    }

    return {
        messages,
        jsonMode,
        seed,
        model,
        temperature,
        type: isPost ? 'POST' : 'GET',
        cache: isPost ? data.cache !== false : true, // Default to true if not specified
        isImagePollinationsReferrer,
        isRobloxReferrer,
        referer: req.headers.referer || ''  // Add the referer to the options
    };
}

// GET request handler
app.get('/*', async (req, res) => {
    const cacheKeyData = getRequestData(req);
    const ip = getIp(req);
    
    if (cacheKeyData.isImagePollinationsReferrer || cacheKeyData.isRobloxReferrer) {
        await handleRequest(req, res, cacheKeyData);
    } else {
        const queue = getQueue(ip);
        await queue.add(() => handleRequest(req, res, cacheKeyData));
    }
});

// POST request handler
app.post('/', async (req, res) => {
    if (!req.body.messages || !Array.isArray(req.body.messages)) {
        console.log('Invalid messages array');
        return res.status(400).send('Invalid messages array');
    }

    const cacheKeyData = getRequestData(req, true);
    const ip = getIp(req);

    if (cacheKeyData.isImagePollinationsReferrer || cacheKeyData.isRobloxReferrer) {
        await handleRequest(req, res, cacheKeyData, cacheKeyData.cache);
    } else {
        const queue = getQueue(ip);
        if (cacheKeyData.cache) {
            await queue.add(() => handleRequest(req, res, cacheKeyData, true));
        } else {
            await handleRequest(req, res, cacheKeyData, false);
        }
    }
});

app.get('/openai/models', (req, res) => {
    const models = availableModels.map(model => ({
        id: model.name,
        object: "model",
        created: Date.now(),
        owned_by: model.name
    }));
    res.json({
        object: "list",
        data: models
    });
});

// POST /openai/* request handler
app.post('/openai*', async (req, res) => {

    // log all request data
    // console.log("request data", JSON.stringify(req.body, null, 2));

    if (!req.body.messages || !Array.isArray(req.body.messages)) {
        console.log('Invalid messages array');
        return res.status(400).send('Invalid messages array');
    }

    const requestParams = getRequestData(req, true);
    const cacheKey = createHashKey(JSON.stringify(requestParams));
    const ip = getIp(req);
    const queue = getQueue(ip);
    const isStream = req.body.stream;
    const run = async () => {

        if (requestParams.cache && cache[cacheKey]) {
            const cachedResponse = await cache[cacheKey];
            if (cachedResponse instanceof Error) {
                throw cachedResponse; // Re-throw the cached error
            }
            return res.json(cachedResponse);
        }

        log("endpoint: /openai", requestParams);

        try {
            // Send analytics event for text generation request
            sendToAnalytics(req, 'textGenerated', { messages: requestParams.messages, model: requestParams.model, options: requestParams });

            const response = await generateTextBasedOnModel(requestParams.messages, requestParams);
            let choices;
            if (isStream) {
                res.setHeader('Content-Type', 'text/event-stream; charset=utf-8'); // Ensure charset is set to utf-8
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');
                res.flushHeaders();
                res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: response }, finish_reason: "stop", index: 0 }] })}\n\n`);
                res.end();
                return;
            } else {
                choices = [{ 
                    "message": { 
                        "content": response, 
                        "role": "assistant" 
                    }, 
                    "finish_reason": "stop", 
                    "index": 0,
                    "logprobs": null
                }];
            }
            const result = {
                "created": Date.now(),
                "id": crypto.randomUUID(),
                "model": requestParams.model,
                "object": isStream ? "chat.completion.chunk" : "chat.completion",
                "choices": choices
            };
            if (requestParams.cache) {
                cache[cacheKey] = result;
            }
            log("openai format result", JSON.stringify(result, null, 2));
            res.setHeader('Content-Type', 'application/json; charset=utf-8'); // Ensure charset is set to utf-8
            res.json(result);
        } catch (error) {
            errorLog('Error generating text', error.message);
            console.error(error.stack); // Print stack trace
            res.status(500).send(error.message);
        }
    };

    // if cache is false, run the request immediately
    if (requestParams.cache) {
        await queue.add(run);
    } else {
        await run();
    }
})

const safeDecodeURIComponent = (str) => {
    try {
        return decodeURIComponent(str);
    } catch (error) {
        return str;
    }
};

// Helper function to create a hash for the cache key
function createHashKey(data) {
    // Ensure the data used for the cache key is deterministic
    const deterministicData = JSON.stringify(JSON.parse(data));
    return crypto.createHash('sha256').update(deterministicData).digest('hex');
}


// Map to store connected clients
const connectedClients = new Map();

// Modified generateTextBasedOnModel to store the response in a variable and broadcast it to all connected clients before returning it
async function generateTextBasedOnModel(messages, options) {
    const model = options.model || 'openai';
    log('Using model:', model);

    try {
        // Check if the request is from Roblox using the referer from options
        const isRoblox = options.isRobloxReferrer || options.referer?.toLowerCase().includes('roblox');
        
        // If it's a Roblox request, always use llamalight model
        if (isRoblox) {
            options.model = 'openai';
        }
        
        let response;
        switch (options.model || 'openai') {
            case 'openai':
                response = await (isRoblox ? generateTextRoblox(messages, options) : generateText(messages, options));
                break;
            case 'deepseek':
                response = await generateDeepseek(messages, options);
                break;
            case 'mistral':
                response = await generateTextMistral(messages, options);
                break;
            case 'llama' || 'qwen' || 'qwen-coder':
                response = await generateTextHuggingface(messages, { ...options, model });
                break;
            case 'llamalight':
                response = await generateTextOpenRouter(messages, { ...options, model: "nousresearch/hermes-2-pro-llama-3-8b" });
                break;
            case 'karma':
                response = await generateTextKarma(messages, options);
                break;
            case 'claude':
                response = await generateTextClaude(messages, options);
                break;
            case 'sur':
                response = await surOpenai(messages, options);
                break;
            case 'sur-mistral':
                response = await surMistral(messages, options);
                break;
            case 'unity':
                response = await unityMistralLarge(messages, options);
                break;
            case 'midijourney':
                response = await midijourney(messages, options);
                break;
            case 'rtist':
                response = await rtist(messages, options);
                break;
            case 'searchgpt':
                response = await generateText(messages, options, true);
                break;
            case 'evil':
                response = await evilCommandR(messages, options);
                break;
            case 'p1':
                response = await generateTextOptiLLM(messages, options);
                break;
            default:
                log('Invalid model specified, falling back to OpenAI');
                response = await generateText(messages, { ...options, model: 'openai' });
        }

        // Broadcast the response to all connected clients
        for (const [_, handleNewResponse] of connectedClients) {
            handleNewResponse(response, { messages, model, ...options });
        }

        return response;
    } catch (error) {
        errorLog('Error generating text', error.message);
        console.error(error.stack);
        throw error;
    }
}

const generateTextWithMistralFallback = async (messages, options) => {
    try {
        return { response: await generateText(messages, options), fallback: false };
    } catch (error) {
        errorLog('Error generating. Trying Mistral fallback', error.message);
        return { response: await generateTextMistral(messages, options), fallback: true };
    }
}

app.use((req, res, next) => {
    log(`Unhandled request: ${req.method} ${req.originalUrl}`);
    next();
});

export default app; // Add this line to export the app instance
