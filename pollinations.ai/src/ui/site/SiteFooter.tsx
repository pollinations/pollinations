import { BrandLockup } from "@pollinations/ui";
import { Link } from "@tanstack/react-router";
import { ArrowLink, GUTTER, PixelLabel, SHELL } from "./kit";

const COLUMNS = [
    {
        heading: "Build",
        links: [
            { href: "https://gen.pollinations.ai/docs", label: "API docs" },
            { href: "https://gen.pollinations.ai/models", label: "Models" },
            { href: "https://enter.pollinations.ai", label: "Dashboard" },
        ],
    },
    {
        heading: "Explore",
        links: [
            { to: "/apps", label: "Apps" },
            { to: "/play", label: "Play" },
            { to: "/community", label: "Community" },
            {
                href: "https://discord.gg/pollinations-ai-885844321461485618",
                label: "Discord",
            },
        ],
    },
    {
        heading: "Project",
        links: [
            {
                href: "https://github.com/pollinations/pollinations",
                label: "GitHub",
            },
            { to: "/privacy", label: "Privacy" },
            { to: "/terms", label: "Terms" },
        ],
    },
] as const;

export function SiteFooter() {
    return (
        <footer className={SHELL}>
            <div
                className={`${GUTTER} flex flex-wrap justify-between gap-10 pt-11 pb-14`}
            >
                <div className="flex max-w-xs flex-col gap-4">
                    <BrandLockup
                        height={34}
                        className="text-theme-text-strong"
                        label=""
                    />
                    <p className="text-sm text-theme-text-muted">
                        Open infrastructure for AI apps. Built with the
                        community, in the open.
                    </p>
                </div>
                <div className="flex flex-wrap gap-12">
                    {COLUMNS.map((column) => (
                        <div
                            key={column.heading}
                            className="flex flex-col gap-2"
                        >
                            <PixelLabel variant="chrome">
                                {column.heading}
                            </PixelLabel>
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
                                    <ArrowLink
                                        key={link.label}
                                        href={link.href}
                                        className="font-normal text-theme-text-base"
                                    >
                                        {link.label}
                                    </ArrowLink>
                                ),
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </footer>
    );
}
