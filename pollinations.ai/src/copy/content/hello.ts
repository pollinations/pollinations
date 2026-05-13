// HelloPage content configuration

export const HELLO_PAGE = {
    pageTitle: "hello",
    pageDescription:
        "Build AI apps that pay for themselves. One API for text, image, audio, video. Users bring their own credits, you optionally take a share.",
    // Section 1 — Hero
    heroTitle: "Build an AI app.",
    heroBodyPrefix: "⚡ Build with one API for text, image, audio, and video.",
    heroBodyBold: "We handle the models and infrastructure.",
    heroBodySuffix: " Users spend across apps. Earn rewards. 🌱",
    heroStat1: "10K",
    heroStat1Label: "weekly active devs",
    heroStat2: "1.5M",
    heroStat2Label: "daily requests",
    heroStat3: "500+",
    heroStat3Label: "live apps",
    startBuildingButton: "Register",
    joinDiscordButton: "Join the Discord",

    readTheDocsButton: "Read the Docs",

    // Section — Toolbox
    whatYouGetTitle: "Dev kit",
    whatYouGetItems: [
        {
            emoji: "👛",
            title: "Wallets & earnings",
            lead: "Users bring their own Pollen. You take a share.",
            desc: "- Users **sign in** and spend from their **own wallet** 👛\n- Set **spending caps**, **revoke access** any time\n- Turn on earnings on your **App Key** to receive a **share** when users spend in your app 💰",
            linkText: "Add Pollen to your app",
            linkUrl: "byopDocs",
        },
        {
            emoji: "🪩",
            title: "All the models",
            lead: "One API for current AI capabilities.",
            desc: "- **Text, image, video, audio**\n- **Vision, search, embeddings**\n- Streaming, tools, structured output\n- **OpenAI-compatible** endpoints",
            linkText: "Browse the model list",
            linkUrl: "enterModels",
        },
        {
            emoji: "⌨️",
            title: "CLI for humans & agents",
            lead: "Generate from the terminal.",
            desc: '- `polli gen image "cat in space"` — **text, image, audio, video** in one CLI 🎛️\n- **Agent-friendly**: `--json` output, stdin context, clear exit codes\n- Point Claude Code, Cursor, or Codex at the **shipped SKILL.md**',
            linkText: "Install polli CLI",
            linkUrl: "polliCli",
        },
        {
            emoji: "🌱",
            title: "Free Credits",
            lead: "Build before you need revenue.",
            desc: "- **Refill Pollen** for prototypes & testing\n- Earn extra from **Pollen Quests** 🎯\n- More activity unlocks more room 📈",
            linkText: "How tiers work",
            linkUrl: "enterTiersFaq",
        },
        {
            emoji: "🎯",
            title: "Media inputs",
            lead: "Files become generation context.",
            desc: "- Upload **any media**, get a URL back\n- Use images, audio, documents in **model calls**",
        },
        {
            emoji: "💎",
            title: "Open Source",
            lead: "Fork it, inspect it, build with us.",
            desc: "- **Open and transparent** stack\n- Shaped by the **developer community**",
            linkText: "Fork on GitHub",
            linkUrl: "githubFork",
        },
    ],
    whatYouGetFooter: "Need the details?",
    whatYouGetFooterLink: "read the API docs",
    whatYouGetFooterUrl: "enterApiDocs",

    // Section 8 — Last Updates
    openTitle: "Last Updates",
    recentUpdatesMoreText: "More",
    recentUpdatesMoreUrl: "highlightsSource",
    // Section 9 — Next
    roadmapTitle: "Next",
    roadmapItems: [
        {
            title: "Pollinations Login",
            description:
                "Drop-in sign-in for your users. Token handling included.",
        },
        {
            title: "App Hosting",
            description:
                "Push your app to our infra. No deploy setup, no separate bill.",
        },
        {
            title: "App Discovery",
            description: "Where users find your app.",
        },
        {
            title: "Ads SDK",
            description: "Optional ad slots. Earnings go to your wallet.",
        },
    ],
    comingFooterEmoji: "",
    comingFooterLine1: "",
    comingFooterLine2: "",

    // Section 9 — CTA
    ctaTitle: "Start building",
    ctaBody:
        "One API. Free credits, user wallets, and earnings when your app gets used.",
    browseAppsLink: "Browse Apps",
    communityLink: "Community",
};
