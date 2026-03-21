// HelloPage content configuration

export const HELLO_PAGE = {
    pageTitle: "hello",
    pageDescription:
        "Build AI apps with easy APIs, free compute, and community support",
    // Section 1 — Hero
    heroTitle: "Build an AI app.",
    heroBodyPrefix: "⚡ One API for text, image, audio, and video.",
    heroBodyBold: "We handle the models and infrastructure.",
    heroBodySuffix: " Free to start, scales with you. 🌱",
    heroStat1: "10K",
    heroStat1Label: "weekly active devs",
    heroStat2: "1.5M",
    heroStat2Label: "requests / day",
    heroStat3: "500+",
    heroStat3Label: "live apps",
    startBuildingButton: "Register",
    joinDiscordButton: "Join the Discord",

    readTheDocsButton: "Read the Docs",

    // How it works section
    howItWorksTitle: "How it works",
    howItWorksBuildDesc: "Use one API across models.",
    howItWorksShipDesc: "Start free with regular compute refills.",
    howItWorksGetPaidDesc: "Your users get their own compute.",

    // Start free section
    startFreeTitle: "Start free",
    startFreeLines: [
        {
            pre: "Use ",
            bold: "one API",
            post: " across models",
            emoji: "🔌",
            pillColor: "bg-primary-light",
        },
        {
            pre: "",
            bold: "No setup",
            post: " required",
            emoji: "🚀",
            pillColor: "bg-accent-light",
        },
        {
            pre: "",
            bold: "Free compute with regular refills",
            post: " to build and ship",
            emoji: "🌱",
            pillColor: "bg-tertiary-light",
        },
        {
            pre: "As your app grows, you ",
            bold: "get more compute",
            post: "",
            emoji: "📈",
            pillColor: "bg-secondary-light",
        },
    ],
    freeDailyComputeTitle: "Free compute",

    tiersBetaNote: "🧪 Beta — values may shift.",
    computeTiersTitle: "Tiers",
    tierHowText: "Want to know more?",
    tierHowLink: "Check our FAQ",

    tierSeedEmoji: "🌿",
    tierSeedTitle: "Seed",
    tierSeedDescription: "You're building. Contributing, shipping apps.",
    tierSeedGrant: "0.15 pollen / hour",
    tierSeedPoints: "",
    tierFlowerEmoji: "🌸",
    tierFlowerTitle: "Flower",
    tierFlowerDescription: "Your app is live and getting used.",
    tierFlowerGrant: "10 pollen / day",
    tierFlowerPoints: "",
    tierNectarEmoji: "🍯",
    tierNectarTitle: "Nectar",
    tierNectarDescription: "Most active builders.",
    tierNectarGrant: "20 pollen / day",
    tierNectarPoints: "",

    // Section — What you get
    whatYouGetTitle: "What's inside",
    whatYouGetItems: [
        {
            emoji: "🪩",
            title: "Text, image, video, audio",
            desc: "All modalities, one endpoint.",
            linkText: "Browse the model list",
            linkUrl: "enterModels",
        },
        {
            emoji: "🪄",
            title: "OpenAI-compatible",
            desc: "Change one line. Your existing SDK code just works.",
        },
        {
            emoji: "🎯",
            title: "Media uploads",
            desc: "Upload files, get a URL. Use them as inputs for generation.",
        },
        {
            emoji: "🔥",
            title: "Streaming & tools",
            desc: "Real-time responses, tool use, structured output.",
        },
        {
            emoji: "🔮",
            title: "Vision, search & embeddings",
            desc: "Models that see images, search the live web, and turn content into vectors.",
        },
        {
            emoji: "💎",
            title: "Open source & transparent",
            desc: "The whole stack. Fork it, self-host, contribute.",
            linkText: "Fork on GitHub",
            linkUrl: "githubFork",
        },
        {
            emoji: "🤝",
            title: "For your users",
            desc: "Each user who signs in gets free hourly compute to try your app.\nWhen they need more, it just works — no Stripe setup on your end.",
            linkText: "🔌 Set up for your app",
            linkUrl: "byopDocs",
            fullWidth: true,
        },
    ],
    whatYouGetFooter: "Dig deeper?",
    whatYouGetFooterLink: "Explore the docs",
    whatYouGetFooterUrl: "enterApiDocs",

    // Section 8 — We Build in the Open
    openTitle: "We build in the open",
    recentUpdatesTitle: "New",
    roadmapLabel: "Next",
    roadmapItems: [
        {
            emoji: "🧮",
            title: "Scoring",
            description:
                "Transparent score based on GitHub activity, API usage, and apps shipped. Determines your tier.",
        },
        {
            emoji: "🔑",
            title: "Auth",
            description: "OAuth for your users. Token handling built in.",
        },
        {
            emoji: "🏠",
            title: "Hosting",
            description: "Deploy on our infra. No setup, no separate bill.",
        },
        {
            emoji: "🌻",
            title: "Rewards",
            description: "People use your app, you earn pollen.",
        },
        {
            emoji: "🗺️",
            title: "Discovery",
            description: "A place where people find what you built.",
        },
    ],
    comingFooterEmoji: "",
    comingFooterLine1: "",
    comingFooterLine2: "",

    // Section 9 — CTA
    ctaTitle: "Get started",
    ctaBody: "One API. Open source.",
    browseAppsLink: "Browse Apps",
    communityLink: "Community",
};
