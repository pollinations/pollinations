import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import crypto from 'crypto';
import debug from 'debug';
import { promises as fs } from 'fs';
import path from 'path';
import PQueue from 'p-queue';
import dotenv from 'dotenv';
import { availableModels } from './availableModels.js';
import { getHandler } from './availableModels.js';
import { sendToAnalytics } from './sendToAnalytics.js';
import { setupFeedEndpoint, sendToFeedListeners } from './feed.js';
import { getFromCache, setInCache, createHashKey } from './cache.js';
import { processNSFWReferralLinks } from './nsfwReferralLinks.js';
import { getRequestData, getReferrer } from './requestUtils.js';

// Load environment variables
dotenv.config();

const BANNED_PHRASES = [
];

// Read whitelisted domains from environment variable
const WHITELISTED_DOMAINS = process.env.WHITELISTED_DOMAINS 
    ? process.env.WHITELISTED_DOMAINS.split(',').map(domain => domain.trim())
    : [];

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
// New route handler for root path
app.get('/', (req, res) => {
    res.redirect('https://sur.pollinations.ai');
});

// Serve crossdomain.xml for Flash connections
app.get('/crossdomain.xml', (req, res) => {
    res.setHeader('Content-Type', 'application/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE cross-domain-policy SYSTEM "http://www.macromedia.com/xml/dtds/cross-domain-policy.dtd">
<cross-domain-policy>
  <allow-access-from domain="*" secure="false"/>
</cross-domain-policy>`);
});

app.set('trust proxy', true);

// Queue setup per IP address
const queues = new Map();

export function getQueue(ip) {
    if (!queues.has(ip)) {
        queues.set(ip, new PQueue({ concurrency: 1, interval: 6000, intervalCap: 1 }));
    }
    return queues.get(ip);
}

// Function to get IP address
export function getIp(req) {
    // Prioritize standard proxy headers and add cloudflare-specific headers
    const ip = req.headers["x-bb-ip"] || 
               req.headers["x-nf-client-connection-ip"] || 
               req.headers["x-real-ip"] || 
               req.headers['x-forwarded-for'] || 
               req.headers['cf-connecting-ip'] ||
               (req.socket ? req.socket.remoteAddress : null);
    
    // console.log("Headers:", req.headers);

    if (!ip) return null;
    
    // Handle x-forwarded-for which can contain multiple IPs (client, proxy1, proxy2, ...)
    // The client IP is typically the first one in the list
    const cleanIp = ip.split(',')[0].trim();
    
    // Check if IPv4 or IPv6
    if (cleanIp.includes(':')) {
        // IPv6 address
        // For IPv6, the first 4 segments (64 bits) typically identify the network
        // This is usually the global routing prefix (48 bits) + subnet ID (16 bits)
        // We'll take the first 4 segments to identify the network while preserving privacy
        
        // Handle special IPv6 formats like ::1 or 2001::
        const segments = cleanIp.split(':');
        let normalizedSegments = [];
        
        // Handle :: notation (compressed zeros)
        if (cleanIp.includes('::')) {
            const parts = cleanIp.split('::');
            const leftPart = parts[0] ? parts[0].split(':') : [];
            const rightPart = parts[1] ? parts[1].split(':') : [];
            
            // Calculate how many zero segments are represented by ::
            const missingSegments = 8 - leftPart.length - rightPart.length;
            
            normalizedSegments = [
                ...leftPart,
                ...Array(missingSegments).fill('0'),
                ...rightPart
            ];
        } else {
            normalizedSegments = segments;
        }
        
        // Take the first 4 segments (64 bits) which typically represent the network prefix
        return normalizedSegments.slice(0, 4).join(':');
    } else {
        // IPv4 address - take first 3 segments as before
        const ipv4Segments = cleanIp.split('.').slice(0, 3).join('.');
        // if (ipv4Segments === "128.116")
        //     throw new Error('Pollinations cloud credits exceeded. Please try again later.');
        return ipv4Segments;
    }
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

            log("Completion: %s", JSON.stringify(completion, null, 2));
        }
        
        // Ensure completion has the request ID
        completion.id = requestId;
        
        // Check if completion contains an error
        if (completion.error) {
            errorLog('Completion error details: %s', JSON.stringify(completion.error, null, 2));
            
            // Return proper error response for both streaming and non-streaming
            const errorObj = typeof completion.error === 'string' 
                ? { message: completion.error } 
                : completion.error;
                
            const error = new Error(errorObj.message || 'An error occurred');
            
            // Add the details if they exist
            if (errorObj.details) {
                error.response = { data: errorObj.details };
            }
            
            await sendErrorResponse(res, req, error, requestData, errorObj.status || 500);
            return;
        }
        
        // Process referral links if there's content in the response
        if (completion.choices?.[0]?.message?.content) {
            // Check if this is an audio response - if so, skip content processing
            const isAudioResponse = completion.choices?.[0]?.message?.audio !== undefined;
            
            if (!isAudioResponse) {
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
                    errorLog('Error processing content:', error);
                }
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
        
        // Send all requests to feed listeners, including private ones
        // The feed.js implementation will handle filtering for non-authenticated clients
        sendToFeedListeners(responseText, {
            ...requestData,
            ...tokenUsage
        }, getIp(req));
        
        // Track successful completion with token usage
        await sendToAnalytics(req, 'textGenerated', {
            ...requestData,
            success: true,
            cached: false,
            responseLength: responseText?.length,
            streamMode: requestData.stream,
            plainTextMode: req.method === 'GET',
            ...tokenUsage
        });

        if (requestData.stream) {
            log('Sending streaming response with sendAsOpenAIStream');
            sendAsOpenAIStream(res, completion, req);
        } else {
            if (req.method === 'GET') {
                sendContentResponse(res, completion);
            } else if (req.path === '/') {
                // For POST requests to the root path, also send plain text
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
            
            // Simply pass through the error using sendErrorResponse
            await sendErrorResponse(res, req, error, requestData, error.status || error.code || 500);
            return;
        }
        
        sendErrorResponse(res, req, error, requestData);
    }
    
    // if (!shouldBypassDelay(req)) {
    //     await sleep(3000);
    // }
}

// Function to check if delay should be bypassed
function shouldBypassDelay(req) {
    const referrer = getReferrer(req, req.body || {});
    return WHITELISTED_DOMAINS.some(domain => referrer.toLowerCase().includes(domain));
}

// Helper function for consistent error responses
export async function sendErrorResponse(res, req, error, requestData, statusCode = 500) {
    const errorResponse = {
        error: error.message || 'An error occurred',
        status: statusCode
    };

    // Include detailed error information if available
    if (error.response?.data) {
        try {
            // Try to parse the data as JSON first
            const parsedData = typeof error.response.data === 'string' 
                ? JSON.parse(error.response.data) 
                : error.response.data;
            errorResponse.details = parsedData;
        } catch (e) {
            // If parsing fails, use the raw data
            errorResponse.details = error.response.data;
        }
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
    
    // Set appropriate headers
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    
    // Follow thin proxy approach - pass through the response as-is
    // Only add required fields if they're missing
    const response = {
        ...completion,
        id: completion.id || generatePollinationsId(),
        object: completion.object || "chat.completion",
        created: completion.created || Date.now()
    };
    
    res.json(response);
}

export function sendContentResponse(res, completion) {
    // Handle the case where the completion is already a string or simple object
    if (typeof completion === 'string') {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.send(completion);
    }
    
    // Only handle OpenAI-style responses (with choices array)
    if (completion.choices && completion.choices[0]) {
        const message = completion.choices[0].message;
        
        // If message is a string, send it directly
        if (typeof message === 'string') {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            return res.send(message);
        }
        
        // If message is not an object, convert to string
        if (!message || typeof message !== 'object') {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            return res.send(String(message));
        }
        
        // If the message contains audio, send the audio data as binary
        if (message.audio && message.audio.data) {
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            
            // Convert base64 data to binary
            const audioBuffer = Buffer.from(message.audio.data, 'base64');
            return res.send(audioBuffer);
        }
        // For simple text responses, return just the content as plain text
        // This is the most common case and should be prioritized
        else if (message.content) {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            return res.send(message.content);
        }
        // If there's other non-text content, return the message as JSON
        else if (Object.keys(message).length > 0) {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            return res.json(message);
        }
    }
    // Fallback for any other response structure
    else {
        errorLog('Unrecognized completion format:', JSON.stringify(completion));
        return res.send('Response format not recognized');
    }
}

// Helper function to process requests with queueing and caching logic
export async function processRequest(req, res, requestData) {
    const ip = getIp(req);

    // Check for banned phrases first
    try {
        await checkBannedPhrases(requestData.messages, ip);
    } catch (error) {
        // Only block for actual banned phrases, not API errors
        if (error.message && error.message.includes("banned phrase")) {
            return sendErrorResponse(res, req, error, requestData, 403);
        }
        
        // For API errors in streaming mode, pass them through
        if (requestData.stream) {
            log('API error in streaming mode:', error);
            return sendErrorResponse(res, req, error, requestData, error.status || error.code || 500);
        } else {
            return sendErrorResponse(res, req, error, requestData, error.status || error.code || 500);
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
            plainTextMode: req.method === 'GET',
            cacheKey: cacheKey,
            ...cachedTokenUsage
        });

        if (req.method === 'GET') {
            sendContentResponse(res, cachedResponse);
        } else if (req.path === '/') {
            // For POST requests to the root path, also send plain text
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

// Helper function to check if a model is an audio model and add necessary parameters
function prepareRequestParameters(requestParams) {
    const modelConfig = availableModels.find(m => 
        m.name === requestParams.model || m.model === requestParams.model
    );
    const isAudioModel = modelConfig && modelConfig.audio === true;
    
    log('Is audio model:', isAudioModel);
    
    // Create the final parameters object
    const finalParams = {
        ...requestParams
    };
    
    // Add audio parameters if it's an audio model
    if (isAudioModel) {
        // Get the voice parameter from the request or use "alloy" as default
        const voice = requestParams.voice || requestParams.audio?.voice || "amuch";
        log('Adding audio parameters for audio model:', requestParams.model, 'with voice:', voice);
        
        // Only add modalities and audio if not already provided in the request
        if (!finalParams.modalities) {
            finalParams.modalities = ["text", "audio"];
        }
        
        // If audio format is already specified in the request, use that
        // Otherwise, use pcm16 for streaming and mp3 for non-streaming
        if (!finalParams.audio) {
            finalParams.audio = { 
                voice: voice,
                format: requestParams.stream ? "pcm16" : "mp3" 
            };
        } else if (!finalParams.audio.format) {
            // If audio object exists but format is not specified
            finalParams.audio.format = requestParams.stream ? "pcm16" : "mp3";
        }

        // Ensure these parameters are preserved in the final request
        requestParams.modalities = finalParams.modalities;
        requestParams.audio = finalParams.audio;
    }
    // finalParams.modalities = ["text", "image"]
    
    return finalParams;
}

app.post('/', async (req, res) => {
    if (!req.body.messages || !Array.isArray(req.body.messages)) {
        return res.status(400).json({ error: 'Invalid messages array' });
    }

    const requestParams = getRequestData(req, true);
    const finalRequestParams = prepareRequestParameters(requestParams);
    
    try {
        await processRequest(req, res, finalRequestParams);
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
    const requestParams = getRequestData(req);
   
    try {
        await processRequest(req, res, requestParams);
    } catch (error) {
        sendErrorResponse(res, req, error, requestParams);
    }
})

// OpenAI-compatible v1 endpoint for chat completions
app.post('/v1/chat/completions', async (req, res) => {
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
            // Create a detailed error response
            let errorDetails = null;
            
            if (error.response?.data) {
                try {
                    // Try to parse the data as JSON
                    errorDetails = typeof error.response.data === 'string' 
                        ? JSON.parse(error.response.data) 
                        : error.response.data;
                } catch (e) {
                    // If parsing fails, use the raw data
                    errorDetails = error.response.data;
                }
            }
            
            // Return an error object with detailed information
            return {
                error: {
                    message: error.message || 'An error occurred during text generation',
                    status: error.code || 500,
                    details: errorDetails
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
    const finalRequestData = prepareRequestParameters(requestData);
    
    try {
        // For streaming requests, handle them with the same code paths as POST requests
        // This ensures consistent handling of streaming for both GET and POST
        await processRequest(req, res, finalRequestData);
    } catch (error) {
        errorLog('Error in catch-all GET handler: %s', error.message);
        sendErrorResponse(res, req, error, requestData);
    }
});
