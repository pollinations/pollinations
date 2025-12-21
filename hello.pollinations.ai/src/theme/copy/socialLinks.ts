import {
    DiscordIcon,
    GithubIcon,
    InstagramIcon,
    LinkedinIcon,
    TiktokIcon,
    XIcon,
    YoutubeIcon,
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
    youtube: {
        label: "YouTube",
        icon: YoutubeIcon,
        url: "https://www.youtube.com/c/pollinations",
        width: "28px",
        height: "28px",
    },
    tiktok: {
        label: "Tiktok",
        icon: TiktokIcon,
        url: "https://tiktok.com/@pollinations.ai",
        width: "27px",
        height: "27px",
    },
};

// Additional links (not rendered as social icons)
export const LINKS = {
    discordPollenBeta:
        "https://discord.com/channels/885844321461485618/1432378056126894343",
    githubSubmitApp:
        "https://github.com/pollinations/pollinations/issues/new?template=app-submission.yml",
};
