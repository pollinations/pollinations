import {
    DiscordIcon,
    GitHubIcon,
    InstagramIcon,
    LinkedInIcon,
    RedditIcon,
    XIcon,
} from "@pollinations/ui";
import type { ComponentType } from "react";
import { ENTER_URL } from "../../config.ts";

/**
 * Primary nav — maps 1:1 onto the file routes. `as const` keeps `to` as route
 * literals so TanStack `<Link>`'s typed `to` accepts them. `exact` only for home.
 */
export const NAV_ITEMS = [
    { to: "/", label: "hello", exact: true },
    { to: "/play", label: "play", exact: false },
    { to: "/apps", label: "apps", exact: false },
    { to: "/community", label: "community", exact: false },
] as const;

export const FOOTER_LEGAL = [
    { to: "/terms", label: "Terms" },
    { to: "/privacy", label: "Privacy" },
    { to: "/refunds", label: "Refunds" },
] as const;

export const SOCIAL_LINKS: {
    label: string;
    href: string;
    Icon: ComponentType<{ className?: string }>;
}[] = [
    {
        label: "GitHub",
        href: "https://github.com/pollinations/pollinations",
        Icon: GitHubIcon,
    },
    {
        label: "Discord",
        href: "https://discord.gg/pollinations-ai-885844321461485618",
        Icon: DiscordIcon,
    },
    { label: "X", href: "https://twitter.com/pollinations_ai", Icon: XIcon },
    {
        label: "Instagram",
        href: "https://instagram.com/pollinations_ai",
        Icon: InstagramIcon,
    },
    {
        label: "Reddit",
        href: "https://reddit.com/r/pollinations_ai",
        Icon: RedditIcon,
    },
    {
        label: "LinkedIn",
        href: "https://www.linkedin.com/company/pollinations-ai",
        Icon: LinkedInIcon,
    },
];

/** Auth/dashboard host (external, new tab). */
export const ENTER_HREF = ENTER_URL;
export const FOOTER_BRANDING = "Pollinations.AI © 2026 Myceli AI OÜ";
