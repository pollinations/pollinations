import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import crypto from 'crypto';
import debug from 'debug';
import { promises as fs } from 'fs';
import path from 'path';
import PQueue from 'p-queue';
import { availableModels } from './availableModels.js';
import { getHandler } from './availableModels.js';
import { sendToAnalytics } from './sendToAnalytics.js';
import { setupFeedEndpoint, sendToFeedListeners } from './feed.js';
import { getFromCache, setInCache, createHashKey } from './cache.js';
import { processNSFWReferralLinks } from './nsfwReferralLinks.js';

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
    'nima'
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
    log('Request data: %O', requestData);

    try {
        // Generate a unique ID for this request
        const requestId = generatePollinationsId();
        const completion = await generateTextBasedOnModel(requestData.messages, requestData);
        
        // Log completion details (but not the full content for streaming responses)
        if (requestData.stream && completion.stream) {
            log("Streaming completion: %O", {
                id: completion.id,
                model: completion.model,
                stream: completion.stream,
                providerName: completion.providerName,
                hasResponseStream: !!completion.responseStream,
                hasError: !!completion.error,
            });
        } else {
            log("Completion: %O", completion);
        }
        
        // Ensure completion has the request ID
        completion.id = requestId;
        
        // Check if completion contains an error
        if (completion.error) {
            errorLog('Completion error details: %s', JSON.stringify(completion.error, null, 2));
            
            // Return proper error response for both streaming and non-streaming
            const errorMsg = typeof completion.error === 'string' ? completion.error : JSON.stringify(completion.error);
            await sendErrorResponse(res, req, new Error(errorMsg), requestData, completion.error.status || 500);
            return;
        }
        
        // Process referral links if there's content in the response
        if (completion.choices?.[0]?.message?.content) {
            try {
                let processedContent = completion.choices[0].message.content;
                
                // First check for NSFW content in entire conversation
                processedContent = await processNSFWReferralLinks({
                    messages: requestData.messages,
                    responseContent: processedContent
                }, req);
                
                // Then process regular referral links
                // processedContent = await processReferralLinks(processedContent, req);
                
                completion.choices[0].message.content = processedContent;
            } catch (error) {
                errorLog('Error processing referral links:', error);
                // Continue with original content if referral processing fails
            }
        }

        const responseText = completion.stream ? 'Streaming response' : (completion.choices?.[0]?.message?.content || '');

        const cacheKey = createHashKey(requestData);
        
        // Only cache non-streaming responses
        if (completion.stream) {
            log('Skipping cache for streaming response');
        } else {
            setInCache(cacheKey, completion);
        }
        log('Generated response', responseText);
        
        // Extract token usage data
        const tokenUsage = completion.usage || {};
        
        // only send if not roblox, not private, and not from image pollinations
        if (!shouldBypassDelay(req) && !requestData.isImagePollinationsReferrer &&  !requestData.isPrivate) {
        // if (!requestData.isPrivate) {
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
            log('Sending streaming response with sendAsOpenAIStream');
            sendAsOpenAIStream(res, completion, req);
        } else {
            if (requestData.plaintTextResponse) {
                sendContentResponse(res, completion);
            } else {
                sendOpenAIResponse(res, completion);
            }
        }
    } catch (error) {
        // Handle errors in streaming mode differently
        if (requestData.stream) {
            log('Error in streaming mode:', error.message);
            errorLog('Error stack:', error.stack);
            
            // Check if this is a known API error and return it as an error response
            if (error.message && (error.message.includes("API error") || error.message.includes("Bad Request"))) {
                log('Returning API error as error response in streaming mode');
                await sendErrorResponse(res, req, error, requestData, error.code || 500);
                return;
            }
            
            sendAsOpenAIStream(res, { error: error.message, choices: [{ message: { content: error.message } }] }, req);
            return;
        }
        
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
    // If this is a test object (like {foo: 'bar'}), pass it through directly
    if (completion.foo) {
        res.json(completion);
        return;
    }
    
    // Otherwise, format as OpenAI response
    const response = {
        id: completion.id || generatePollinationsId(),
        object: 'chat.completion',
        created: completion.created || Date.now(),
        model: completion.model,
        choices: completion.choices,
        usage: completion.usage,
    };

    res.json(response);
}

export function sendContentResponse(res, completion) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    
    // Only handle OpenAI-style responses (with choices array)
    if (completion.choices && completion.choices[0] && completion.choices[0].message) {
        res.send(completion.choices[0].message.content);
    }
    // Fallback for any other response structure
    else {
        errorLog('Unrecognized completion format:', JSON.stringify(completion));
        res.send('Response format not recognized');
    }
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
    const isPrivate = req.path?.startsWith('/openai') ? true :
                     data.private === true || 
                     (typeof data.private === 'string' && data.private.toLowerCase() === 'true');

    const referrer = getReferrer(req, data);
    const isImagePollinationsReferrer = WHITELISTED_DOMAINS.some(domain => referrer.toLowerCase().includes(domain));
    const isRobloxReferrer = referrer.toLowerCase().includes('roblox') || referrer.toLowerCase().includes('gacha11211');
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
    const referer = req.headers.referer || req.headers.referrer || data.referrer || req.headers['http-referer'] || 'unknown';
    return referer;
}

