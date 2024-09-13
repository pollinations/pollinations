import express from 'express';
import { generate } from './generateText.js';
import bodyParser from 'body-parser';

const app = express();
const port = process.env.PORT || 3000;
const cache = new Map();

app.use(bodyParser.json());

const handleRequest = async (req, res) => {
    const jsonMode = req.query.json?.toLowerCase() === 'true' || req.body?.jsonMode;
    const seed = req.query.seed ? parseInt(req.query.seed, 10) : null;
    const isHelp = req.query.help?.toLowerCase() === 'true';

    let messages;
    if (req.method === 'GET') {
        const prompt = decodeURIComponent(req.params.prompt);
        messages = [{ role: 'user', content: prompt }];
    } else if (req.method === 'POST') {
        messages = req.body.messages;
        if (!Array.isArray(messages)) {
            return res.status(400).send('Invalid messages array');
        }
    }

    const cacheKey = JSON.stringify({ messages, seed, jsonMode, isHelp });

    console.log(`Received ${req.method} request:`, { messages, seed, jsonMode, isHelp });

    if (cache.has(cacheKey)) {
        console.log(`Cache hit for key: ${cacheKey}`);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.send(cache.get(cacheKey));
    }

    try {
        const response = await generate(messages, { seed, jsonMode, isHelp });
        cache.set(cacheKey, response);
        console.log(`Generated response for key: ${cacheKey}`);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.send(response);
    } catch (error) {
        console.error(`Error generating text for key: ${cacheKey}`, error);
        res.status(500).send(error.message);
    }
};

app.get('/:prompt', handleRequest);
app.post('/', handleRequest);

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
