import express from 'express';

import bodyParser from 'body-parser';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import generateText from './generateTextOpenai.js';
import generateTextMistral from './generateTextMistral.js';
import generateTextLlama from './generateTextLlama.js';
import generateTextClaude from './generateTextClaude.js';
// import generateTextClaudeWrapper from './generateTextClaudeWrapper.js';

const app = express();
const port = process.env.PORT || 16385;

app.use(bodyParser.json({ limit: '50mb' }));
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
// const customClaudeInstance = generateTextClaudeWrapper("You are a helpful assistant specialized in coding tasks.");

// GET /models request handler
app.get('/models', (req, res) => {
    const availableModels = [
        { name: 'openai', type: 'chat', censored: true },
        { name: 'mistral', type: 'chat', censored: false },
        { name: 'llama', type: 'completion', censored: true },
        // { name: 'claude', type: 'chat', censored: true }
    ];
    res.json(availableModels);
});

// Helper function to handle both GET and POST requests
async function handleRequest(req, res, cacheKeyData) {
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
    const jsonMode = isPost ? (req.body.jsonMode || req.query.json?.toLowerCase() === 'true') : req.query.json?.toLowerCase() === 'true';
    const seed = req.query.seed ? parseInt(req.query.seed, 10) : (isPost ? (req.body.seed || null) : null);
    const model = isPost ? (req.body.model || req.query.model || 'openai') : (req.query.model || 'openai');
    const systemPrompt = req.query.system ? decodeURIComponent(req.query.system) : null;

    const messages = isPost ? req.body.messages : [{ role: 'user', content: decodeURIComponent(req.params.prompt) }];
    if (systemPrompt) {
        messages.unshift({ role: 'system', content: systemPrompt });
    }

    return {
        messages,
        jsonMode,
        seed,
        model,
        type: isPost ? 'POST' : 'GET'
    };
}

// GET request handler
app.get('/:prompt', async (req, res) => {
    const cacheKeyData = getRequestData(req);
    await handleRequest(req, res, cacheKeyData);
});

// POST request handler
app.post('/', async (req, res) => {
    if (!req.body.messages || !Array.isArray(req.body.messages)) {
        console.log('Invalid messages array');
        return res.status(400).send('Invalid messages array');
    }

    const cacheKeyData = getRequestData(req, true);
    await handleRequest(req, res, cacheKeyData);
});

// POST /openai request handler
app.post('/openai', async (req, res) => {
    if (!req.body.messages || !Array.isArray(req.body.messages)) {
        console.log('Invalid messages array');
        return res.status(400).send('Invalid messages array');
    }

    const cacheKeyData = getRequestData(req, true);
    cacheKeyData.model = 'openai';

    try {
        const response = await generateTextBasedOnModel(cacheKeyData.messages, cacheKeyData);
        res.json({ choices: [{ message: { content: response, role: 'assistant' } }] });
    } catch (error) {
        console.error(`Error generating text for key: ${cacheKey}`, error.message);
        res.status(500).send(error.message);
    }
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
    const { model = 'openai', customInstance, ...rest } = options;
    if (model === 'mistral') {
        return generateTextMistral(messages, rest);
    } else if (model === 'llama') {
        return generateTextLlama(messages, rest);
    } else if (model === 'claude') {
        if (customInstance) {
            return customInstance(messages, rest);
        }
        return generateTextClaude(messages, rest);
    }
    return generateText(messages, rest);
}

// Helper function to create a hash for the cache key
function createHashKey(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
