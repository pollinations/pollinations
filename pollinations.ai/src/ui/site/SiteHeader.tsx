import { BrandLockup, Button, TabButton } from "@pollinations/ui";
import { Link, useRouterState } from "@tanstack/react-router";
import { GUTTER, SHELL } from "./shell";
import { useHideOnScroll, useScrolled } from "./useHideOnScroll";

const NAV = [
    { to: "/", label: "Hello" },
    { to: "/play", label: "Play" },
    { to: "/apps", label: "Apps" },
    { to: "/community", label: "Community" },
] as const;

/**
 * Everything here leaves the site, so every one carries ↗ — the same marker
 * Dashboard already used. An arrow on some outbound links and not others
 * reads as an inconsistency rather than as meaning.
 */
const EXTERNAL = [
    // Not docs.pollinations.ai — that is the investor data room.
    { href: "https://gen.pollinations.ai/docs", label: "Docs" },
    { href: "https://github.com/pollinations/pollinations", label: "GitHub" },
] as const;

export function SiteHeader() {
    const hidden = useHideOnScroll();
    const scrolled = useScrolled();
    const pathname = useRouterState({
        select: (state) => state.location.pathname,
    });

    return (
        <header
            className={`sticky top-0 z-30 bg-app-bg py-5 transition-[transform,box-shadow] duration-300 focus-within:translate-y-0 motion-reduce:transition-none ${
                scrolled ? "shadow-well" : ""
            } ${hidden ? "-translate-y-full" : "translate-y-0"}`}
        >
            <div className={SHELL}>
                <div
                    className={`${GUTTER} flex items-center justify-between gap-6`}
                >
                    <div className="flex items-center gap-9">
                        <Link
                            to="/"
                            className="flex items-center text-theme-text-strong"
                            aria-label="pollinations.ai — home"
                        >
                            <BrandLockup height={38} label="" />
                        </Link>
                        <nav className="hidden gap-1.5 md:flex">
                            {NAV.map((item) => (
                                <TabButton
                                    key={item.to}
                                    as={Link}
                                    to={item.to}
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
                    <div className="flex items-center gap-2">
                        {EXTERNAL.map((item) => (
                            <TabButton
                                key={item.href}
                                as="a"
                                href={item.href}
                                variant="ghost"
                                active={false}
                                className="hidden sm:inline-flex"
                            >
                                {item.label} ↗
                            </TabButton>
                        ))}
                        <Button
                            as="a"
                            href="https://enter.pollinations.ai"
                            className="bg-brand-dark text-surface-opaque hover:bg-brand-dark"
                        >
                            Dashboard ↗
                        </Button>
                    </div>
                </div>
            </div>
        </header>
    );
}
