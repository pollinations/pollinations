// What a new Open WebUI user sees first. worker.js seeds these as env vars on
// a fresh database; scripts/apply-ui-defaults.mjs writes the same values into
// an existing one.

// Shown first in the model picker, in this order: everyday text models (the
// first three need no paid balance), then two image models. The full catalog
// follows; ids that leave it are skipped.
export const STARTER_MODELS = [
    "openai/gpt-5.4-nano",
    "openai/gpt-6-luna",
    "openai/gpt-6.1-sol",
    "google/gemini-3.8-flash",
    "anthropic/claude-sonnet-5.5",
    "deepseek/deepseek-v4.1-flash",
    "moonshotai/kimi-k3",
    "black-forest-labs/flux.1.1-pro",
    "tongyi-mai/z-image-turbo",
];

// The first few are pinned for users who have not pinned any.
export const PINNED_MODELS = STARTER_MODELS.slice(0, 4);

// Ideas that work with any chat model (the upstream set is about options
// trading and kids' art).
export const PROMPT_SUGGESTIONS = [
    {
        title: ["Explain this code", "paste it and ask what it does"],
        content:
            "Explain what a piece of code does, step by step, and point out any bugs. Ask me to paste it first.",
    },
    {
        title: ["Draft a message", "that is clear and polite"],
        content:
            "Help me write a short, friendly message to a colleague who missed a deadline. Ask me what happened first.",
    },
    {
        title: ["Compare options", "and recommend one"],
        content:
            "I'm choosing between two options. Ask me what they are, then compare them in a table and recommend one.",
    },
    {
        title: ["Teach me something", "in five minutes"],
        content:
            "Pick a topic you think I'd enjoy, teach me the key idea in five short paragraphs, then quiz me with three questions.",
    },
];

// Chats are billed to the signed-in user's own wallet: say so once.
export const BANNERS = [
    {
        id: "own-pollen",
        type: "info",
        title: "Your Pollen",
        content:
            "Chats and generations are paid from your own Pollen. Check your balance or top up at [enter.pollinations.ai](https://enter.pollinations.ai).",
        dismissible: true,
        timestamp: 0,
    },
];
