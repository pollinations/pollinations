import { DiscordIcon, GitHubIcon, XIcon } from "@pollinations/ui";
import type { ComponentType } from "react";
import { ENTER_URL } from "../../config.ts";

/**
 * Primary nav — maps 1:1 onto the file routes. `as const` keeps `to` as route
 * literals so TanStack `<Link>`'s typed `to` accepts them. `exact` only for home.
 * `theme` gives each section its own color (dot + active fill via `NavItem`).
 */
export const NAV_ITEMS = [
    { to: "/", label: "hello", exact: true, theme: "green" },
    { to: "/play", label: "play", exact: false, theme: "violet" },
    { to: "/apps", label: "apps", exact: false, theme: "blue" },
    { to: "/community", label: "community", exact: false, theme: "pink" },
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
];

/** Auth/dashboard host (external, new tab). */
export const ENTER_HREF = ENTER_URL;
export const FOOTER_BRANDING = "Pollinations.AI © 2026 Myceli AI OÜ";
