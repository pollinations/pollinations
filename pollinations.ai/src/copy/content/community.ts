// CommunityPage content configuration

export const COMMUNITY_PAGE = {
    title: {
        text: "Contribute",
        translate: true,
    },

    subtitle: {
        text: "We're crafting a haven where developers, creators, and AI enthusiasts collaborate and bloom together.",
        transform: true,
    },

    // News section
    newsTitle: {
        text: "What's New",
        translate: true,
    },

    newsFilePath:
        "https://raw.githubusercontent.com/pollinations/pollinations/production/NEWS/transformed/highlights.md",

    discordTitle: {
        text: "💬 Discord",
        translate: true,
    },

    discordSubtitle: {
        text: "Chat with builders, get help, share what you're working on. We're friendly!",
        transform: true,
    },

    githubTitle: {
        text: "🛠️ GitHub",
        translate: true,
    },

    githubSubtitle: {
        text: "Contribute code, report bugs, submit your app to the showcase, or just star us!",
        transform: true,
    },

    // Buttons
    joinDiscordButton: {
        text: "Join Discord",
        translate: true,
    },

    pollenBetaButton: {
        text: "🧪 #pollen-beta",
        translate: true,
    },

    starContributeButton: {
        text: "⭐ Star & Contribute",
        translate: true,
    },

    submitAppButton: {
        text: "🚀 Submit App",
        translate: true,
    },

    contributeButton: {
        text: "Contribute",
        translate: true,
    },

    // Voting section
    votingTitle: {
        text: "Have Your Say",
        transform: true,
    },

    votingSubtitle: {
        text: "We build what the community wants. Vote on what matters to you:",
        transform: true,
    },

    // Vote counts are approximate and need manual updates
    votingIssues: [
        {
            emoji: "🤖",
            title: "Which models should we add next?",
            url: "https://github.com/pollinations/pollinations/issues/5321",
            votes: 172,
        },
        {
            emoji: "💳",
            title: "What payment methods do you want?",
            url: "https://github.com/pollinations/pollinations/issues/4826",
            votes: 201,
        },
        {
            emoji: "🔐",
            title: "What login providers do you want?",
            url: "https://github.com/pollinations/pollinations/issues/5543",
            votes: 35,
        },
    ],

    supportersTitle: {
        text: "Supporters",
        translate: true,
    },

    supportersSubtitle: {
        text: "We're grateful to our supporters for their contributions to the platform.",
        transform: true,
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

    // Top Contributors section
    topContributorsTitle: {
        text: "Most Active Contributors",
        translate: true,
    },
    topContributorsDescription: {
        text: "Meet the most active contributors to the pollinations.ai",
        translate: true,
    },
    githubRepositoryLink: {
        text: "GitHub repository",
        translate: true,
    },
    overThePastYear: {
        text: "over the past year.",
        translate: true,
    },
    commitsLabel: {
        text: "commits",
        translate: true,
    },
    commitLabel: {
        text: "commit",
        translate: true,
    },
};
