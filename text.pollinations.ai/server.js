import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import generateText from './generateTextOpenai.js';
import generateTextMistral from './generateTextMistral.js';
import generateTextLlama from './generateTextLlama.js';
import generateTextKarma from './generateTextKarma.js';
import generateTextClaude from './generateTextClaude.js';
import wrapModelWithContext from './wrapModelWithContext.js';
import surSystemPrompt from './personas/sur.js';
import unityPrompt from './personas/unity.js';
import rateLimit from 'express-rate-limit';
import PQueue from 'p-queue';
import generateTextCommandR from './generateTextCommandR.js';
import sleep from 'await-sleep';
const app = express();
const port = process.env.PORT || 16385;

app.use(bodyParser.json({ limit: '5mb' }));
app.use(cors());

const cacheDir = path.join(process.cwd(), '.cache');
if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
}

let cache = {};

// Load cache from disk
const cachePath = path.join(cacheDir, 'cache.json');
if (fs.existsSync(cachePath)) {
    const cacheData = fs.readFileSync(cachePath, 'utf8');
    cache = JSON.parse(cacheData);
}

// Create custom instances of Sur backed by Claude, Mistral, and Command-R
const surClaude = wrapModelWithContext(surSystemPrompt, generateTextClaude);
const surMistral = wrapModelWithContext(surSystemPrompt, generateTextMistral);
const surCommandR = wrapModelWithContext(surSystemPrompt, generateTextCommandR);
// Create custom instance of Unity backed by Mistral Large
const unityMistralLarge = wrapModelWithContext(unityPrompt, generateTextMistral);

app.set('trust proxy', true);

// // Rate limiting middleware
// // skip if a request would be cached
// const limiter = rateLimit({
//     windowMs: 1 * 60 * 1000, // 1 minute
//     max: 20, // limit each IP to 30 requests per windowMs
//     message: 'Too many requests, please try again later.',
//     skip: (req, res) => {
//         const cacheKey = createHashKey(JSON.stringify(req.body));
//         return cache[cacheKey] !== undefined;
//     }
// });

// app.use(limiter);

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

const availableModels = [
    {
        name: 'openai',
        type: 'chat',
        censored: true,
        description: 'OpenAI GPT-4o'
    },
    {
        name: 'mistral',
        type: 'chat',
        censored: false,
        description: 'Mistral Nemo'
    },
    {
        name: 'mistral-large',
        type: 'chat',
        censored: false,
        description: 'Mistral Large (v2)'
    },
    {
        name: 'llama',
        type: 'completion',
        censored: true,
        description: 'Llama 3.1'
    },
    {
        name: 'karma',
        type: 'completion',
        censored: true,
        description: 'Karma.yt Zeitgeist. Connected to realtime news and the web. (beta)'
    },
    {
        name: 'command-r',
        type: 'chat',
        censored: false,
        description: 'Command-R'
    },
    {
        name: 'unity',
        type: 'chat',
        censored: false,
        description: 'Unity with Mistral Large by @gfourteen'
    }
    // { name: 'claude', type: 'chat', censored: true }
    // { name: 'sur', type: 'chat', censored: true }
];

// GET /models request handler
app.get('/models', (req, res) => {
    res.json(availableModels);
});

// Helper function to handle both GET and POST requests
async function handleRequest(req, res, cacheKeyData) {
    // console.log("handleRequest", cacheKeyData);
    const cacheKey = createHashKey(JSON.stringify(cacheKeyData));

    try {
        if (cache[cacheKey]) {
            const cachedResponse = await cache[cacheKey];
            if (cachedResponse instanceof Error) {
                throw cachedResponse; // Re-throw the cached error
            }
            return sendResponse(res, cachedResponse);
        }



        console.log(`Received request with data: ${JSON.stringify(cacheKeyData)}`);

        const responsePromise = generateTextBasedOnModel(cacheKeyData.messages, cacheKeyData);

        cache[cacheKey] = responsePromise;
        let response;
        try {
            // Don't cache the promise, wait for it to resolve or reject
            response = await responsePromise;
        } catch (error) {
            console.log(`Error generating text for key: ${cacheKey}`, error.message, "deleting cache");
            delete cache[cacheKey];
            throw error; // rethrow the error so the caller can handle it
        }

        await saveCache();

        console.log(`Generated response for key: ${cacheKey}`);
        sendResponse(res, response);
        await sleep(1000); // ensures one ip can only make one request per second
    } catch (error) {
        console.error(`Error generating text for key: ${cacheKey}`, error.message);
        console.error(error.stack); // Print stack trace
        res.status(500).send(error.message);
        await sleep(1000); // ensures one ip can only make one request per second
    }
}

function sendResponse(res, response) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Content-Type', 'text/plain');
    res.send(response);
}

