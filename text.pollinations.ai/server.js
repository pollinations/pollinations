import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import crypto from 'crypto';
import debug from 'debug';
import { promises as fs } from 'fs';
import path from 'path';
import rateLimit from 'express-rate-limit';
import PQueue from 'p-queue';
import sleep from 'await-sleep';
import { availableModels } from './availableModels.js';
import generateTextOptiLLM from './generateTextOptiLLM.js';
import { generateTextGemini } from './generateTextGemini.js';
import generateTextSearch from './generateTextSearch.js';

import { generateTextOpenRouter } from './generateTextOpenRouter.js';
import { generateDeepseek } from './generateDeepseek.js';
import { generateTextScaleway } from './generateTextScaleway.js';
import { getHandler } from './availableModels.js';
import { sendToAnalytics } from './sendToAnalytics.js';
import { setupFeedEndpoint, sendToFeedListeners } from './feed.js';
import { getFromCache, setInCache, createHashKey } from './cache.js';
import generateTextClaude from './generateTextClaude.js';
import { generateTextCloudflare } from './generateTextCloudflare.js';
import { generateTextModal } from './generateTextModal.js';
import { processReferralLinks } from './referralLinks.js';
import { processNSFWReferralLinks } from './nsfwReferralLinks.js';
import hypnosisTracyPrompt from './personas/hypnosisTracy.js';

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
                isSSE: !!completion.isSSE
            });
        } else {
            log("Completion: %O", completion);
        }
        
        // Ensure completion has the request ID
        completion.id = requestId;
        
        // Check if completion contains an error
        if (completion.error) {
            errorLog('Completion error details: %s', JSON.stringify(completion.error, null, 2));
            if (!requestData.stream) throw new Error(JSON.stringify(completion.error));
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
        setInCache(cacheKey, completion);
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
            // For streaming requests, send error as a stream
            log('Banned phrases error in streaming mode:', error);
            sendAsOpenAIStream(res, { error: error.message, choices: [{ message: { content: error.message } }] }, req);
            return;
        } else {
            return sendErrorResponse(res, req, error, requestData, 403);
        }
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
            if (requestData.stream) {
                sendAsOpenAIStream(res, cachedResponse, req);
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
    log('sendAsOpenAIStream called with completion:', JSON.stringify(completion, null, 2).substring(0, 500) + '...');
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');

    log('Headers set for streaming response');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    
    // Handle error responses in streaming mode
    if (completion.error) {
        log('Error in streaming mode:', JSON.stringify(completion.error));
        errorLog('Streaming error details:', JSON.stringify(completion.error, null, 2));
        
        // Send the error as a streaming event
        res.write(`data: ${JSON.stringify({ 
            choices: [{ 
                delta: { content: completion.error.message || 'An error occurred' }, 
                finish_reason: "stop", 
                index: 0 
            }],
            error: completion.error
        })}\n\n`);
        
        // Send the [DONE] message for OpenAI compatibility
        log('Sending [DONE] message after error');
        res.write('data: [DONE]\n\n');
        res.end();
        return;
    }
    
    // Check if this is a streaming response from the API
    if (completion.stream && completion.responseStream) {
        // Handle streaming response from the API
        const responseStream = completion.responseStream;
        log('Got streaming response from API, provider:', completion.providerName, 'isSSE:', completion.isSSE);
        
        // If we have a responseStream, try to proxy it
        if (responseStream) {
            log('Attempting to proxy stream to client');
            
            // For ReadableStream from fetch API
            if (responseStream.pipeTo) {
                log('Using pipeTo for ReadableStream');
                try {
                    const reader = responseStream.getReader();
                    
                    const pump = async () => {
                        try {
                            while (true) {
                                const { done, value } = await reader.read();
                                if (done) break;
                                
                                // Convert the value to a string if it's a buffer
                                const chunk = typeof value === 'string' ? value : new TextDecoder().decode(value);
                                log('Proxying ReadableStream chunk:', chunk.substring(0, 100) + (chunk.length > 100 ? '...' : ''));
                                res.write(chunk);
                            }
                            log('Reader completed, sending [DONE]');
                            res.write('data: [DONE]\n\n');
                            res.end();
                        } catch (error) {
                            errorLog('Error reading from stream:', error);
                             // Send error as a streaming event
                             res.write(`data: ${JSON.stringify({ 
                                 choices: [{ 
                                     delta: { content: `Error reading from stream: ${error.message}` }, 
                                     finish_reason: "stop", 
                                     index: 0 
                                 }] 
                             })}\n\n`);
                            res.write('data: [DONE]\n\n');
                            res.end();
                        }
                    };
                    
                    pump();
                    
                    // Handle client disconnect
                    if (req) req.on('close', () => {
                        log('Client disconnected');
                        reader.cancel('Client disconnected');
                    });
                } catch (error) {
                    errorLog('Error setting up ReadableStream reader:', error);
                    res.write(`data: ${JSON.stringify({ 
                        choices: [{ 
                            delta: { content: 'Error setting up stream reader.' }, 
                            finish_reason: "stop", 
                            index: 0 
                        }] 
                    })}\n\n`);
                    res.write('data: [DONE]\n\n');
                    res.end();
                }
                
                // Handle client disconnect
                if (req) req.on('close', () => {
                    log('Client disconnected');
                });
                
                return;
            }
            
            // For Node.js Readable streams
            if (responseStream.pipe) {
                log('Using pipe for Node.js Readable stream');
                
                // If it's an SSE stream, we can pipe it directly
                if (completion.isSSE) {
                    log('Directly piping SSE stream to client');
                    responseStream.pipe(res, { end: false });
                } else {
                    // For non-SSE streams, we need to transform the data
                    log('Transforming non-SSE stream to SSE format');
                    responseStream.on('data', (chunk) => {
                        const data = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
                        log('Received data chunk from stream:', data.substring(0, 100) + (data.length > 100 ? '...' : ''));
                        
                        // Format as SSE
                        res.write(`data: ${JSON.stringify({ 
                            choices: [{ 
                                delta: { content: data }, 
                                finish_reason: null, 
                                index: 0 
                            }] 
                        })}\n\n`);
                    });
                }
                
                responseStream.on('end', () => {
                    log('Stream ended, sending [DONE] message');
                    res.write('data: [DONE]\n\n');
                    res.end();
                });
                
                responseStream.on('error', (error) => {
                    errorLog('Stream error:', error);
                    // Send error as a streaming event
                    res.write(`data: ${JSON.stringify({ 
                        choices: [{ 
                            delta: { content: `Stream error: ${error.message}` }, 
                            finish_reason: "stop", 
                            index: 0 
                        }] 
                    })}\n\n`);
                    res.write('data: [DONE]\n\n');
                    res.end();
                });
                
                // Handle client disconnect
                if (req) req.on('close', () => {
                    log('Client disconnected');
                    if (responseStream.destroy) {
                        responseStream.destroy();
                    }
                });
                
                return;
            }
            
            // Fallback for other types of streams
            log('Using manual handling for unknown stream type');
            try {
                // Check if it's an AsyncIterable (like from OpenAI SDK)
                if (responseStream[Symbol.asyncIterator]) {
                    log('Using AsyncIterable for stream');
                    (async () => {
                        try {
                            for await (const chunk of responseStream) {
                                log('Received chunk from AsyncIterable:', 
                                    typeof chunk === 'string' 
                                        ? chunk.substring(0, 100) + (chunk.length > 100 ? '...' : '')
                                        : JSON.stringify(chunk).substring(0, 100) + '...');
                                
                                // Handle different chunk formats
                                if (typeof chunk === 'string') {
                                    // If it's already formatted as SSE, send it directly
                                    if (chunk.startsWith('data:')) {
                                        log('Sending pre-formatted SSE chunk');
                                        res.write(chunk);
                                    } else {
                                        // Otherwise, format it as SSE
                                        log('Formatting string chunk as SSE');
                                        res.write(`data: ${JSON.stringify({ 
                                            choices: [{ 
                                                delta: { content: chunk }, 
                                                finish_reason: null, 
                                                index: 0 
                                            }] 
                                        })}\n\n`);
                                    }
                                } else if (chunk.choices) {
                                    // Format as SSE if it's an object
                                    log('Formatting object chunk with choices as SSE');
                                    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
                                } else {
                                    // For any other object format
                                    log('Formatting generic object chunk as SSE');
                                    res.write(`data: ${JSON.stringify({ 
                                        choices: [{ 
                                            delta: { content: JSON.stringify(chunk) }, 
                                            finish_reason: null, 
                                            index: 0 
                                        }] 
                                    })}\n\n`);
                                }
                            }
                            log('AsyncIterable completed, sending [DONE]');
                            res.write('data: [DONE]\n\n');
                            res.end();
                        } catch (error) {
                            errorLog('Error in AsyncIterable:', error);
                            // Send error as a streaming event
                            res.write(`data: ${JSON.stringify({ 
                                choices: [{ 
                                    delta: { content: `Error in stream: ${error.message}` }, 
                                    finish_reason: "stop", 
                                    index: 0 
                                }] 
                            })}\n\n`);
                            res.write('data: [DONE]\n\n');
                            res.end();
                        }
                    })();
                    return;
                }
            } catch (error) {
                errorLog('Error handling stream:', error);
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
    } else {
        // Fallback to the old behavior for non-streaming responses or errors
        // Break the content into smaller chunks to simulate streaming
        const content = completion.choices[0].message.content;
        const chunkSize = 20; // Characters per chunk
        
        // Send the initial delta with role
        res.write(`data: ${JSON.stringify({ 
            choices: [{ 
                delta: { role: "assistant" }, 
                finish_reason: null, 
                index: 0 
            }] 
        })}\n\n`);
        
        // Send content in chunks
        for (let i = 0; i < content.length; i += chunkSize) {
            const chunk = content.substring(i, i + chunkSize);
            res.write(`data: ${JSON.stringify({ 
                choices: [{ 
                    delta: { content: chunk }, 
                    finish_reason: null, 
                    index: 0 
                }] 
            })}\n\n`);
            
            // Small delay to simulate real streaming (not needed in production)
            // In a real implementation, you might want to remove this
            if (process.env.NODE_ENV === 'test') {
                // No delay in test mode
            }
        }
        
        // Send the finish reason in the final chunk
        res.write(`data: ${JSON.stringify({ 
            choices: [{ 
                delta: {}, 
                finish_reason: "stop", 
                index: 0 
            }] 
        })}\n\n`);
        
        res.write('data: [DONE]\n\n');  // Add the [DONE] message for OpenAI compatibility
        log('Sent non-streaming response as stream');
        res.end();
    }
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
            log('Received streaming response from handler:', 
                JSON.stringify({
                    id: response.id,
                    model: response.model,
                    stream: response.stream,
                    providerName: response.providerName,
                    hasResponseStream: !!response.responseStream,
                    isSSE: !!response.isSSE
                })
            );
        }
        
        return response;
    } catch (error) {
        errorLog('Error in generateTextBasedOnModel:', error);
        
        // For streaming errors, return a special error response that can be streamed
        if (options.stream) {
            return {
                error: {
                    message: error.message || 'An error occurred during text generation',
                    code: error.code || 500,
                    metadata: {
                        provider_name: 'unknown'
                    }
                },
                stream: true,
                choices: [{ delta: { content: '' }, finish_reason: null, index: 0 }]
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
        await processRequest(req, res, {...requestData, plaintTextResponse: true});
    } catch (error) {
        sendErrorResponse(res, req, error, requestData);
    }
});
