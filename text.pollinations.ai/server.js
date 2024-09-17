import express from 'express';
import generateText from './generateText.js';
import generateTextMistral from './generateTextMistral.js';
import bodyParser from 'body-parser';
import cors from 'cors';
import fs from 'fs';
import path from 'path';

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());
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

// Helper function to save cache to disk
function saveCache() {
    fs.writeFileSync(cachePath, JSON.stringify(cache), 'utf8');
}

// Helper function to generate text based on the model
async function generateTextBasedOnModel(messages, options) {
    const { model = 'openai', ...rest } = options;
    if (model === 'mistral') {
        return generateTextMistral(messages, rest);
    }
    return generateText(messages, rest);
}

// GET request handler
app.get('/:prompt', async (req, res) => {
    const prompt = decodeURIComponent(req.params.prompt);
    const jsonMode = req.query.json?.toLowerCase() === 'true';
    const seed = req.query.seed ? parseInt(req.query.seed, 10) : null;
    const model = req.query.model || 'openai';
    const systemPrompt = req.query.system ? decodeURIComponent(req.query.system) : null;
    const cacheKey = `${prompt}-${seed}-${jsonMode}-${model}-${systemPrompt}`;

    if (cache[cacheKey]) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.send(cache[cacheKey]);
    }

    console.log(`Received GET request with prompt: ${prompt}, seed: ${seed}, jsonMode: ${jsonMode}, model: ${model}, and systemPrompt: ${systemPrompt}`);

    try {
        const messages = [];
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }
        messages.push({ role: 'user', content: prompt });

        const response = await generateTextBasedOnModel(messages, { seed, jsonMode, model });
        cache[cacheKey] = response;
        saveCache();
        console.log(`Generated response for key: ${cacheKey}`);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.send(response);
    } catch (error) {
        console.error(`Error generating text for key: ${cacheKey}`, error);
        res.status(500).send(error.message);
    }
});

// POST request handler
app.post('/', async (req, res) => {
    const { messages } = req.body;
    const jsonMode = req.body.jsonMode || req.query.json?.toLowerCase() === 'true';
    const seed = req.query.seed ? parseInt(req.query.seed, 10) : req.body.seed;
    const model = req.body.model || req.query.model || 'openai';

    if (!messages || !Array.isArray(messages)) {
        console.log('Invalid messages array');
        return res.status(400).send('Invalid messages array');
    }

    const cacheKey = JSON.stringify(messages) + `-${seed}-${jsonMode}-${model}`;

    if (cache[cacheKey]) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.send(cache[cacheKey]);
    }

    console.log(`Received POST request with messages: ${JSON.stringify(messages)}, seed: ${seed}, jsonMode: ${jsonMode}, and model: ${model}`);

    try {
        const response = await generateTextBasedOnModel(messages, { seed, jsonMode, model });
        cache[cacheKey] = response;
        saveCache();
        console.log(`Generated response for key: ${cacheKey}`);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.send(response);
    } catch (error) {
        console.error(`Error generating text for key: ${cacheKey}`, error);
        res.status(500).send(error.message);
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
