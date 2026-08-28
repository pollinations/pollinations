// CommunityPage content configuration

export const COMMUNITY_PAGE = {
    pageTitle: "community",
    pageDescription:
        "Contribute to pollinations.ai — open source, open roadmap, open community",
    // Section 1 — Hero
    title: "Contribute",
    subtitlePrefix: "🌸 pollinations.ai is open source.",
    subtitleBold: "Builders shape the platform directly.",
    subtitleSuffix:
        " Share what you need, meet the people using it, and help build what comes next. 🌿",
    heroStat1: "17K+",
    heroStat1Label: "Discord members",
    heroStat2: "4K+",
    heroStat2Label: "GitHub stars",
    heroStat3: "500+",
    heroStat3Label: "live apps",

    // Section 2 — Build with the community
    contributeTitle: "Build with the community",
    contributeBody:
        "Meet other builders, talk with users, and work directly on the open source platform.",
    contributeCard1Title: "Ship an app",
    contributeCard1Body:
        "Share what you built, get feedback, and help users discover it.",
    contributeCard2Title: "Fix a bug or improve the docs",
    contributeCard2Body:
        "Open a PR, close an issue, improve examples, or make the docs clearer.",
    contributeCard3Title: "Help in Discord",
    contributeCard3Body:
        "Answer questions, share experiments, and tell the team what feels missing.",
    contributeNotePre: "Community feedback shapes the roadmap: ",
    contributeNoteLink: "models, wallets, docs, and developer tools",
    contributeNotePost: " all improve through what builders report and ship.",
    learnAboutTiersButton: "Join the conversation",

    // Section 3 — Jump In
    jumpInTitle: "Where to start",
    discordTitle: "Discord",
    discordEmoji: "💬",
    discordDesc1: "Chat with builders, ",
    discordDesc1Em: "get help",
    discordDesc1End: ", share what you're working on.",
    discordDesc2Pre: "Start in ",
    discordDesc2Link: "#pollen-beta",
    discordDesc2Post: " if you're new.",
    githubTitle: "GitHub",
    githubEmoji: "🛠️",
    githubDesc: "Contribute code, report bugs, review PRs, or just ",
    githubDescBold: "star us",
    githubDescEnd: ".",
    submitAppTitle: "Submit Your App",
    submitEmoji: "🚀",
    submitDesc: "Built something with Pollinations? ",
    submitDescBold: "Add it to the showcase.",

    // Buttons
    joinDiscordButton: "Join Discord",
    pollenBetaButton: "#pollen-beta",
    starContributeButton: "Star & Contribute",
    goodFirstIssuesButton: "Good First Issues",
    submitAppButton: "Submit App",

    // Section 4 — Voting + Contributors
    votingTitle: "Have your say",
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

    // Top Contributors
    topContributorsTitle: "Most active contributors",
    topContributorsDescription:
        "These folks are actively building and improving the platform.",
    topContributorsCta: "Want to join them? Check out our",
    githubRepositoryLink: "GitHub repository",
    overThePastYear: "and get started.",
    commitsLabel: "commits",
    commitLabel: "commit",
    votesLabel: "votes",

    // Community model providers and leaderboards
    providersTitle: "Community model providers",
    providersSubtitle:
        "Independent providers sharing their models with everyone on Pollinations.",
    providerModelLabel: "model",
    providerModelsLabel: "models",
    providersLoading: "Loading community providers…",
    providersEmpty: "No provider profiles are available right now.",
    leaderboardsTitle: "Community model leaderboards",
    leaderboardsSubtitle:
        "Daily rankings from real usage across community-hosted models.",
    textLeaderboardLabel: "Text models",
    imageLeaderboardLabel: "Image models",
    leaderboardUpdatedLabel: "Updated",
    leaderboardsLoading: "Loading the latest leaderboards…",
    leaderboardsEmpty: "No leaderboard images are available right now.",

    // Build Diary + Supporters
    buildDiaryTitle: "Build diary",
    buildDiarySubtitle: "A visual log of what we ship every day.",

    supportersTitle: "Supporters",
    supportersSubtitle:
        "We're grateful to our supporters for their contributions to the platform.",
    supportersList: [
        {
            name: "Perplexity AI",
            url: "https://www.perplexity.ai/",
            logo: "/supporters/perplexity.svg",
        },
        {
            name: "AWS Activate",
            url: "https://aws.amazon.com/",
            logo: "/supporters/aws.svg",
        },
        {
            name: "io.net",
            url: "https://io.net/",
            logo: "/supporters/io-net.svg",
        },
        {
            name: "BytePlus",
            url: "https://www.byteplus.com/",
            logo: "/supporters/byteplus.svg",
        },
        {
            name: "Google Cloud for Startups",
            url: "https://cloud.google.com/",
            logo: "/supporters/google-cloud.svg",
        },
        {
            name: "NVIDIA Inception",
            url: "https://www.nvidia.com/en-us/deep-learning-ai/startups/",
            logo: "/supporters/nvidia.svg",
        },
        {
            name: "Azure (MS for Startups)",
            url: "https://azure.microsoft.com/",
            logo: "/supporters/azure.svg",
        },
        {
            name: "Cloudflare",
            url: "https://developers.cloudflare.com/workers-ai/",
            logo: "/supporters/cloudflare.svg",
        },
        {
            name: "Scaleway",
            url: "https://www.scaleway.com/",
            logo: "/supporters/scaleway.svg",
        },
        {
            name: "Modal",
            url: "https://modal.com/",
            logo: "/supporters/modal.svg",
        },
        {
            name: "Nebius",
            url: "https://nebius.com/",
            logo: "/supporters/nebius.svg",
        },
        {
            name: "OpenAI",
            url: "https://openai.com/",
            logo: "/supporters/openai.svg",
        },
        {
            name: "OpenRouter",
            url: "https://openrouter.ai/",
            logo: "/supporters/openrouter.svg",
        },
        {
            name: "Fireworks AI",
            url: "https://fireworks.ai/",
            logo: "/supporters/fireworks.svg",
        },
        {
            name: "Replicate",
            url: "https://replicate.com/",
            logo: "/supporters/replicate.svg",
        },
        {
            name: "RunPod",
            url: "https://www.runpod.io/",
            logo: "/supporters/runpod.svg",
        },
        {
            name: "OVHcloud",
            url: "https://www.ovhcloud.com/",
            logo: "/supporters/ovhcloud.svg",
        },
        {
            name: "Lambda Labs",
            url: "https://lambda.ai/",
            logo: "/supporters/lambda.svg",
        },
        {
            name: "ElevenLabs",
            url: "https://elevenlabs.io/",
            logo: "/supporters/elevenlabs.svg",
        },
        {
            name: "AssemblyAI",
            url: "https://www.assemblyai.com/",
            logo: "/supporters/assemblyai.svg",
        },
        {
            name: "Alibaba Cloud",
            url: "https://www.alibabacloud.com/",
            logo: "/supporters/alibaba.svg",
        },
    ],
};
