import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import crypto from 'crypto';
import debug from 'debug';
import { promises as fs } from 'fs';
import path from 'path';
import wrapModelWithContext from './wrapModelWithContext.js';
import surSystemPrompt from './personas/sur.js';
import unityPrompt from './personas/unity.js';
import midijourneyPrompt from './personas/midijourney.js';
import rtistPrompt from './personas/rtist.js';
import rateLimit from 'express-rate-limit';
import PQueue from 'p-queue';
import sleep from 'await-sleep';
import { availableModels } from './availableModels.js';
import { generateText } from './generateTextCloudflareGateway.js';
import evilPrompt from './personas/evil.js';
import { sendToAnalytics } from './sendToAnalytics.js';
import { setupFeedEndpoint, sendToFeedListeners } from './feed.js';
import { getFromCache, setInCache, createHashKey } from './cache.js';

const BANNED_PHRASES = [
    "600-800 words"
];

const WHITELISTED_DOMAINS = [
    'pollinations',
    'thot',
    'ai-ministries.com',
    'localhost',
    'pollinations.github.io',
    '127.0.0.1',
];

const blockedIPs = new Set();

async function blockIP(ip) {
    // Only proceed if IP isn't already blocked
    if (!blockedIPs.has(ip)) {
        blockedIPs.add(ip);
        log('IP blocked:', ip);
        
        try {
            // Append IP to log file with newline
            await fs.appendFile(BLOCKED_IPS_LOG, `${ip}\n`, 'utf8');
        } catch (error) {
            errorLog('Failed to write blocked IP to log file:', error);
        }
    }
}

function isIPBlocked(ip) {
    return blockedIPs.has(ip);
}

async function checkBannedPhrases(messages, ip) {
    const messagesString = JSON.stringify(messages).toLowerCase();
    for (const phrase of BANNED_PHRASES) {
        if (messagesString.includes(phrase.toLowerCase())) {
            await blockIP(ip);
            throw new Error(`Message contains banned phrase. IP has been blocked.`);
        }
    }
}

const app = express();

const log = debug('pollinations:server');
const errorLog = debug('pollinations:error');
const BLOCKED_IPS_LOG = path.join(process.cwd(), 'blocked_ips.txt');

// Load blocked IPs from file on startup
async function loadBlockedIPs() {
    try {
        const data = await fs.readFile(BLOCKED_IPS_LOG, 'utf8');
        const ips = data.split('\n').filter(ip => ip.trim());
        for (const ip of ips) {
            blockedIPs.add(ip.trim());
        }
        log(`Loaded ${blockedIPs.size} blocked IPs from file`);
    } catch (error) {
        if (error.code !== 'ENOENT') {
            errorLog('Error loading blocked IPs:', error);
        }
    }
}

// Load blocked IPs before starting server
loadBlockedIPs().catch(error => {
    errorLog('Failed to load blocked IPs:', error);
});

// Middleware to block IPs
app.use((req, res, next) => {
    const ip = getIp(req);
    if (isIPBlocked(ip)) {
        return res.status(403).end();
    }
    next();
});

// Remove the custom JSON parsing middleware and use the standard bodyParser
app.use(bodyParser.json({ limit: '5mb' }));
app.use(cors());

// // Rate limiting setup
// const limiter = rateLimit({
//     windowMs: 60 * 1000, // 1 minute
//     max: 200, // 40 requests per windowMs
//     message: {
//         error: {
//             type: 'rate_limit_error',
//             message: 'Rate limit exceeded. Maximum 40 requests per minute.',
//             suggestion: 'Please wait before making more requests.'
//         }
//     },
//     skip: (req) => {
//         const requestData = getRequestData(req);
//         return requestData.isRobloxReferrer;
//     },
//     // Use X-Forwarded-For header but validate it's from our trusted proxy
//     trustProxy: false
// });

// Apply rate limiting to all routes
// app.use(limiter);

// New route handler for root path
app.get('/', (req, res) => {
    res.redirect('https://sur.pollinations.ai');
});


// Create custom instances with system prompts
const surOpenai = wrapModelWithContext(surSystemPrompt, generateText, "openai");
const surMistral = wrapModelWithContext(surSystemPrompt, generateText, "mistral");
const unityMistralLarge = wrapModelWithContext(unityPrompt, generateText, "mistral");
const midijourney = wrapModelWithContext(midijourneyPrompt, generateText, "openai");
const rtist = wrapModelWithContext(rtistPrompt, generateText, "openai");
const evilCommandR = wrapModelWithContext(evilPrompt, generateText, "mistral");

app.set('trust proxy', true);

// Queue setup per IP address
const queues = new Map();

export function getQueue(ip) {
    if (!queues.has(ip)) {
        queues.set(ip, new PQueue({ concurrency: 1, interval: 3000, intervalCap: 1 }));
    }
    return queues.get(ip);
}

