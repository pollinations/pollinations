import { Button, TabButton } from "@pollinations/ui";
import { Link, useRouterState } from "@tanstack/react-router";
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
    const pathname = useRouterState({
        select: (state) => state.location.pathname,
    });

    return (
        <header
            className={`sticky top-0 z-30 flex items-center justify-between gap-6 rounded-t-[28px] bg-theme-bg-pale px-8 py-5 transition-transform duration-300 focus-within:translate-y-0 motion-reduce:transition-none md:px-18 ${
                hidden ? "-translate-y-full" : "translate-y-0"
            }`}
        >
            <div className="flex items-center gap-8">
                <Link to="/" className="flex items-center gap-2">
                    <span className="font-subheading text-xl text-theme-text-strong">
                        pollinations.ai
                    </span>
                </Link>
                <nav className="hidden gap-1.5 md:flex">
                    {NAV.map((item) => (
                        <TabButton
                            key={item.to}
                            as={Link}
                            to={item.to}
                            size="sm"
                            variant="ghost"
                            active={
                                item.to === "/"
                                    ? pathname === "/"
                                    : pathname.startsWith(item.to)
                            }
                        >
                            {item.label}
                        </TabButton>
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
