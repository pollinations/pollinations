import {
    Button,
    ColorModeToggle,
    DiscordIcon,
    Eyebrow,
    GitHubIcon,
    InlineLink,
    InstagramIcon,
    LinkedInIcon,
    XSocialIcon,
} from "@pollinations/ui";
import lockupUrl from "@pollinations/ui/brand/lockup-horizontal.svg";
import { Link } from "@tanstack/react-router";
import type { CSSProperties } from "react";

const lockupMask = `url('${lockupUrl}') center / contain no-repeat`;
const LOCKUP_STYLE: CSSProperties = {
    width: 211,
    height: 26,
    backgroundColor: "currentColor",
    WebkitMask: lockupMask,
    mask: lockupMask,
};

const COLUMNS = [
    {
        heading: "Build",
        links: [
            { href: "https://gen.pollinations.ai/docs", label: "Docs" },
            { href: "https://gen.pollinations.ai/models", label: "Models" },
            { href: "https://enter.pollinations.ai", label: "Dashboard" },
        ],
    },
    {
        heading: "Explore",
        links: [
            { to: "/", label: "Hello" },
            { to: "/apps", label: "Apps" },
            { to: "/play", label: "Play" },
            { to: "/community", label: "Community" },
        ],
    },
    {
        heading: "Project",
        links: [
            { to: "/privacy", label: "Privacy" },
            { to: "/terms", label: "Terms" },
            // A real route with a real page that nothing linked to. Payment
            // providers generally require this to be reachable.
            { to: "/refunds", label: "Refunds" },
        ],
    },
] as const;

const SOCIAL = [
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
        label: "Twitter",
        Icon: XSocialIcon,
    },
    {
        href: "https://www.linkedin.com/company/pollinations-ai",
        label: "LinkedIn",
        Icon: LinkedInIcon,
    },
] as const;

export function SiteFooter() {
    return (
        <footer className="site-shell">
            <div className="site-gutter flex flex-wrap justify-between gap-10 pt-11 pb-14">
                <div className="flex max-w-xs flex-col gap-4">
                    <span
                        aria-hidden="true"
                        style={LOCKUP_STYLE}
                        className="block shrink-0 text-theme-text-strong"
                    />
                    <p className="text-sm text-theme-text-muted">
                        <span className="block">
                            Open infrastructure for AI apps
                        </span>
                        <span className="block">
                            Built with the community, in the open
                        </span>
                    </p>
                    <div className="hidden items-center gap-3 min-[900px]:flex">
                        <Eyebrow size="chrome">Appearance</Eyebrow>
                        <ColorModeToggle />
                    </div>
                    <nav aria-label="Social links" className="flex gap-1">
                        {SOCIAL.map(({ href, label, Icon }) => (
                            <Button
                                key={href}
                                as="a"
                                href={href}
                                size="sm"
                                aria-label={label}
                                title={label}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="site-external-link h-8 w-8 shrink-0 p-0"
                            >
                                <Icon className="h-4 w-4" />
                            </Button>
                        ))}
                    </nav>
                </div>
                <div className="flex flex-wrap gap-12">
                    {COLUMNS.map((column) => (
                        <div
                            key={column.heading}
                            className="flex flex-col gap-2"
                        >
                            <Eyebrow size="chrome">{column.heading}</Eyebrow>
                            {column.links.map((link) =>
                                "to" in link ? (
                                    <Link
                                        key={link.label}
                                        to={link.to}
                                        className="text-sm text-theme-text-base hover:text-theme-text-strong"
                                    >
                                        {link.label}
                                    </Link>
                                ) : (
                                    <InlineLink
                                        key={link.label}
                                        href={link.href}
                                        className="text-sm font-normal text-theme-text-base"
                                    >
                                        {link.label}
                                    </InlineLink>
                                ),
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </footer>
    );
}
