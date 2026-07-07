import {
    AppIcon,
    BotIcon,
    CardIcon,
    CodeIcon,
    DiscordIcon,
    GitHubIcon,
    type IconProps,
    KeyIcon,
    RocketIcon,
} from "@pollinations/ui";
import type { ComponentType } from "react";

const DISCORD = "https://discord.gg/pollinations-ai-885844321461485618";
const GITHUB = "https://github.com/pollinations/pollinations";
const GITHUB_SUBMIT_APP =
    "https://github.com/pollinations/pollinations/issues/new?template=tier-app-submission.yml";
const GITHUB_NEW_ISSUE =
    "https://github.com/pollinations/pollinations/issues/new";

type IconComponent = ComponentType<IconProps>;

export const COMMUNITY_META = {
    title: "Community | pollinations.ai",
    description:
        "Contribute to pollinations.ai — open source, open roadmap, open community.",
};

export const HERO = {
    title: "Contribute",
    subtitlePrefix: "pollinations.ai is open source. ",
    subtitleBold: "Builders shape the platform directly.",
    subtitleSuffix:
        " Share what you need, meet the people using it, and help build what comes next.",
};

export type HeroStatLiveKey = "discordMembers" | "githubStars" | "liveApps";

export type HeroStat = {
    value: string;
    label: string;
    href?: string;
    liveKey?: HeroStatLiveKey;
};

export const HERO_STATS: HeroStat[] = [
    {
        value: "17K+",
        label: "Discord members",
        href: DISCORD,
        liveKey: "discordMembers",
    },
    {
        value: "4K+",
        label: "GitHub stars",
        href: GITHUB,
        liveKey: "githubStars",
    },
    { value: "500+", label: "live apps", liveKey: "liveApps" },
];

export const CONTRIBUTE = {
    title: "Build with the community",
    body: "Meet other builders, talk with users, and work directly on the open source platform.",
    notePre: "Community feedback shapes the roadmap: ",
    noteLink: "models, wallets, docs, and developer tools",
    noteHref: DISCORD,
    notePost: " all improve through what builders report and ship.",
    ctaLabel: "Join the conversation",
    ctaHref: DISCORD,
};

export const CONTRIBUTE_CARDS: {
    icon: IconComponent;
    title: string;
    body: string;
    href: string;
}[] = [
    {
        icon: AppIcon,
        title: "Ship an app",
        body: "Share what you built, get feedback, and help users discover it.",
        href: GITHUB_SUBMIT_APP,
    },
    {
        icon: CodeIcon,
        title: "Fix a bug or improve the docs",
        body: "Open a PR, close an issue, improve examples, or make the docs clearer.",
        href: GITHUB_NEW_ISSUE,
    },
    {
        icon: DiscordIcon,
        title: "Help in Discord",
        body: "Answer questions, share experiments, and tell the team what feels missing.",
        href: DISCORD,
    },
];

export const START = {
    title: "Where to start",
};

export type StartCardData = {
    icon: IconComponent;
    title: string;
    body: string;
    buttonLabel: string;
    href: string;
};

export const START_DISCORD: StartCardData = {
    icon: DiscordIcon,
    title: "Discord",
    body: "Chat with builders, get help, and share what you're working on. New here? Start in #pollen-beta.",
    buttonLabel: "Join Discord",
    href: DISCORD,
};

export const START_CARDS: StartCardData[] = [
    {
        icon: GitHubIcon,
        title: "GitHub",
        body: "Contribute code, report bugs, review PRs, or just star us.",
        buttonLabel: "Star & Contribute",
        href: GITHUB,
    },
    {
        icon: RocketIcon,
        title: "Submit your app",
        body: "Built something with Pollinations? Add it to the showcase.",
        buttonLabel: "Submit App",
        href: GITHUB_SUBMIT_APP,
    },
];

export const VOTING = {
    title: "Have your say",
    votesLabel: "votes",
};

export const VOTING_ISSUES: {
    icon: IconComponent;
    title: string;
    url: string;
    votes: number;
}[] = [
    {
        icon: BotIcon,
        title: "Which models should we add next?",
        url: "https://github.com/pollinations/pollinations/issues/5321",
        votes: 172,
    },
    {
        icon: CardIcon,
        title: "What payment methods do you want?",
        url: "https://github.com/pollinations/pollinations/issues/4826",
        votes: 201,
    },
    {
        icon: KeyIcon,
        title: "What login providers do you want?",
        url: "https://github.com/pollinations/pollinations/issues/5543",
        votes: 35,
    },
];

export const CONTRIBUTORS = {
    title: "Most active contributors",
    description:
        "These folks are actively building and improving the platform.",
    ctaPre: "Want to join them? Check out our ",
    ctaLink: "GitHub repository",
    ctaHref: GITHUB,
    ctaPost: " and get started.",
    commitLabel: "commit",
    commitsLabel: "commits",
};

export const SUPPORTERS = {
    title: "Supporters",
    subtitle: "We're grateful to the partners who back the platform.",
};

export const SUPPORTERS_LIST: { name: string; url: string; logo: string }[] = [
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
];
