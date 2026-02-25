import {
    DiscordIcon,
    GithubIcon,
    InstagramIcon,
    LinkedinIcon,
    RedditIcon,
    XIcon,
} from "../../ui/assets/SocialIcons";

export const SOCIAL_LINKS = {
    discord: {
        label: "Discord",
        icon: DiscordIcon,
        url: "https://discord.gg/pollinations-ai-885844321461485618",
        width: "32px",
        height: "32px",
    },
    github: {
        label: "GitHub",
        icon: GithubIcon,
        url: "https://www.github.com/pollinations/pollinations",
        width: "25px",
        height: "25px",
    },
    linkedin: {
        label: "LinkedIn",
        icon: LinkedinIcon,
        url: "https://www.linkedin.com/company/pollinations-ai",
        width: "22px",
        height: "22px",
    },
    instagram: {
        label: "Instagram",
        icon: InstagramIcon,
        url: "https://instagram.com/pollinations_ai",
        width: "22px",
        height: "22px",
    },
    x: {
        label: "X",
        icon: XIcon,
        url: "https://twitter.com/pollinations_ai",
        width: "20px",
        height: "20px",
    },
    reddit: {
        label: "Reddit",
        icon: RedditIcon,
        url: "https://www.reddit.com/r/pollinations_ai/",
        width: "24px",
        height: "24px",
    },
};

// Additional links (not rendered as social icons)
export const LINKS = {
    enter: "https://enter.pollinations.ai",
    enterDocs: "https://enter.pollinations.ai/docs#api",
    enterApiDocs: "https://enter.pollinations.ai/api/docs",
    enterTiersFaq: "https://enter.pollinations.ai#what-are-tiers",
    apidocsRaw:
        "https://raw.githubusercontent.com/pollinations/pollinations/production/APIDOCS.md",
    discordPollenBeta:
        "https://discord.com/channels/885844321461485618/1432378056126894343",
    githubSubmitApp:
        "https://github.com/pollinations/pollinations/issues/new?template=tier-app-submission.yml",
    byopDocs:
        "https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md",
};
