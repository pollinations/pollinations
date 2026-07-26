import { Link } from "@tanstack/react-router";

const NAV = [
    { to: "/", label: "Hello" },
    { to: "/apps", label: "Apps" },
    { to: "/community", label: "Community" },
] as const;

const EXTERNAL = [
    { href: "https://docs.pollinations.ai", label: "Docs" },
    { href: "https://github.com/pollinations/pollinations", label: "GitHub" },
] as const;

export function SiteHeader() {
    return (
        <header className="sticky top-0 z-20 flex items-center justify-between gap-6 bg-app-bg px-6 py-4 md:px-12">
            <div className="flex items-center gap-8">
                <Link to="/" className="flex items-center gap-2">
                    <span className="font-subheading text-xl text-theme-text-strong">
                        pollinations.ai
                    </span>
                </Link>
                <nav className="hidden gap-1 text-sm font-semibold md:flex">
                    {NAV.map((item) => (
                        <Link
                            key={item.to}
                            to={item.to}
                            className="rounded-lg px-3 py-1.5 text-theme-text-base hover:bg-theme-bg-hover"
                            activeProps={{
                                className: "text-theme-text-strong",
                            }}
                            activeOptions={{ exact: item.to === "/" }}
                        >
                            {item.label}
                        </Link>
                    ))}
                </nav>
            </div>
            <div className="flex items-center gap-4 text-sm font-semibold">
                {EXTERNAL.map((item) => (
                    <a
                        key={item.href}
                        href={item.href}
                        className="hidden text-theme-text-base hover:text-theme-text-strong sm:inline"
                    >
                        {item.label}
                    </a>
                ))}
                <a
                    href="https://enter.pollinations.ai"
                    className="rounded-full bg-brand-dark px-5 py-2 text-surface-opaque"
                >
                    Dashboard ↗
                </a>
            </div>
        </header>
    );
}