// Common function to handle request data
function getRequestData(req, isPost = false) {
    const query = req.query;
    const body = req.body;
    const data = isPost ? { ...query, ...body } : query;

    const jsonMode = data.jsonMode || data.json?.toLowerCase() === 'true';
    const seed = data.seed ? parseInt(data.seed, 10) : null;
    const model = data.model || 'openai';
    const systemPrompt = data.system ? decodeURIComponent(data.system) : null;
    const temperature = data.temperature ? parseFloat(data.temperature) : undefined;

    const messages = isPost ? data.messages : [{ role: 'user', content: decodeURIComponent(req.params.prompt) }];
    if (systemPrompt) {
        messages.unshift({ role: 'system', content: systemPrompt });
    }

    return {
        messages,
        jsonMode,
        seed,
        model,
        temperature,
        type: isPost ? 'POST' : 'GET'
    };
}

// GET request handler
app.get('/:prompt', async (req, res) => {
    const cacheKeyData = getRequestData(req);
    const ip = getIp(req);
    const queue = getQueue(ip);
    await queue.add(() => handleRequest(req, res, cacheKeyData));
});

// POST request handler
app.post('/', async (req, res) => {
    if (!req.body.messages || !Array.isArray(req.body.messages)) {
        console.log('Invalid messages array');
        return res.status(400).send('Invalid messages array');
    }

    const cacheKeyData = getRequestData(req, true);
    const ip = getIp(req);
    const queue = getQueue(ip);
    await queue.add(() => handleRequest(req, res, cacheKeyData));
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

    const cacheKeyData = getRequestData(req, true);
    const cacheKey = createHashKey(JSON.stringify(cacheKeyData));
    const ip = getIp(req);
    const queue = getQueue(ip);
    const isStream = req.body.stream;
    await queue.add(async () => {

        if (cache[cacheKey]) {
            const cachedResponse = await cache[cacheKey];
            if (cachedResponse instanceof Error) {
                throw cachedResponse; // Re-throw the cached error
            }
            return res.json(cachedResponse);
        }

        console.log("endpoint: /openai", cacheKeyData);

        try {
            const response = await generateTextBasedOnModel(cacheKeyData.messages, cacheKeyData);
            let choices;
            if (isStream) {
                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');
                res.flushHeaders();
                res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: response }, finish_reason: "stop", index: 0 }] })}\n\n`);
                res.end();
                return;
            } else {
                choices = [{ "message": { "content": response, "role": "assistant" }, "finish_reason": "stop", "index": 0 }]
            }
            const result = {
                "created": Date.now(),
                "id": crypto.randomUUID(),
                "model": cacheKeyData.model,
                "object": isStream ? "chat.completion.chunk" : "chat.completion",
                "choices": choices
            };
            cache[cacheKey] = result;
            console.log("openai format result", JSON.stringify(result, null, 2));
            res.json(result);
        } catch (error) {
            console.error(`Error generating text`, error.message);
            console.error(error.stack); // Print stack trace
            res.status(500).send(error.message);
        }
    });
});

// Helper function to save cache to disk
async function saveCache() {
    const resolvedCache = {};
    for (const [key, value] of Object.entries(cache)) {
        try {
            const resolvedValue = await value;
            if (!(resolvedValue instanceof Error)) {
                resolvedCache[key] = resolvedValue;
            }
        } catch (error) {
            console.error(`Error resolving cache value for key: ${key}`, error.message);
            console.error(error.stack); // Print stack trace
        }
    }
    fs.writeFileSync(cachePath, JSON.stringify(resolvedCache), 'utf8');
}

// Helper function to generate text based on the model
async function generateTextBasedOnModel(messages, options) {
    const { model = 'openai' } = options;
    if (model.startsWith('mistral')) {
        return generateTextMistral(messages, options);
    } else if (model.startsWith('llama')) {
        return generateTextLlama(messages, options);
    } else if (model === 'karma') {
        return generateTextKarma(messages, options);
    } else if (model === 'claude') {
        return generateTextClaude(messages, options);
    } else if (model === 'sur') {
        return surClaude(messages, options);
    } else if (model === 'sur-mistral') {
        return surMistral(messages, options);
    } else if (model === 'command-r') {
        return generateTextCommandR(messages, options);
    } else if (model === 'unity') {
        return unityMistralLarge(messages, options);
    } else {
        return generateText(messages, options);
    }
}

// Helper function to create a hash for the cache key
function createHashKey(data) {
    // Ensure the data used for the cache key is deterministic
    const deterministicData = JSON.stringify(JSON.parse(data));
    return crypto.createHash('sha256').update(deterministicData).digest('hex');
}

app.use((req, res, next) => {
    console.log(`Unhandled request: ${req.method} ${req.originalUrl}`);
    next();
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