// Helper function to process requests with queueing and caching logic
export async function processRequest(req, res, requestData) {
    const ip = getIp(req);

    // Check for banned phrases first
    try {
        await checkBannedPhrases(requestData.messages, ip);
    } catch (error) {
        if (requestData.stream) {
            // For streaming requests with security errors, return as proper error responses
            log('Banned phrases error in streaming mode:', error);
            
            // For security and API errors, always return as error response, even in streaming mode
            if (error.message && (
                error.message.includes("banned phrase") || 
                error.message.includes("API error") || 
                error.message.includes("Bad Request"))) {
                return sendErrorResponse(res, req, error, requestData, 403);
            }
        } else {
            return sendErrorResponse(res, req, error, requestData, 403);
        }
    }

    const cacheKey = createHashKey(requestData);

    // Check cache first
    const cachedResponse = getFromCache(cacheKey);
    // Skip cache for streaming requests
    if (cachedResponse && !requestData.stream) {
        log('Cache hit for key:', cacheKey);
        log('Using cached response');
        
        log('Cached response properties:', {
            hasStream: cachedResponse.stream,
            hasChoices: !!cachedResponse.choices,
            hasError: !!cachedResponse.error,
            hasResponseStream: !!cachedResponse.responseStream
        });
        
        // Extract token usage data from cached response
        const cachedTokenUsage = cachedResponse.usage || {};
        
        // Track cache hit in analytics
        await sendToAnalytics(req, 'textCached', {
            ...requestData,
            success: true,
            cached: true,
            responseLength: cachedResponse?.choices?.[0]?.message?.content?.length,
            streamMode: false,
            plainTextMode: requestData.plaintTextResponse,
            cacheKey: cacheKey,
            ...cachedTokenUsage
        });

        if (requestData.plaintTextResponse) {
            sendContentResponse(res, cachedResponse);
        } else {
            sendOpenAIResponse(res, cachedResponse);
        }
        return;
    } else if (requestData.stream && cachedResponse) {
        log('Skipping cache for streaming request');
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
        
        if (requestData.stream) {
            // For streaming requests, send error as a stream
            sendAsOpenAIStream(res, { error: 'Forbidden', choices: [{ message: { content: 'Forbidden' } }] }, req);
            return;
        } else {
            return res.status(403).json(errorResponse);
        }
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

function sendAsOpenAIStream(res, completion, req = null) {
    log('sendAsOpenAIStream called with completion type:', typeof completion);
if (completion) {
    log('Completion properties:', {
        hasStream: completion.stream,
        hasResponseStream: !!completion.responseStream,
        isCachedStream: !!completion.cachedStream,
        errorPresent: !!completion.error
    });
}
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    // Set standard SSE headers
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    
    // Handle error responses in streaming mode
    if (completion.error) {
        errorLog('Error detected in streaming request, this should not happen, errors should be handled before reaching here');
        // Just return, as the error should have been handled already
        return;
    }
    
    // Handle streaming response from the API
    const responseStream = completion.responseStream;
    log('Got streaming response from API, provider:', completion.providerName);
    
    // If we have a responseStream, try to proxy it
    if (responseStream) {
        log('Attempting to proxy stream to client');
        
        // For Node.js Readable streams
        if (responseStream.pipe) {
            log('Using pipe for Node.js Readable stream');
            
            // Directly pipe the stream to the client - true thin proxy approach
            log('Directly piping SSE stream to client');
            responseStream.pipe(res);
            
            // Handle client disconnect
            if (req) req.on('close', () => {
                log('Client disconnected');
                if (responseStream.destroy) {
                    responseStream.destroy();
                }
            });
            
            return;
        }
    }
    
    // If we get here, we couldn't handle the stream properly
    log('Could not handle stream properly, falling back to default response. Stream type:', 
        typeof responseStream, 'Stream available:', !!responseStream);
    res.write(`data: ${JSON.stringify({ 
        choices: [{ 
            delta: { content: 'Streaming response could not be processed.' }, 
            finish_reason: "stop", 
            index: 0 
        }] 
    })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
}

async function generateTextBasedOnModel(messages, options) {
    const model = options.model || 'openai';
    log('Using model:', model, 'with options:', JSON.stringify(options));

    try {
        // Log if streaming is enabled
        if (options.stream) {
            log('Streaming mode enabled for model:', model, 'stream value:', options.stream);
        }
        
        // Log the messages being sent
        log('Sending messages to model handler:', JSON.stringify(messages.map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content.substring(0, 50) + '...' : '[non-string content]' }))));
        
        // Get the handler function for the specified model
        const handler = getHandler(model);
        
        if (!handler) {
            throw new Error(`No handler found for model: ${model}`);
        }
        
        // Call the handler with the messages and options
        const response = await handler(messages, options);
        
        // Log streaming response details
        if (options.stream && response) {
            log('Received streaming response from handler:', response);
        }
        
        return response;
    } catch (error) {
        errorLog('Error in generateTextBasedOnModel:', error);
        
        // For streaming errors, return a special error response that can be streamed
        if (options.stream) {
            // Just return an error object - do not stream the error
            return {
                error: {
                    message: error.message || 'An error occurred during text generation',
                    status: error.code || 500
                },
            };
        }
        
        throw error;
    }
}


export default app;

// GET request handler (catch-all)
app.get('/*', async (req, res) => {
    const requestData = getRequestData(req);
    try {
        // For streaming requests, handle them with the same code paths as POST requests
        // This ensures consistent handling of streaming for both GET and POST
        await processRequest(req, res, {...requestData, plaintTextResponse: !requestData.stream});
    } catch (error) {
        errorLog('Error in catch-all GET handler: %s', error.message);
        sendErrorResponse(res, req, error, requestData);
    }
});
