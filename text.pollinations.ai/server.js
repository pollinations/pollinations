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
import { generateTextScaleway } from './generateTextScaleway.js';
import { sendToAnalytics } from './sendToAnalytics.js';
import fs from 'fs';
import path from 'path';

const app = express();

const log = debug('pollinations:server');
const errorLog = debug('pollinations:error');

// Remove the custom JSON parsing middleware and use the standard bodyParser
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
async function handleRequest(req, res, requestData) {
    const ip = getIp(req);
    const queue = getQueue(ip);

    if (queue.size >= 30) {
        errorLog('Queue size limit exceeded for IP: %s', ip);
        return res.status(429).json({
            error: {
                message: 'Too many requests in queue. Please try again later.',
                status: 429
            }
        });
    }

    log('Request data: %o', requestData);

    // Send analytics event for text generation request
    sendToAnalytics(req, 'textGenerated', { messages: requestData.messages, model: requestData.model, options: requestData });

    try {
        const response = await generateTextBasedOnModel(requestData.messages, requestData);
        const cacheKey = createHashKey(requestData);
        cache[cacheKey] = response;
        log('Generated response', response);
        
        // Broadcast the response to all connected clients
        connectedClients.forEach((handler) => {
            handler(response, requestData);
        });
        
        sendResponse(res, response);
        await sleep(10000);
    } catch (error) {
        errorLog('Error generating text: %s', error.message);
        res.status(500).json({
            error: {
                message: error.message,
                status: 500
            }
        });
        await sleep(5000);
    }
}

function sendResponse(res, response) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8'); // Ensure charset is set to utf-8
    res.send(response);
}

// Common function to handle request data
function getRequestData(req) {
    const query = req.query;
    const body = req.body || {};
    const data = { ...query, ...body };

    const jsonMode = data.jsonMode || 
                    (typeof data.json === 'string' && data.json.toLowerCase() === 'true') ||
                    (typeof data.json === 'boolean' && data.json === true) ||
                    data.response_format?.type === 'json_object';
                    
    const seed = data.seed ? parseInt(data.seed, 10) : null;
    const model = data.model || 'openai';
    const systemPrompt = data.system ? data.system : null;
    const temperature = data.temperature ? parseFloat(data.temperature) : undefined;
    // Try request body first (both spellings), then HTTP header (standard spelling)
    const referrer = req.headers.referer || data.referrer || data.referer || req.get('referrer') || req.get('referer') || 'undefined';
    const isImagePollinationsReferrer = referrer.includes('image.pollinations.ai');
    const isRobloxReferrer = referrer.toLowerCase().includes('roblox');
    
    const messages =  data.messages ||  [{ role: 'user', content: req.params[0] }];
    if (systemPrompt) {
        messages.unshift({ role: 'system', content: systemPrompt });
    }

    return {
        messages,
        jsonMode,
        seed,
        model,
        temperature,
        isImagePollinationsReferrer,
        isRobloxReferrer,
        referrer
    };
}

// Helper function to process requests with queueing and caching logic
async function processRequest(req, res, requestData) {

    const cacheKey = createHashKey(requestData);

    const cachedResponse = await getCache(cacheKey);
    
    if (cachedResponse) {
        return sendResponse(res, cachedResponse);
    }

    const ip = getIp(req);
    const bypassQueue = requestData.isImagePollinationsReferrer || requestData.isRobloxReferrer;

    if (bypassQueue) {
        await handleRequest(req, res, requestData);
    } else {
        const queue = getQueue(ip);
        await queue.add(() => handleRequest(req, res, requestData));
    }
}

// GET request handler
app.get('/*', async (req, res) => {
    const requestData = getRequestData(req);
    await processRequest(req, res, requestData);
});

