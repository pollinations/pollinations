// Single source of truth for the Open WebUI UI defaults this deployment seeds.
//
// Open WebUI writes each DEFAULT_CONFIG key into the Postgres `config` table
// the first time it boots against an empty database, and Config.get then
// prefers the stored row forever. So a fresh install gets these values from
// worker.js envVars, and an install that has already booted gets them from
// scripts/apply-ui-defaults.mjs. Both read this file, so the two paths cannot
// drift. See README, "How settings reach an existing install".

// Default model for a new chat. The previous value, the bare prefix "openai",
// is not an id in gen's catalog, so the picker fell back to the alphabetically
// first community model.
export const DEFAULT_MODEL = "openai/gpt-5.4-nano";

// Pinned to the sidebar. Cheap default, one coding model, and one strong model
// per neighbouring provider, so the picker is not 300 rows of nothing.
export const PINNED_MODELS = [
    "openai/gpt-5.4-nano",
    "openai/gpt-5.3-codex",
    "google/gemini-3.8-flash",
    "anthropic/claude-sonnet-5.5",
];

// Upstream's own defaults suggest options trading and children's art. title is
// a list of strings, not a string: the frontend renders each entry as a line.
export const PROMPT_SUGGESTIONS = [
    {
        title: ["Explain this", "error and suggest a fix"],
        content: "Explain this error, suggest a fix, then show the diff.",
    },
    {
        title: ["Draft a reply", "to this email"],
        content: "Draft a friendly reply to this email in under 120 words.",
    },
    {
        title: ["Turn my notes", "into a checklist"],
        content:
            "Turn these rough notes into a checklist with owners and dates.",
    },
    {
        title: ["Compare", "these two options"],
        content:
            "Compare these two options in a short table, then recommend one.",
    },
];

const BANNER_TIMESTAMP = Date.UTC(2026, 9, 3);

// Both banners are dismissible, so a user who has read them never sees them
// again. "pollinations-tools" points at the MCP tool server that worker.js
// already registers: it is opt-in per chat, and nothing surfaced it before.
export const BANNERS = [
    {
        id: "pollen-billing",
        type: "info",
        content:
            "Every chat here is paid from your own Pollinations wallet. [Check your balance](https://enter.pollinations.ai/pollen) or [top up](https://enter.pollinations.ai/top-up) before you run out.",
        dismissible: true,
        timestamp: BANNER_TIMESTAMP,
    },
    {
        id: "pollinations-tools",
        type: "info",
        content:
            "Optional: open the tools menu on any chat to attach the Pollinations tool server and generate images, video and audio. Tool calls are billed from your wallet like a chat is.",
        dismissible: true,
        timestamp: BANNER_TIMESTAMP,
    },
];
