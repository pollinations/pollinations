import {
    CloudUploadIcon,
    CompassIcon,
    GitHubIcon,
    type IconProps,
    ImageIcon,
    LockIcon,
    MegaphoneIcon,
    SparklesIcon,
    SproutIcon,
    TerminalIcon,
    WalletIcon,
} from "@pollinations/ui";
import type { ComponentType } from "react";
import { ENTER_URL } from "../../config.ts";

const DISCORD = "https://discord.gg/pollinations-ai-885844321461485618";
const ENTER_DOCS = "https://gen.pollinations.ai/docs";
const BYOP_DOCS =
    "https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md";
const ENTER_MODELS = "https://enter.pollinations.ai#models";
const POLLI_CLI =
    "https://github.com/pollinations/pollinations/tree/main/packages/polli-cli";
const ENTER_TIERS_FAQ = "https://enter.pollinations.ai#what-are-tiers";
const GITHUB_FORK = "https://github.com/pollinations/pollinations/fork";

type IconComponent = ComponentType<IconProps>;

export const HELLO_META = {
    title: "pollinations.ai",
    description:
        "Build AI apps that pay for themselves. One API for text, image, audio, video. Users bring their own credits, you optionally take a share.",
};

export const HERO: {
    title: string;
    bodyPrefix: string;
    bodyBold: string;
    bodySuffix: string;
    ctas: { label: string; href: string }[];
} = {
    title: "Build an AI app.",
    bodyPrefix: "Build with one API for text, image, audio, and video. ",
    bodyBold: "We handle the models and infrastructure.",
    bodySuffix: " Users spend across apps. Earn rewards.",
    ctas: [
        { label: "Register", href: ENTER_URL },
        { label: "Join the Discord", href: DISCORD },
        { label: "Read the Docs", href: ENTER_DOCS },
    ],
};

export const STATS: { value: string; label: string }[] = [
    { value: "10K", label: "weekly active devs" },
    { value: "1.5M", label: "daily requests" },
    { value: "500+", label: "live apps" },
];

export type ToolboxItem = {
    icon: IconComponent;
    title: string;
    desc: string;
    link?: { text: string; href: string };
};

export const TOOLBOX: ToolboxItem[] = [
    {
        icon: WalletIcon,
        title: "Wallets & earnings",
        desc: "- Users **sign in** and spend from their **own wallet**\n- Set **spending caps**, **revoke access** any time\n- Turn on earnings on your **App Key** to receive a **share** when users spend in your app",
        link: { text: "Add Pollen to your app", href: BYOP_DOCS },
    },
    {
        icon: SparklesIcon,
        title: "All the models",
        desc: "- **Text, image, video, audio**\n- **Vision, search, embeddings**\n- Streaming, tools, structured output\n- **OpenAI-compatible** endpoints",
        link: { text: "Browse the model list", href: ENTER_MODELS },
    },
    {
        icon: TerminalIcon,
        title: "CLI for humans & agents",
        desc: '- `polli gen image "cat in space"` — **text, image, audio, video** in one CLI\n- **Agent-friendly**: `--json` output, stdin context, clear exit codes\n- Point Claude Code, Cursor, or Codex at the **shipped SKILL.md**',
        link: { text: "Install polli CLI", href: POLLI_CLI },
    },
    {
        icon: SproutIcon,
        title: "Free Credits",
        desc: "- **Refill Pollen** for prototypes & testing\n- Earn extra from **Pollen Quests**\n- More activity unlocks more room",
        link: { text: "How tiers work", href: ENTER_TIERS_FAQ },
    },
    {
        icon: ImageIcon,
        title: "Media inputs",
        desc: "- Upload **any media**, get a URL back\n- Use images, audio, documents in **model calls**",
    },
    {
        icon: GitHubIcon,
        title: "Open Source",
        desc: "- **Open and transparent** stack\n- Shaped by the **developer community**",
        link: { text: "Fork on GitHub", href: GITHUB_FORK },
    },
];

export const ROADMAP: {
    icon: IconComponent;
    title: string;
    description: string;
}[] = [
    {
        icon: LockIcon,
        title: "Pollinations Login",
        description: "Drop-in sign-in for your users. Token handling included.",
    },
    {
        icon: CloudUploadIcon,
        title: "App Hosting",
        description:
            "Push your app to our infra. No deploy setup, no separate bill.",
    },
    {
        icon: CompassIcon,
        title: "App Discovery",
        description: "Where users find your app.",
    },
    {
        icon: MegaphoneIcon,
        title: "Ads SDK",
        description: "Optional ad slots. Earnings go to your wallet.",
    },
];

export const CTA = {
    title: "Start building",
    body: "One API. Free credits to start, and earnings when your app gets used.",
    registerHref: ENTER_URL,
    docsHref: ENTER_DOCS,
};
