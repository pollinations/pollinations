#!/usr/bin/env node

// Holds the Pollinations key for the review agent. The agent runs as another
// user, so it can call this proxy but can't read the key from our process.
// Only the Messages API is forwarded, on one cheap model and a bounded number
// of times, so a prompt-injected agent can't spend much more than a review.
const http = require("node:http");

const { POLLINATIONS_API_KEY } = process.env;
const MODEL = "openai/gpt-6-luna";
const MAX_REQUESTS = 60;
let requests = 0;

http.createServer(async (req, res) => {
    try {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        if (
            req.method !== "POST" ||
            !req.url.startsWith("/v1/messages") ||
            ++requests > MAX_REQUESTS
        ) {
            res.writeHead(403).end();
            return;
        }
        const body = { ...JSON.parse(Buffer.concat(chunks)), model: MODEL };
        const beta = req.headers["anthropic-beta"];
        const upstream = await fetch(`https://gen.pollinations.ai${req.url}`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "anthropic-version":
                    req.headers["anthropic-version"] ?? "2023-06-01",
                ...(beta && { "anthropic-beta": beta }),
                authorization: `Bearer ${POLLINATIONS_API_KEY}`,
            },
            body: JSON.stringify(body),
        });
        res.writeHead(upstream.status, {
            "content-type":
                upstream.headers.get("content-type") ?? "application/json",
        });
        for await (const chunk of upstream.body ?? []) res.write(chunk);
        res.end();
    } catch (error) {
        if (!res.headersSent) res.writeHead(502);
        res.end(String(error));
    }
}).listen(8711, "127.0.0.1");
