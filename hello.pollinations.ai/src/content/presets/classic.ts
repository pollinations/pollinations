import type { LLMThemeResponse } from "../theme/theme-processor";
import { processTheme } from "../theme/theme-processor";
import { macrosToTheme } from "../theme/simplified-to-theme";
import type { MacroConfig } from "../theme/simplified-config.types";

const PALETTE = {
    charcoal: "#110518",
    grayDark: "#4A5557",
    gray: "#6E7A7C",
    grayMedium: "#BFCACC",
    grayLight: "#C7D4D6",
    grayUltraLight: "#DCE4E6",
    pink: "#FF69B4",
    yellow: "#ECF874",
    cyan: "#74F8EC",
    lime: "#BEF264",
};

export const ClassicMacroConfig: MacroConfig = {
    text: {
        primary: PALETTE.charcoal,
        secondary: PALETTE.grayDark,
        tertiary: PALETTE.gray,
        caption: PALETTE.gray,
        inverse: PALETTE.grayUltraLight,
        highlight: PALETTE.yellow,
    },
    surfaces: {
        page: PALETTE.grayLight,
        card: PALETTE.grayMedium,
        base: PALETTE.grayLight,
    },
    inputs: {
        bg: PALETTE.grayUltraLight,
        border: PALETTE.grayMedium,
        placeholder: PALETTE.gray,
    },
    buttons: {
        primary: {
            bg: PALETTE.charcoal,
            border: PALETTE.charcoal,
        },
        secondary: {
            bg: PALETTE.yellow,
            border: PALETTE.yellow,
        },
        ghost: {
            disabledBg: PALETTE.grayUltraLight,
            hoverOverlay: PALETTE.yellow,
            activeOverlay: PALETTE.yellow,
            focusRing: PALETTE.pink,
        },
    },
    borders: {
        highlight: PALETTE.yellow,
        main: PALETTE.gray,
        strong: PALETTE.charcoal,
        subtle: PALETTE.grayMedium,
        faint: PALETTE.grayMedium,
    },
    shadows: {
        brand: {
            sm: PALETTE.pink,
            md: PALETTE.pink,
            lg: PALETTE.pink,
        },
        dark: {
            sm: PALETTE.charcoal,
            md: PALETTE.charcoal,
            lg: PALETTE.charcoal,
            xl: PALETTE.charcoal,
        },
        highlight: {
            sm: PALETTE.lime,
            md: PALETTE.lime,
        },
    },
    brandSpecial: {
        brandMain: PALETTE.pink,
        logoMain: PALETTE.pink,
        logoAccent: PALETTE.yellow,
        indicatorImage: PALETTE.pink,
        indicatorText: PALETTE.yellow,
        indicatorAudio: PALETTE.cyan,
    },
    typography: {
        title: "Maven Pro",
        headline: "Mako",
        body: "Duru Sans",
    },
    radius: {
        button: "0px",
        card: "0px",
        input: "0px",
        subcard: "0px",
    },
};

export const ClassicTheme: LLMThemeResponse = macrosToTheme(ClassicMacroConfig);
export const ClassicCssVariables = processTheme(ClassicTheme).cssVariables;

