import express from 'express';
import generateText from './generateText.js';
import bodyParser from 'body-parser';

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

const cache = {};

// GET request handler
app.get('/:prompt', async (req, res) => {
    const prompt = decodeURIComponent(req.params.prompt);
    const jsonMode = req.query.json?.toLowerCase() === 'true';
    console.log("query", req.query, "prompt", prompt, "jsonMode", jsonMode);

    const seed = req.query.seed ? parseInt(req.query.seed, 10) : null;
    const cacheKey = `${prompt}-${seed}`;

    console.log(`Received GET request with prompt: ${prompt} and seed: ${seed}`);

    if (cache[cacheKey]) {
        console.log(`Cache hit for key: ${cacheKey}`);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.send(cache[cacheKey]);
    }

    try {
        const response = await generateText([{ role: 'user', content: prompt }], { seed, jsonMode });
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
    if (!messages || !Array.isArray(messages)) {
        console.log('Invalid messages array');
        return res.status(400).send('Invalid messages array');
    }
    const seed = req.query.seed ? parseInt(req.query.seed, 10) : null;
    const cacheKey = JSON.stringify(messages) + `-${seed}`;

    console.log(`Received POST request with messages: ${JSON.stringify(messages)} and seed: ${seed}`);

    if (cache[cacheKey]) {
        console.log(`Cache hit for key: ${cacheKey}`);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.send(cache[cacheKey]);
    }

    try {
        const response = await generateText(messages, { seed, jsonMode });
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
