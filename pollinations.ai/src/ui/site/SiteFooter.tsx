import { BrandMark, Eyebrow, IconButton, InlineLink } from "@pollinations/ui";
import { Link } from "@tanstack/react-router";
import { DOCS_URL, SOCIAL } from "./links";

const COLUMNS = [
    {
        heading: "Build",
        links: [
            { href: DOCS_URL, label: "Docs" },
            { href: "https://enter.pollinations.ai/models", label: "Models" },
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
            // Payment providers generally require this to be reachable.
            { to: "/refunds", label: "Refunds" },
        ],
    },
] as const;

export function SiteFooter() {
    return (
        <footer className="site-shell hidden min-[880px]:block">
            <div className="site-gutter flex flex-wrap justify-between gap-10 pt-11 pb-14">
                <div className="flex max-w-xs flex-col gap-4">
                    <BrandMark
                        variant="lockup"
                        className="h-6.5 w-52.75 text-theme-text-strong"
                    />
                    <p className="text-sm text-theme-text-muted">
                        <span className="block">
                            Open infrastructure for AI builders
                        </span>
                        <span className="block">
                            Built with the community, in the open
                        </span>
                    </p>
                    <nav aria-label="Social links" className="flex gap-1">
                        {SOCIAL.map(({ href, label, Icon }) => (
                            <IconButton
                                key={href}
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                variant="ghost"
                                size="md"
                                aria-label={label}
                            >
                                <Icon className="h-4 w-4" />
                            </IconButton>
                        ))}
                    </nav>
                    <p className="text-xs text-theme-text-muted">
                        <span className="block">
                            © {new Date().getFullYear()} Myceli.AI OÜ, Tallinn,
                            Estonia
                        </span>
                        <span className="block">
                            Payments by Stripe ·{" "}
                            <InlineLink
                                href="mailto:hello@pollinations.ai"
                                tone="quiet"
                            >
                                hello@pollinations.ai
                            </InlineLink>
                        </span>
                    </p>
                </div>
                <div className="flex flex-wrap gap-12">
                    {COLUMNS.map((column) => (
                        <div
                            key={column.heading}
                            className="flex flex-col gap-2"
                        >
                            <Eyebrow size="chrome">{column.heading}</Eyebrow>
                            {/* One quiet link style; ↗ marks only the ones that leave the site. */}
                            {column.links.map((link) =>
                                "to" in link ? (
                                    <InlineLink
                                        key={link.label}
                                        as={Link}
                                        to={link.to}
                                        external={false}
                                        tone="quiet"
                                        size="footer"
                                        className="w-fit"
                                    >
                                        {link.label}
                                    </InlineLink>
                                ) : (
                                    <InlineLink
                                        key={link.label}
                                        href={link.href}
                                        tone="quiet"
                                        size="footer"
                                        className="w-fit"
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
