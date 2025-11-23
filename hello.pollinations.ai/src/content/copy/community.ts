// CommunityPage content configuration

export const COMMUNITY_PAGE = {
    title: {
        text: "Contribute",
        transforms: ["responsive", "translateTo", "brevity:3"],
    },

    subtitle: {
        text: "We're building a platform where developers, creators, and AI enthusiasts collaborate and innovate together.",
        transforms: ["responsive", "translateTo", "brevity:25"],
    },

    // News section
    newsTitle: {
        text: "What's New",
        transforms: ["responsive", "translateTo", "brevity:3"],
    },

    newsFilePath: "/NEWS.md",

    discordTitle: {
        text: "Discord",
        transforms: ["responsive", "translateTo", "brevity:3"],
    },

    discordSubtitle: {
        text: "Join our community for real-time discussions and support.",
        transforms: ["responsive", "translateTo", "brevity:25"],
    },

    githubTitle: {
        text: "GitHub",
        transforms: ["responsive", "translateTo", "brevity:3"],
    },

    githubSubtitle: {
        text: "Collaborate on open-source projects and contribute code.",
        transforms: ["responsive", "translateTo", "brevity:25"],
    },

    // Buttons
    joinDiscordButton: {
        text: "Join Discord",
    },

    contributeButton: {
        text: "Contribute",
    },

    supportersTitle: {
        text: "Supporters",
        transforms: ["responsive", "translateTo", "brevity:3"],
    },

    supportersSubtitle: {
        text: "We're grateful to our supporters for their contributions to our platform.",
        transforms: ["responsive", "translateTo", "brevity:25"],
    },

    // Supporters data
    supportersList: [
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
    ],

    // Logo generation settings
    supporterLogoPrompt:
        "Brutalist logo design with bold geometric shapes, heavy lines, stark contrast, raw minimalist aesthetic, transparent background (no background), flat design style. Company:",
    supporterLogoSeed: 1,
    supporterLogoModel: "nanobanana",
};
