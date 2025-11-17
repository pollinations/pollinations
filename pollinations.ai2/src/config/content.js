// Centralized content configuration
// All strings here are PROMPTS for the LLM, not final text

export const CONTEXT = `This text appears on pollinations.ai, an open-source generative AI platform from Berlin providing free text, image, and audio generation APIs.`;

// Play page description
export const PLAY_DESCRIPTION = `Write a brief, relaxed Gen Z description for our API playground. Explain this is a demo to show how cool our API is - they can test it, play with it, try different models. Not our main product, just a fun trial. We're happy to have them here and hope they enjoy it. If they have requests, they can reach out. Keep it super brief, friendly, and chill. 2-3 sentences max.`;

// Feed page description
export const FEED_DESCRIPTION = `Write a brief, exciting description of the live feed. Explain this is watching the global pulse of our network - real-time generated media flowing through our APIs right now. It's a stream of imagination taking shape, what the community is creating this very moment. Keep it energetic, inspiring, and brief. 2 Gen Z vibe sentences max. `;

// Docs page intro
export const DOCS_INTRO = `Write 2 sentences about our API being simple, powerful, and elegant. Single endpoint for text, images, audio. This is where your vision takes flight. Keep it inspiring and brief. Gen Z vibe.`;

// Docs page - API reference section
export const DOCS_API_REFERENCE = `Write 1-2 sentences explaining we have full API docs for deep dives, and for AI agents working with our API, we have an optimized prompt they can copy/paste. Keep it helpful and brief.`;

// Community page
export const COMMUNITY_TITLE = "Contribute";
export const COMMUNITY_SUBTITLE =
    "Write 2-3 sentences about our community-driven approach. We're building a platform where developers, creators, and AI enthusiasts collaborate and innovate. Keep it brief, welcoming, and inspiring. Max 40 words.";
export const COMMUNITY_DISCORD_SUBTITLE =
    "Write one very short sentence introducing our Discord channel. Max 10 words.";
export const COMMUNITY_GITHUB_SUBTITLE =
    "Write one very short sentence about our GitHub repository as a hub for collaboration. Max 10 words.";

// Supporters section
export const SUPPORTER_TITLE = "Supporters";
export const SUPPORTER_SUBTITLE = {
    exact: true,
    content:
        "We're grateful to our supporters for their contributions to our platform.",
};

// Master prompt for all supporter logos
// This base prompt defines the style and constraints for logo generation
export const SUPPORTER_LOGO_PROMPT = {
    exact: true,
    content:
        "Professional tech company logo design, minimalist icon style, clean geometric shapes, modern corporate branding, centered composition on white background. Company:",
};

// Helper to generate supporter-specific prompts
// Combines master prompt + supporter name + unique ID
// Using description in prompt to make each prompt unique and avoid cache collisions
export function getSupporterLogoPrompt(name, description) {
    const prompt = `${SUPPORTER_LOGO_PROMPT.content} ${name}. ${description}`;
    console.log(`📝 Generated prompt for ${name}:`, prompt);
    return prompt;
}

// Supporters list - all data centralized here
export const SUPPORTERS = [
    {
        name: "Perplexity AI",
        url: "https://www.perplexity.ai/",
        description: "AI-powered search and conversational answer engine",
    },
    {
        name: "AWS Activate",
        url: "https://aws.amazon.com/",
        description: "GPU Cloud Credits",
    },
    {
        name: "io.net",
        url: "https://io.net/",
        description: "Decentralized GPU network for AI compute",
    },
    {
        name: "BytePlus",
        url: "https://www.byteplus.com/",
        description: "Official ByteDance cloud services and AI solutions",
    },
    {
        name: "Google Cloud for Startups",
        url: "https://cloud.google.com/",
        description: "GPU Cloud Credits",
    },
    {
        name: "NVIDIA Inception",
        url: "https://www.nvidia.com/en-us/deep-learning-ai/startups/",
        description: "AI startup support",
    },
    {
        name: "Azure (MS for Startups)",
        url: "https://azure.microsoft.com/",
        description: "OpenAI credits",
    },
    {
        name: "Cloudflare",
        url: "https://developers.cloudflare.com/workers-ai/",
        description: "Put the connectivity cloud to work for you.",
    },
    {
        name: "Scaleway",
        url: "https://www.scaleway.com/",
        description: "Europe's empowering cloud provider",
    },
    {
        name: "Modal",
        url: "https://modal.com/",
        description: "High-performance AI infrastructure",
    },
    {
        name: "NavyAI",
        url: "https://api.navy/",
        description: "AI API provider for OpenAI o3 and Gemini models",
    },
    {
        name: "Nebius",
        url: "https://nebius.com/",
        description:
            "AI-optimized cloud infrastructure with NVIDIA GPU clusters",
    },
];