// POST request handler
app.post('/', async (req, res) => {
    if (!req.body.messages || !Array.isArray(req.body.messages)) {
        console.log('Invalid messages array. Received:', req.body.messages);
        return res.status(400).send('Invalid messages array. Received: ' + req.body.messages);
    }

    const cacheKeyData = getRequestData(req, true);
    try {
        await processRequest(req, res, cacheKeyData);
    } catch (error) {
        errorLog('Error processing request', error.message);
        console.error(error.stack); // Print stack trace
        return res.status(500).send(error.message);
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
    const cacheKey = createHashKey(requestParams);
    const cachedResponse = await getCache(cacheKey);
    if (cachedResponse) {
        return res.json(cachedResponse);
    }

    const ip = getIp(req);
    const queue = getQueue(ip);
    const isStream = req.body.stream;


    const run = async () => {

        log("endpoint: /openai", requestParams);

        try {
            // Send analytics event for text generation request
            sendToAnalytics(req, 'textGenerated', { messages: requestParams.messages, model: requestParams.model, options: requestParams });

            const response = await generateTextBasedOnModel(requestParams.messages, requestParams);
            cache[cacheKey] = response;
            
            let choices;
            if (isStream) {
                res.setHeader('Content-Type', 'text/event-stream; charset=utf-8'); // Ensure charset is set to utf-8
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');
                res.flushHeaders();
                res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: response }, finish_reason: "stop", index: 0 }] })}\n\n`);
                res.end();
                await sleep(10000);
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
            cache[cacheKey] = result;
            log("openai format result", JSON.stringify(result, null, 2));
            res.setHeader('Content-Type', 'application/json; charset=utf-8'); // Ensure charset is set to utf-8
            res.json(result);
            await sleep(10000);
            return;
        } catch (error) {
            errorLog('Error generating text', error.message);
            console.error(error.stack); // Print stack trace
            res.status(500).send(error.message);
            await sleep(5000);
            return;
        }
    };
    try {
        await queue.add(run);
    } catch (error) {
        errorLog('Error processing request', error.message);
        console.error(error.stack); // Print stack trace
        res.status(500).send(error.message);
        await sleep(5000);
        return;
    }
})

// Helper function to get response from cache
function getCache(cacheKey) {
    return cache[cacheKey] || null;
}

// Helper function to create a hash for the cache key
function createHashKey(data) {
    // Ensure the data used for the cache key is deterministic
    const deterministicData = JSON.parse(JSON.stringify(data));
    return crypto.createHash('sha256').update(JSON.stringify(deterministicData)).digest('hex');
}

// Map to store connected clients
const connectedClients = new Map();

async function generateTextBasedOnModel(messages, options) {
    const model = options.model || 'openai';
    log('Using model:', model);

    try {
        // If it's a Roblox request, always use openai model
        if (options.isRobloxReferrer) {
            options.model = 'openai';
        }
        
        const modelHandlers = {
            'deepseek': () => generateDeepseek(messages, options),
            'mistral': () => generateTextScaleway(messages, options),
            'qwen-coder': () => generateTextScaleway(messages, options),
            'qwen': () => generateTextHuggingface(messages, { ...options, model }),
            'llama': () => generateTextScaleway(messages, { ...options, model }),
            'llamalight': () => generateTextOpenRouter(messages, { ...options, model: "nousresearch/hermes-2-pro-llama-3-8b" }),
            // 'karma': () => generateTextKarma(messages, options),
            'sur': () => surOpenai(messages, options),
            'sur-mistral': () => surMistral(messages, options),
            'unity': () => unityMistralLarge(messages, options),
            'midijourney': () => midijourney(messages, options),
            'rtist': () => rtist(messages, options),
            'searchgpt': () => generateText(messages, options, true),
            'evil': () => evilCommandR(messages, options)
        };

        const handler = modelHandlers[model] || (() => generateText(messages, options));
        const response = await handler();
        
        // Broadcast the response to all connected clients
        for (const [_, handleNewResponse] of connectedClients) {
            console.log('broadcasting response', response, "to", connectedClients.size );
            handleNewResponse(response, { messages, model, ...options });
        }
        
        return response;
    } catch (error) {
        errorLog('Error in generateTextBasedOnModel:', error);
        throw error;
    }
}

app.use((req, res, next) => {
    log(`Unhandled request: ${req.method} ${req.originalUrl}`);
    next();
});

export default app; // Add this line to export the app instance
