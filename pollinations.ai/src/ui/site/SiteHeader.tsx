import {
    BrandLockup,
    Button,
    MenuIcon,
    TabButton,
    XIcon,
} from "@pollinations/ui";
import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { GUTTER, SHELL } from "./kit";
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

const isCurrent = (to: string, pathname: string) =>
    to === "/" ? pathname === "/" : pathname.startsWith(to);

export function SiteHeader() {
    const [menuOpen, setMenuOpen] = useState(false);
    const headerRef = useRef<HTMLElement>(null);
    const scrolled = useScrolled();
    const scrolledAway = useHideOnScroll();
    const pathname = useRouterState({
        select: (state) => state.location.pathname,
    });

    // Navigating is what the menu is for, so it closes itself on arrival.
    // biome-ignore lint/correctness/useExhaustiveDependencies: close on navigation
    useEffect(() => {
        setMenuOpen(false);
    }, [pathname]);

    useEffect(() => {
        if (!menuOpen) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") setMenuOpen(false);
        };
        // Escape only helps a keyboard. A tap on the page behind the panel is
        // how most people expect to dismiss it, and without this it did
        // nothing. Listening on pointerdown rather than click so the menu is
        // gone before whatever was tapped reacts.
        const onPointerDown = (event: PointerEvent) => {
            const target = event.target as Node | null;
            if (target && !headerRef.current?.contains(target)) {
                setMenuOpen(false);
            }
        };
        window.addEventListener("keydown", onKey);
        window.addEventListener("pointerdown", onPointerDown);
        return () => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("pointerdown", onPointerDown);
        };
    }, [menuOpen]);

    // The header must not slide away while its own menu is open.
    const hidden = scrolledAway && !menuOpen;

    return (
        <header
            ref={headerRef}
            className={`sticky top-0 z-30 bg-app-bg py-4 transition-[transform,box-shadow] duration-300 focus-within:translate-y-0 sm:py-5 motion-reduce:transition-none ${
                scrolled ? "shadow-well" : ""
            } ${hidden ? "-translate-y-full" : "translate-y-0"}`}
        >
            <div className={SHELL}>
                <div
                    className={`${GUTTER} flex items-center justify-between gap-4 sm:gap-6`}
                >
                    <div className="flex min-w-0 items-center gap-9">
                        <Link
                            to="/"
                            className="flex items-center text-theme-text-strong"
                            aria-label="pollinations.ai — home"
                        >
                            <BrandLockup
                                variant="mark"
                                height={32}
                                label=""
                                className="sm:hidden"
                            />
                            <BrandLockup
                                height={30}
                                label=""
                                className="hidden sm:inline-block"
                            />
                        </Link>
                        <nav className="hidden gap-1.5 lg:flex">
                            {NAV.map((item) => (
                                <TabButton
                                    key={item.to}
                                    as={Link}
                                    to={item.to}
                                    variant="ghost"
                                    active={isCurrent(item.to, pathname)}
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
                                className="hidden xl:inline-flex"
                            >
                                {item.label} ↗
                            </TabButton>
                        ))}
                        <Button
                            as="a"
                            href="https://enter.pollinations.ai"
                            className="hidden bg-brand-dark text-surface-opaque hover:bg-brand-dark sm:inline-flex"
                        >
                            Dashboard ↗
                        </Button>
                        {/* Below lg the nav row is gone, and Docs/GitHub wait
                            until xl. Below sm, Dashboard moves into the menu
                            too, leaving the mark and menu button room to fit.

                            Button, not IconButton: IconButton takes a closed
                            prop set, so aria-expanded/aria-controls are
                            dropped, and it is fixed at 24px — under the 44px
                            touch target this needs. */}
                        <Button
                            aria-label={menuOpen ? "Close menu" : "Open menu"}
                            aria-expanded={menuOpen}
                            aria-controls="site-menu"
                            onClick={() => setMenuOpen((open) => !open)}
                            // Explicit w/h and a sized icon: the bare icon
                            // stretches to fill the flex box and drags the
                            // button's width down with it, which lands under
                            // the 44px touch target.
                            className="h-11 w-11 min-w-11 p-0 [&>svg]:size-6 lg:hidden"
                        >
                            {menuOpen ? <XIcon /> : <MenuIcon />}
                        </Button>
                    </div>
                </div>

                {menuOpen && (
                    <div className={`${GUTTER} lg:hidden`}>
                        {/* Every destination, including Dashboard when it is
                            still in the bar — a menu that lists some of them
                            is harder to trust than one that lists all. */}
                        <nav
                            id="site-menu"
                            className="mt-4 flex flex-col gap-1 rounded-2xl bg-surface-opaque p-3 shadow-well"
                        >
                            {NAV.map((item) => (
                                <TabButton
                                    key={item.to}
                                    as={Link}
                                    to={item.to}
                                    variant="ghost"
                                    active={isCurrent(item.to, pathname)}
                                    className="h-11 justify-start px-4"
                                >
                                    {item.label}
                                </TabButton>
                            ))}
                            <span className="mx-3 my-1 h-px bg-theme-border" />
                            {EXTERNAL.map((item) => (
                                <TabButton
                                    key={item.href}
                                    as="a"
                                    href={item.href}
                                    variant="ghost"
                                    active={false}
                                    className="h-11 justify-start px-4"
                                >
                                    {item.label} ↗
                                </TabButton>
                            ))}
                            <TabButton
                                as="a"
                                href="https://enter.pollinations.ai"
                                variant="ghost"
                                active={false}
                                className="h-11 justify-start px-4"
                            >
                                Dashboard ↗
                            </TabButton>
                        </nav>
                    </div>
                )}
            </div>
        </header>
    );
}
