import { Button } from "@pollinations/ui";
import { Link } from "@tanstack/react-router";
import { useHideOnScroll } from "./useHideOnScroll";

const NAV = [
    { to: "/", label: "Hello" },
    { to: "/play", label: "Play" },
    { to: "/apps", label: "Apps" },
    { to: "/community", label: "Community" },
] as const;

const EXTERNAL = [
    { href: "https://docs.pollinations.ai", label: "Docs" },
    { href: "https://github.com/pollinations/pollinations", label: "GitHub" },
] as const;

export function SiteHeader() {
    const hidden = useHideOnScroll();

    return (
        <header
            className={`sticky top-3 z-30 mx-6 mt-3 mb-3 flex items-center justify-between gap-6 rounded-full border border-theme-border bg-surface-translucent px-5 py-3 shadow-container backdrop-blur-md transition-transform duration-300 supports-[not(backdrop-filter:blur(0))]:bg-surface-opaque focus-within:translate-y-0 motion-reduce:transition-none md:px-8 ${
                hidden ? "-translate-y-[140%]" : "translate-y-0"
            }`}
        >
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
                <Button
                    as="a"
                    href="https://enter.pollinations.ai"
                    size="sm"
                    className="bg-brand-dark text-surface-opaque hover:bg-brand-dark"
                >
                    Dashboard ↗
                </Button>
            </div>
        </header>
    );
}
