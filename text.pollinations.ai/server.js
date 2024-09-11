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
    const seed = req.query.seed || null;
    const cacheKey = `${prompt}-${seed}`;

    if (cache[cacheKey]) {
        return res.send(cache[cacheKey]);
    }

    try {
        const response = await generateText([{ role: 'user', content: prompt }], seed);
        cache[cacheKey] = response;
        res.send(response);
    } catch (error) {
        res.status(500).send(error.message);
    }
});

// POST request handler
app.post('/', async (req, res) => {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
        return res.status(400).send('Invalid messages array');
    }
    const seed = req.query.seed || null;
    const cacheKey = JSON.stringify(messages) + `-${seed}`;

    if (cache[cacheKey]) {
        return res.send(cache[cacheKey]);
    }

    try {
        const response = await generateText(messages, seed);
        cache[cacheKey] = response;
        res.send(response);
    } catch (error) {
        res.status(500).send(error.message);
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

