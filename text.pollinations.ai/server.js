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
import generateTextClaudeWrapper from './generateTextClaudeWrapper.js';
import surSystemPrompt from './personas/sur.js';
import rateLimit from 'express-rate-limit';
import PQueue from 'p-queue';


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

// Create a custom Claude instance with a specific system message
const claudeSur = generateTextClaudeWrapper(surSystemPrompt);

// Set trust proxy setting
app.set('trust proxy', true);

// Rate limiting middleware
// skip if a request would be cached
const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 20, // limit each IP to 30 requests per windowMs
    message: 'Too many requests, please try again later.',
    skip: (req, res) => {
        const cacheKey = createHashKey(JSON.stringify(req.body));
        return cache[cacheKey] !== undefined;
    }
});

app.use(limiter);

// Queue setup per IP address
const queues = new Map();

function getQueue(ip) {
    if (!queues.has(ip)) {
        queues.set(ip, new PQueue({ concurrency: 1 }));
    }
    return queues.get(ip);
}

// GET /models request handler
app.get('/models', (req, res) => {
    const availableModels = [
        { name: 'openai', type: 'chat', censored: true },
        { name: 'mistral', type: 'chat', censored: false },
        { name: 'llama', type: 'completion', censored: true },
        { name: 'karma.yt', type: 'completion', censored: true },
        // { name: 'claude', type: 'chat', censored: true }
        // { name: 'sur', type: 'chat', censored: true }
    ];
    res.json(availableModels);
});

// Helper function to handle both GET and POST requests
async function handleRequest(req, res, cacheKeyData) {
    const cacheKey = createHashKey(JSON.stringify(cacheKeyData));
    console.log(777);
    try {
        console.log(1);
        if (cache[cacheKey]) {
            const cachedResponse = await cache[cacheKey];
            if (cachedResponse instanceof Error) {
                throw cachedResponse; // Re-throw the cached error
            }
            console.log(cachedResponse)
            return sendResponse(res, cachedResponse);
        }
        console.log(2);
        console.log(`Received request with data: ${JSON.stringify(cacheKeyData)}`);

        const responsePromise = generateTextBasedOnModel(cacheKeyData.messages, cacheKeyData);

        // Don't cache the promise, wait for it to resolve or reject
        const response = await responsePromise;

        // Only cache successful responses
        cache[cacheKey] = response;
        await saveCache();

        console.log(`Generated response for key: ${cacheKey}`);
        sendResponse(res, response);
    } catch (error) {
        console.error(`Error generating text for key: ${cacheKey}`, error.message);
        res.status(500).send(error.message);
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
    console.log("got query", query);
    const data = isPost ? { ...body, ...query } : query;

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
    const queue = getQueue(req.ip);
    await queue.add(() => handleRequest(req, res, cacheKeyData));
});

// POST request handler
app.post('/', async (req, res) => {
    if (!req.body.messages || !Array.isArray(req.body.messages)) {
        console.log('Invalid messages array');
        return res.status(400).send('Invalid messages array');
    }

    const cacheKeyData = getRequestData(req, true);
    const queue = getQueue(req.ip);
    await queue.add(() => handleRequest(req, res, cacheKeyData));
});

// POST /openai request handler
app.post('/openai', async (req, res) => {

    // log all request data
    // console.log("request data", JSON.stringify(req.body, null, 2));

    if (!req.body.messages || !Array.isArray(req.body.messages)) {
        console.log('Invalid messages array');
        return res.status(400).send('Invalid messages array');
    }

    const cacheKeyData = getRequestData(req, true);
    const queue = getQueue(req.ip);
    await queue.add(async () => {
        console.log("endpoint: /openai", cacheKeyData);

        const messageKey = req.body.stream ? "delta" : "content";

        try {
            const response = await generateTextBasedOnModel(cacheKeyData.messages, cacheKeyData);
            const result = ({
                "created": Date.now(),
                "id": crypto.randomUUID(),
                "model": cacheKeyData.model,
                "object": "chat.completion",
                "choices": [{ [messageKey]: { "content": response, "role": "assistant" }, "finish_reason": "stop", "index": 0 }]
            });
            // console.log("openai format result", JSON.stringify(result, null, 2));
            res.json(result);
        } catch (error) {
            console.error(`Error generating text`, error.message);
            res.status(500).send(error.message);
        }
    });
});

// Helper function to save cache to disk
async function saveCache() {
    const resolvedCache = {};
    for (const [key, value] of Object.entries(cache)) {
        const resolvedValue = await value;
        if (!(resolvedValue instanceof Error)) {
            resolvedCache[key] = resolvedValue;
        }
    }
    fs.writeFileSync(cachePath, JSON.stringify(resolvedCache), 'utf8');
}

// Helper function to generate text based on the model
async function generateTextBasedOnModel(messages, options) {
    const { model = 'openai', ...rest } = options;
    if (model === 'mistral') {
        return generateTextMistral(messages, rest);
    } else if (model === 'llama') {
        return generateTextLlama(messages, rest);
    } else if (model === 'karma') {
        console.log('karma xxxxxx');
        return generateTextKarma(messages, rest);
    } else if (model === 'claude') {
        return generateTextClaude(messages, rest);
    } else if (model === 'sur') {
        return claudeSur(messages, rest);
    } else {
        return generateText(messages, rest);
    }
}

// Helper function to create a hash for the cache key
function createHashKey(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