export const ClassicCopy = {
    "HELLO_PAGE.heroTitle": "Gen AI with a Human Touch",
    "HELLO_PAGE.heroIntro":
        "We're a small, passionate team building a different kind of AI platform—one that's simple, beautiful, and built in direct partnership with our community.",
    "HELLO_PAGE.heroTagline":
        "Whether you need a reliable API that just works or a partner to sponsor your next big idea, you've found your home.",
    "HELLO_PAGE.pollenTitle": "Pollen: One Simple Credit for Everything",
    "HELLO_PAGE.pollenDescription":
        "Pollen is our single, unified credit for all generative media. It's the elegant solution to a chaotic landscape, designed to be predictable and fair for every type of builder.",
    "HELLO_PAGE.getPollenTitle": "Fuel Your Vision: Get Pollen Your Way",
    "HELLO_PAGE.getPollenIntro":
        "Our platform is designed for flexibility. Every developer can purchase Pollen directly, and those we partner with also receive a daily grant to kickstart their journey.",
    "HELLO_PAGE.buyCardTitle": "Simple & Fast: Buy What You Need",
    "HELLO_PAGE.buyCardDescription":
        "Have an idea and just need a great API to power it? Buy Pollen packs and start building in minutes. No strings attached.",
    "HELLO_PAGE.sponsorshipCardTitle":
        "Our Investment in You: The Sponsorship Program",
    "HELLO_PAGE.sponsorshipCardDescription":
        "We sponsor developers building the next wave of creative apps. As a partner, you receive a free daily Pollen grant to de-risk development and get your project off the ground.",
    "HELLO_PAGE.sponsorshipTiersTitle": "Grow With Us: The Sponsorship Tiers",
    "HELLO_PAGE.sponsorshipTiersDescription":
        "For our sponsored partners, the journey is a gamified path that rewards your progress. Start as a Spore with a daily grant, then grow to Seed, Flower, and Nectar.",
    "HELLO_PAGE.creativeLaunchpadTitle": "Your Creative Launchpad",
    "HELLO_PAGE.creativeLaunchpadIntro":
        "No matter how you get your Pollen, you get access to our high-level creative engines. We handle the complexity so you can focus on your vision.",
    "HELLO_PAGE.differenceTitle": "The Pollinations Difference",
    "HELLO_PAGE.differenceIntro":
        "Why build with us? Because we're building for you.",
    "HELLO_PAGE.roadmapTitle": "The Horizon: An Open Creative Economy",
    "HELLO_PAGE.roadmapIntro":
        "Our roadmap is focused on enabling success for every developer on our platform.",
    "HELLO_PAGE.roadmapComingSoonTitle": "Secure Front-End Spending",
    "HELLO_PAGE.roadmapComingSoonDescription":
        "The foundational tech allowing client-side apps to spend Pollen, a key step for monetization.",
    "HELLO_PAGE.roadmapQ1Title": "In-App Purchase",
    "HELLO_PAGE.roadmapQ1Description":
        "The economy opens. Users can buy Pollen inside your app, and you get a bonus for every purchase. This is the goal for our sponsored partners.",
    "HELLO_PAGE.roadmapOngoingTitle": "Beyond",
    "HELLO_PAGE.roadmapOngoingDescription":
        "We're moving towards a complete solution for AI app development, including hosting and app discovery.",
    "HELLO_PAGE.ctaTitle": "Ready to Create?",
    "HELLO_PAGE.ctaDescription":
        "Stop choosing between power and personality. Build with a platform that offers both.",
    "APPS_PAGE.title": "Ecosystem",
    "APPS_PAGE.subtitle":
        "Community-built apps, tools, and experiments—all Pollinations-powered. Browse, try, ship.",
    "DOCS_PAGE.title": "Integrate",
    "DOCS_PAGE.intro":
        "Our API is simple, powerful, and elegant. Single endpoint for text, images, and audio—this is where your vision takes flight.",
    "DOCS_PAGE.apiReference":
        "Dive into our full API docs for detailed information. AI agents can use our optimized prompt for seamless integration.",
    "DOCS_PAGE.imageGenerationTitle": "Image Generation",
    "DOCS_PAGE.textGenerationTitle": "Text Generation",
    "DOCS_PAGE.modelDiscoveryTitle": "Model Discovery",
    "DOCS_PAGE.authenticationTitle": "Authentication",
    "COMMUNITY_PAGE.title": "Contribute",
    "COMMUNITY_PAGE.subtitle":
        "We're building a platform where developers, creators, and AI enthusiasts collaborate and innovate together.",
    "COMMUNITY_PAGE.newsTitle": "What's New",
    "COMMUNITY_PAGE.discordTitle": "Discord",
    "COMMUNITY_PAGE.discordSubtitle":
        "Join our community for real-time discussions and support.",
    "COMMUNITY_PAGE.githubTitle": "GitHub",
    "COMMUNITY_PAGE.githubSubtitle":
        "Collaborate on open-source projects and contribute code.",
    "COMMUNITY_PAGE.supportersTitle": "Supporters",
    "COMMUNITY_PAGE.supportersSubtitle":
        "We're grateful to our supporters for their contributions to our platform.",
    "PLAY_PAGE.createTitle": "Create",
    "PLAY_PAGE.watchTitle": "Watch",
    "PLAY_PAGE.createDescription":
        "Test our API, play with different models, and see what you can create. This is a fun demo playground—not our main product, just a place to explore and experiment.",
    "PLAY_PAGE.feedDescription":
        "Watch the global pulse of our network in real-time. See what the community is creating right now through our APIs.",
    "PLAY_PAGE.toggleWatchOthers": "Watch what others are making",
    "PLAY_PAGE.toggleBackToPlay": "Back to Play",
};