// Function to get IP address
export function getIp(req) {
    const ip = req.headers["x-bb-ip"] || req.headers["x-nf-client-connection-ip"] || req.headers["x-real-ip"] || req.headers['x-forwarded-for'] || req.headers['referer'] || req.socket.remoteAddress;
    if (!ip) return null;
    const ipSegments = ip.split('.').slice(0, 3).join('.');
    // if (ipSegments === "128.116")
    //     throw new Error('Pollinations cloud credits exceeded. Please try again later.');
    return ipSegments;
}

// GET /models request handler
app.get('/models', (req, res) => {
    res.json(availableModels);
});

setupFeedEndpoint(app);

// Helper function to handle both GET and POST requests
async function handleRequest(req, res, requestData) {

    log('Request: model=%s referrer=%s', requestData.model, requestData.referrer);
    log('Request data: %s', JSON.stringify(requestData, null, 2));

    try {
        // Generate a unique ID for this request
        const requestId = generatePollinationsId();
        const completion = await generateTextBasedOnModel(requestData.messages, requestData);
        log("completion: %s", JSON.stringify(completion, null, 2));
        
        // Ensure completion has the request ID
        completion.id = requestId;
        
        // Check if completion contains an error
        if (completion.error) {
            errorLog('Completion error details: %s', JSON.stringify(completion.error, null, 2));
            throw new Error(JSON.stringify(completion.error));
        }
        
        const responseText = completion.choices[0].message.content;

        const cacheKey = createHashKey(requestData);
        setInCache(cacheKey, completion);
        log('Generated response', responseText);
        
        // Extract token usage data
        const tokenUsage = completion.usage || {};
        
        // only send if not roblox, not private, and not from image pollinations
        if (!shouldBypassDelay(req) && !requestData.isImagePollinationsReferrer && !requestData.isPrivate) {
            sendToFeedListeners(responseText, {
                ...requestData,
                ...tokenUsage
            }, getIp(req));
        }
        
        // Track successful completion with token usage
        await sendToAnalytics(req, 'textGenerated', {
            ...requestData,
            success: true,
            cached: false,
            responseLength: responseText?.length,
            streamMode: requestData.stream,
            plainTextMode: requestData.plaintTextResponse,
            ...tokenUsage
        });

        if (requestData.stream) {
            sendAsOpenAIStream(res, completion);
        } else {
            if (requestData.plaintTextResponse) {
                sendContentResponse(res, completion);
            } else {
                sendOpenAIResponse(res, completion);
            }
        }
    } catch (error) {
        sendErrorResponse(res, req, error, requestData);
    }
    // if (!shouldBypassDelay(req)) {
    //     await sleep(3000);
    // }
}

// Function to check if delay should be bypassed
export function shouldBypassDelay(req) {
    const requestData = getRequestData(req);
    return requestData.isRobloxReferrer;
}

// Helper function for consistent error responses
export async function sendErrorResponse(res, req, error, requestData, statusCode = 500) {
    const errorResponse = {
        error: error.message || 'An error occurred',
        status: statusCode
    };

    if (error.response?.data) {
        errorResponse.details = error.response.data;
    }

    errorLog('Error occurred: %O', errorResponse);
    errorLog('Stack trace: %s', error.stack);

    // Log detailed error information to stderr
    // console.error('Error occurred:', JSON.stringify(errorResponse, null, 2));
    // console.error('Stack trace:', error.stack);

    // Track error event
    await sendToAnalytics(req, 'textGenerationError', {
        error: error.message,
        errorType: error.name,
        errorCode: error.code,
        statusCode,
        model: requestData?.model
    });

    res.status(statusCode).json(errorResponse);
}

// Generate a unique ID with pllns_ prefix
function generatePollinationsId() {
    const hash = crypto.randomBytes(16).toString('hex');
    return `pllns_${hash}`;
}

// Helper function for consistent success responses
export function sendOpenAIResponse(res, completion) {
    // Ensure completion has required OpenAI API fields
    if (!completion.id || !completion.id.startsWith('pllns_')) {
        completion.id = generatePollinationsId();
    }
    if (!completion.object) {
        completion.object = "chat.completion";
    }
    
    // Ensure choices array has index field
    if (completion.choices && Array.isArray(completion.choices)) {
        completion.choices = completion.choices.map((choice, idx) => ({
            index: idx,
            ...choice
        }));
    }
    
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.json(completion);
}

export function sendContentResponse(res, completion) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(completion.choices[0].message.content);
}

// Common function to handle request data
export function getRequestData(req) {
    const query = req.query || {};
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
    const isPrivate = data.private === true || 
                     (typeof data.private === 'string' && data.private.toLowerCase() === 'true');

    const referrer = getReferrer(req, data);
    const isImagePollinationsReferrer = WHITELISTED_DOMAINS.some(domain => referrer.toLowerCase().includes(domain));
    const isRobloxReferrer = referrer.toLowerCase().includes('roblox');
    const stream = data.stream || false; 

    const messages = data.messages || [{ role: 'user', content: req.params[0] }];
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
        referrer,
        stream,
        isPrivate
    };
}

