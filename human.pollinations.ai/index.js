import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// Simple in-memory queue: { id, messages, resolve, timestamp }
const waitingQueue = [];

// Cleanup old entries (5 min timeout)
setInterval(() => {
    const now = Date.now();
    for (let i = waitingQueue.length - 1; i >= 0; i--) {
        if (now - waitingQueue[i].timestamp > 300000) {
            waitingQueue[i].resolve({
                choices: [
                    {
                        message: {
                            role: "assistant",
                            content: "[No human responded in time]",
                        },
                    },
                ],
            });
            waitingQueue.splice(i, 1);
        }
    }
}, 10000);

// Get queue status
app.get("/queue", (_req, res) => {
    res.json({ waiting: waitingQueue.length });
});

// OpenAI-compatible chat completions endpoint
app.post("/v1/chat/completions", async (req, res) => {
    const { messages = [] } = req.body;
    const userMessage =
        messages.filter((m) => m.role === "user").pop()?.content || "";

    console.log(
        `[${new Date().toISOString()}] New message: "${userMessage.slice(0, 50)}..."`,
    );
    console.log(`[Queue size: ${waitingQueue.length}]`);

    // Check if someone is waiting for a response
    if (waitingQueue.length > 0) {
        // Get the oldest waiting person
        const waiting = waitingQueue.shift();

        // Send this person's message as the response to the waiting person
        waiting.resolve({
            id: `human-${Date.now()}`,
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: "human-1.0",
            choices: [
                {
                    index: 0,
                    message: { role: "assistant", content: userMessage },
                    finish_reason: "stop",
                },
            ],
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        });

        // Send the waiting person's message back to this person
        const waitingMessage =
            waiting.messages.filter((m) => m.role === "user").pop()?.content ||
            "";
        return res.json({
            id: `human-${Date.now()}`,
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: "human-1.0",
            choices: [
                {
                    index: 0,
                    message: { role: "assistant", content: waitingMessage },
                    finish_reason: "stop",
                },
            ],
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        });
    }

    // No one waiting - add to queue and wait for someone
    return new Promise((resolve) => {
        waitingQueue.push({
            id: `req-${Date.now()}`,
            messages,
            resolve: (response) => res.json(response),
            timestamp: Date.now(),
        });
        console.log(`[Added to queue, now ${waitingQueue.length} waiting]`);
    });
});

// Status endpoint
app.get("/", (_req, res) => {
    res.json({
        service: "Human API",
        description:
            "OpenAI-compatible endpoint where humans respond to humans",
        waiting: waitingQueue.length,
        endpoint: "/v1/chat/completions",
    });
});

const PORT = process.env.PORT || 18080;
app.listen(PORT, () => {
    console.log(`🧑‍🤝‍🧑 Human API running on http://localhost:${PORT}`);
    console.log(`POST /v1/chat/completions to connect with another human`);
});
