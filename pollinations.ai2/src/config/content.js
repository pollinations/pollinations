// Centralized content configuration
// All strings here are PROMPTS for the LLM, not final text
//
// SEEDS:
// - Text generation: seed: -1 (random, caching not yet implemented)
// - Image generation: use unique numbers (caching works!)

export const CONTEXT = `This text appears on pollinations.ai, an open-source generative AI platform from Berlin providing free text, image, and audio generation APIs.`;

// ============================================
// PLAY PAGE
// ============================================
export const PLAY_DESCRIPTION = {
    prompt: `Write a brief, relaxed Gen Z description for our API playground. Explain this is a demo to show how cool our API is - they can test it, play with it, try different models. Not our main product, just a fun trial. We're happy to have them here and hope they enjoy it. If they have requests, they can reach out. Keep it super brief, friendly, and chill. 2-3 sentences max.`,
    seed: 0,
};

export const FEED_DESCRIPTION = {
    prompt: `Write a brief, exciting description of the live feed. Explain this is watching the global pulse of our network - real-time generated media flowing through our APIs right now. It's a stream of imagination taking shape, what the community is creating this very moment. Keep it energetic, inspiring, and brief. 2 Gen Z vibe sentences max.`,
    seed: 0,
};

// ============================================
// DOCS PAGE
// ============================================
export const DOCS_INTRO = {
    prompt: `Write 2 sentences about our API being simple, powerful, and elegant. Single endpoint for text, images, audio. This is where your vision takes flight. Keep it inspiring and brief. Gen Z vibe.`,
    seed: 0,
};

export const DOCS_API_REFERENCE = {
    prompt: `Write 1-2 sentences explaining we have full API docs for deep dives, and for AI agents working with our API, we have an optimized prompt they can copy/paste. Keep it helpful and brief.`,
    seed: 0,
};

// ============================================
// COMMUNITY PAGE
// ============================================
export const COMMUNITY_TITLE = "Contribute";

export const COMMUNITY_SUBTITLE = {
    prompt: "Write 2-3 sentences about our community-driven approach. We're building a platform where developers, creators, and AI enthusiasts collaborate and innovate. Keep it brief, welcoming, and inspiring. Max 40 words.",
    seed: 0,
};

export const COMMUNITY_DISCORD_SUBTITLE = {
    prompt: "Write one very short sentence introducing our Discord channel. Max 10 words.",
    seed: 0,
};

export const COMMUNITY_GITHUB_SUBTITLE = {
    prompt: "Write one very short sentence about our GitHub repository as a hub for collaboration. Max 10 words.",
    seed: 0,
};

// ============================================
// SUPPORTERS SECTION
// ============================================
export const SUPPORTER_TITLE = "Supporters";

export const SUPPORTER_SUBTITLE =
    "We're grateful to our supporters for their contributions to our platform.";

// Master prompt for all supporter logos (base template)
// Combined with company name + description
export const SUPPORTER_LOGO_PROMPT = {
    prompt: "Brutalist logo design with bold geometric shapes, heavy lines, stark contrast, raw minimalist aesthetic, transparent background (no background), flat design style. Company:",
    seed: 1, // All logos use same seed for consistency
    model: "nanobanana", // Using nanobanana model
};

// Helper to generate supporter-specific prompts
// Combines master prompt + supporter name + unique ID
// Using description in prompt to make each prompt unique and avoid cache collisions
export function getSupporterLogoPrompt(name, description) {
    const prompt = `${SUPPORTER_LOGO_PROMPT.prompt} ${name}. ${description}`;
    console.log(`📝 Generated prompt for ${name}:`, prompt);
    return prompt;
}
