import { LLMThemeResponse, processTheme } from "../theme/engine";
import type { ThemeCopy } from "../buildPrompts";

export const CustomTheme: LLMThemeResponse = {
    "slots": {
        "slot_0": {
            "hex": "#213524",
            "ids": [
                "text.primary",
                "button.primary.border",
                "border.strong",
                "logo.main",
            ],
        },
        "slot_1": {
            "hex": "#426240",
            "ids": [
                "text.secondary",
                "text.brand",
                "button.primary.bg",
                "indicator.text",
                "border.brand",
                "border.main",
            ],
        },
        "slot_2": {
            "hex": "#67845B",
            "ids": ["text.tertiary", "input.placeholder"],
        },
        "slot_3": {
            "hex": "#82A975",
            "ids": ["text.caption", "indicator.audio"],
        },
        "slot_4": {
            "hex": "#FFFFFF",
            "ids": ["text.inverse"],
        },
        "slot_5": {
            "hex": "#A89A5B",
            "ids": [
                "text.highlight",
                "button.secondary.bg",
                "button.secondary.border",
                "button.focus.ring",
                "indicator.image",
                "border.highlight",
                "logo.accent",
            ],
        },
        "slot_6": {
            "hex": "#F3F5EF",
            "ids": ["surface.page"],
        },
        "slot_7": {
            "hex": "#E2EDD9",
            "ids": ["surface.card", "border.faint"],
        },
        "slot_8": {
            "hex": "#C8D9B2",
            "ids": ["surface.base", "border.subtle"],
        },
        "slot_9": {
            "hex": "#F7FAF3",
            "ids": ["input.bg"],
        },
        "slot_10": {
            "hex": "#A8BFA7",
            "ids": ["input.border"],
        },
        "slot_11": {
            "hex": "#D3DBCA",
            "ids": ["button.disabled.bg"],
        },
        "slot_12": {
            "hex": "#82A97580",
            "ids": ["button.hover.overlay"],
        },
        "slot_13": {
            "hex": "#67845B80",
            "ids": ["button.active.overlay"],
        },
        "slot_14": {
            "hex": "#A89A5B33",
            "ids": ["shadow.brand.sm"],
        },
        "slot_15": {
            "hex": "#A89A5B55",
            "ids": ["shadow.brand.md"],
        },
        "slot_16": {
            "hex": "#A89A5B88",
            "ids": ["shadow.brand.lg"],
        },
        "slot_17": {
            "hex": "#21352422",
            "ids": ["shadow.dark.sm"],
        },
        "slot_18": {
            "hex": "#21352444",
            "ids": ["shadow.dark.md"],
        },
        "slot_19": {
            "hex": "#21352466",
            "ids": ["shadow.dark.lg"],
        },
        "slot_20": {
            "hex": "#21352499",
            "ids": ["shadow.dark.xl"],
        },
        "slot_21": {
            "hex": "#A89A5B44",
            "ids": ["shadow.highlight.sm"],
        },
        "slot_22": {
            "hex": "#A89A5B77",
            "ids": ["shadow.highlight.md"],
        },
    },
    "borderRadius": {
        "radius.button": "8px",
        "radius.subcard": "8px",
        "radius.card": "12px",
    },
    "fonts": {
        "font.title": "Rakkas",
        "font.headline": "Oswald",
        "font.body": "Roboto",
    },
};

export const CustomCssVariables = processTheme(CustomTheme).cssVariables;

// Copy generated with prompt: "robin hood"
export const CustomCopy: ThemeCopy = {
    HELLO_PAGE: {
        heroTitle: { text: "Gen AI for the many, with heart." },
        heroIntro: {
            text: "We're a small, scrappy team reclaiming AI for the community—simple, fair, and built with you.",
        },
        heroTagline: {
            text: "Looking for an API that just works, or a partner to bring your bold vision to life? Welcome home.",
        },
        pollenTitle: { text: "Pollen: One fair credit for all." },
        getPollenTitle: { text: "Pollen for the people, your way." },
        creativeLaunchpadTitle: { text: "Robin Hood's Launchpad." },
        differenceTitle: { text: "Open-source for all." },
        roadmapTitle: { text: "The Horizon: An Open Creative Economy" }, // Fallback to original
        ctaTitle: { text: "Create for all." },
    },
    APPS_PAGE: {
        title: { text: "Robin's Network" },
        subtitle: {
            text: "Robin Hood vibe: community-built apps powered by Pollinations. Browse, try, ship.",
        },
    },
    DOCS_PAGE: {
        title: { text: "Redistribute." },
        intro: {
            text: "Like a trusty bow for creators, our API is simple, powerful, elegant. One endpoint for text, images, audio—your vision takes flight.",
        },
    },
    COMMUNITY_PAGE: {
        title: { text: "Give back." },
        subtitle: {
            text: "We're building a platform where developers, creators, and AI enthusiasts collaborate and innovate together.",
        },
        newsTitle: { text: "Updates for all." },
        discordTitle: { text: "Merry Men." },
        discordSubtitle: {
            text: "Join the Merry Men for real-time talks and support.",
        },
        githubTitle: { text: "People's Code." },
        githubSubtitle: {
            text: "Band together to fork open-source and contribute code.",
        },
        supportersTitle: {
            text: "Just to confirm, you want 1–3 sentences but under ...",
        }, // Needs fixing
        supportersSubtitle: {
            text: "Thank you, supporters, for your generous gifts, keeping this platform for all.",
        },
    },
    PLAY_PAGE: {
        createTitle: { text: "Guard Commons." },
        watchTitle: {
            text: "Just to confirm: under 2 words means a 1- or 2-wor...",
        }, // Needs fixing
        createDescription: {
            text: "Test our API, try different models, and see what you can create. A demo playground for the people—explore and experiment.",
        },
        feedDescription: {
            text: "Watch the network's real-time heartbeat for the people. See what the community creates through our APIs.",
        },
    },
};
