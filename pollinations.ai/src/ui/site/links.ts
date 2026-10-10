import {
    DiscordIcon,
    GitHubIcon,
    InstagramIcon,
    LinkedInIcon,
    XSocialIcon,
} from "@pollinations/ui";

/** Not docs.pollinations.ai — that is the investor data room. */
export const DOCS_URL = "https://gen.pollinations.ai/docs";

export const SOCIAL = [
    {
        href: "https://github.com/pollinations/pollinations",
        label: "GitHub",
        Icon: GitHubIcon,
    },
    {
        href: "https://discord.gg/pollinations-ai-885844321461485618",
        label: "Discord",
        Icon: DiscordIcon,
    },
    {
        href: "https://instagram.com/pollinations_ai",
        label: "Instagram",
        Icon: InstagramIcon,
    },
    {
        href: "https://x.com/pollinations_ai",
        label: "X",
        Icon: XSocialIcon,
    },
    {
        href: "https://www.linkedin.com/company/pollinations-ai",
        label: "LinkedIn",
        Icon: LinkedInIcon,
    },
] as const;
