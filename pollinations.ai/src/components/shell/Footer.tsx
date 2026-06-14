import { Link } from "@tanstack/react-router";
import { FOOTER_BRANDING, FOOTER_LEGAL, SOCIAL_LINKS } from "./links.ts";

export function Footer() {
    return (
        <footer className="border-t border-divider bg-app-bg">
            <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <p className="font-body text-sm text-theme-text-base">
                    {FOOTER_BRANDING}
                </p>

                <nav className="flex flex-wrap items-center gap-2 text-sm">
                    {FOOTER_LEGAL.map((l) => (
                        <Link
                            key={l.to}
                            to={l.to}
                            className="font-medium text-theme-text-base underline decoration-divider underline-offset-4 hover:text-theme-text-strong hover:decoration-theme-text-muted"
                        >
                            {l.label}
                        </Link>
                    ))}
                </nav>

                <div className="flex items-center gap-3">
                    {SOCIAL_LINKS.map(({ label, href, Icon }) => (
                        <a
                            key={label}
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={label}
                            className="text-theme-text-muted hover:text-theme-text-strong"
                        >
                            <Icon className="h-5 w-5" />
                        </a>
                    ))}
                </div>
            </div>
        </footer>
    );
}
