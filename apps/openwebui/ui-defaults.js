// What a new Open WebUI user sees first. worker.js seeds these as env vars on
// a fresh database; scripts/apply-ui-defaults.mjs writes the same values into
// an existing one.

// Pinned for users who have not pinned any: everyday text models that need no
// paid balance, cheapest first. The first one is also the default for new
// chats. The rest of the picker keeps the order gen serves it in. Ids that
// leave the catalog drop out.
export const PINNED_MODELS = [
    "openai/gpt-5.4-nano",
    "openai/gpt-6-luna",
    "openai/gpt-6.1-sol",
    "moonshotai/kimi-k3",
];

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
export const banners = (enterUrl) => [
    {
        id: "own-pollen",
        type: "info",
        content: `Chats and generations use your own Pollen. [Check your balance](${enterUrl}/pollen) or [top up](${enterUrl}/top-up).`,
        dismissible: true,
        timestamp: 0,
    },
];
