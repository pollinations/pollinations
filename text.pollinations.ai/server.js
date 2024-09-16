import express from 'express';
import generateText from './generateText.js';
import generateTextMistral from './generateTextMistral.js';
import bodyParser from 'body-parser';
import cors from 'cors';

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(cors());

const cache = {};

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
    const cacheKey = `${prompt}-${seed}-${jsonMode}-${model}`;

    if (cache[cacheKey]) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.send(cache[cacheKey]);
    }

    console.log(`Received GET request with prompt: ${prompt}, seed: ${seed}, jsonMode: ${jsonMode}, and model: ${model}`);

    try {
        const response = await generateTextBasedOnModel([{ role: 'user', content: prompt }], { seed, jsonMode, model });
        cache[cacheKey] = response;
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