// Helper function to get referrer from request
export function getReferrer(req, data) {
    const referer = req.headers.referer || req.headers.referrer || data.referrer || 'unknown';
    return referer;
}

// Helper function to process requests with queueing and caching logic
export async function processRequest(req, res, requestData) {
    const ip = getIp(req);
    
    // Check for banned phrases first
    try {
        await checkBannedPhrases(requestData.messages, ip);
    } catch (error) {
        return sendErrorResponse(res, req, error, requestData, 403);
    }

    const cacheKey = createHashKey(requestData);

    // Check cache first
    const cachedResponse = getFromCache(cacheKey);
    if (cachedResponse) {
        log('Cache hit for key:', cacheKey);
        
        // Extract token usage data from cached response
        const cachedTokenUsage = cachedResponse.usage || {};
        
        // Track cache hit in analytics with token usage
        await sendToAnalytics(req, 'textCached', {
            ...requestData,
            success: true,
            cached: true,
            responseLength: cachedResponse?.choices?.[0]?.message?.content?.length,
            streamMode: requestData.stream,
            plainTextMode: requestData.plaintTextResponse,
            cacheKey: cacheKey,
            ...cachedTokenUsage
        });

        if (requestData.plaintTextResponse) {
            sendContentResponse(res, cachedResponse);
        } else {
            log('Cache hit for key:', cacheKey);
            if (requestData.stream) {
                sendAsOpenAIStream(res, cachedResponse);
            }
            else {
                sendOpenAIResponse(res, cachedResponse);
            }
        }
        return;
    }
    
    if (isIPBlocked(ip)) {
        errorLog('Blocked IP:', ip);
        const errorResponse = {
            error: 'Forbidden',
            status: 403,
            details: {
                blockedIp: ip,
                timestamp: new Date().toISOString()
            }
        };
        return res.status(403).json(errorResponse);
    }

    const queue = getQueue(ip);

    // if (queue.size >= 60) {
    //     errorLog('Queue size limit exceeded for IP: %s', ip);
    //     const errorResponse = {
    //         error: 'Too Many Requests',
    //         status: 429,
    //         details: {
    //             queueSize: queue.size,
    //             maxQueueSize: 60,
    //             timestamp: new Date().toISOString()
    //         }
    //     };
    //     return res.status(429).json(errorResponse);
    // }
    
    const bypassQueue = requestData.isImagePollinationsReferrer || requestData.isRobloxReferrer || shouldBypassDelay(req);

    if (bypassQueue) {
        await handleRequest(req, res, requestData);
    } else {
        await getQueue(ip).add(() => handleRequest(req, res, requestData));
    }
}

// POST request handler
app.post('/', async (req, res) => {
    if (!req.body.messages || !Array.isArray(req.body.messages)) {
        return res.status(400).json({ error: 'Invalid messages array' });
    }

    const requestParams = getRequestData(req, true);
    try {
        await processRequest(req, res, {...requestParams, plaintTextResponse: true});
    } catch (error) {
        sendErrorResponse(res, req, error, requestParams);
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
    if (!req.body.messages || !Array.isArray(req.body.messages) || req.body.messages.length === 0) {
        return sendErrorResponse(res, req, new Error('Invalid messages array'), req.body, 400);
    }

    const requestParams = getRequestData(req);
   
    try {
        await processRequest(req, res, requestParams);
    } catch (error) {
        sendErrorResponse(res, req, error, requestParams);
    }

})

function sendAsOpenAIStream(res, completion) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: completion.choices[0].message.content }, finish_reason: "stop", index: 0 }] })}\n\n`);
    res.write('data: [DONE]\n\n');  // Add the [DONE] message for OpenAI compatibility
    res.end();
}

async function generateTextBasedOnModel(messages, options) {
    const model = options.model || 'openai';
    log('Using model:', model);

    try {
        const modelHandlers = {
            'sur': () => surOpenai(messages, options),
            'sur-mistral': () => surMistral(messages, options),
            'unity': () => unityMistralLarge(messages, options),
            'midijourney': () => midijourney(messages, options),
            'rtist': () => rtist(messages, options),
            'searchgpt': () => generateText(messages, {...options, model: 'openai-large'}),
            'evil': () => evilCommandR(messages, options)
        };

        const handler = modelHandlers[model] || (() => generateText(messages, options));
        const response = await handler();
        
        return response;
    } catch (error) {
        errorLog('Error in generateTextBasedOnModel:', error);
        throw error;
    }
}


export default app;

// GET request handler (catch-all)
app.get('/*', async (req, res) => {
    const requestData = getRequestData(req);
    try {
        await processRequest(req, res, {...requestData, plaintTextResponse: true});
    } catch (error) {
        sendErrorResponse(res, req, error, requestData);
    }
});
