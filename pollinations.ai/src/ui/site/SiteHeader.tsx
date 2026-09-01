import {
    BookIcon,
    Button,
    Chip,
    ColorModeToggle,
    DiscordIcon,
    Drawer,
    DropdownItem,
    GitHubIcon,
    InstagramIcon,
    LinkedInIcon,
    LogInIcon,
    MenuIcon,
    TabButton,
    XIcon,
    XSocialIcon,
} from "@pollinations/ui";
import lockupUrl from "@pollinations/ui/brand/lockup-horizontal.svg";
import markUrl from "@pollinations/ui/brand/mark.svg";
import { Link, useRouterState } from "@tanstack/react-router";
import { type CSSProperties, useState } from "react";
import { useDiscordPresence, useRepoStars } from "../../data/community";
import { compact } from "../../data/publicStats";
import { useHideOnScroll, useScrolled } from "./useHideOnScroll";

const NAV = [
    { to: "/", label: "Hello" },
    { to: "/play", label: "Play" },
    { to: "/apps", label: "Apps" },
    { to: "/community", label: "Community" },
] as const;

const LEGAL = [
    { to: "/terms", label: "Terms" },
    { to: "/privacy", label: "Privacy" },
    { to: "/refunds", label: "Refunds" },
] as const;

const EXTERNAL = [
    // Not docs.pollinations.ai — that is the investor data room.
    { href: "https://gen.pollinations.ai/docs", label: "Docs" },
    { href: "https://github.com/pollinations/pollinations", label: "GitHub" },
    {
        href: "https://discord.gg/pollinations-ai-885844321461485618",
        label: "Discord",
    },
] as const;

const SOCIAL = [
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

const REPO_STARS_FALLBACK = 5_000;
const maskStyle = (
    url: string,
    width: number,
    height: number,
): CSSProperties => {
    const mask = `url('${url}') center / contain no-repeat`;

    return {
        width,
        height,
        backgroundColor: "currentColor",
        WebkitMask: mask,
        mask,
    };
};
const MARK_STYLE = maskStyle(markUrl, 32, 32);
const MOBILE_MENU_MARK_STYLE = maskStyle(markUrl, 26, 26);
const DRAWER_MENU_LOCKUP_STYLE = maskStyle(lockupUrl, 174, 22);
const DESKTOP_ACTION_CLASS =
    "hidden h-9 shrink-0 gap-1.5 bg-surface-opaque px-3 text-theme-text-strong shadow-well transition-all duration-200 hover:-translate-y-0.5 hover:bg-theme-bg-hover hover:shadow-lg min-[780px]:inline-flex motion-reduce:hover:translate-y-0";

const isCurrent = (to: string, pathname: string) =>
    to === "/" ? pathname === "/" : pathname.startsWith(to);

function MenuUtilities({
    close,
    displayedRepoStars,
    discordOnline,
}: {
    close: () => void;
    displayedRepoStars: string;
    discordOnline: number | null;
}) {
    return (
        <>
            <DropdownItem
                as="a"
                href={EXTERNAL[1].href}
                onClick={close}
                className="site-drawer-social-link site-external-link"
            >
                <GitHubIcon className="h-4 w-4 shrink-0" />
                <span className="site-drawer-social-label">
                    {EXTERNAL[1].label}
                </span>
                <Chip intent="alpha" size="sm" className="ml-auto">
                    {displayedRepoStars} stars
                </Chip>
            </DropdownItem>
            <DropdownItem
                as="a"
                href={EXTERNAL[2].href}
                onClick={close}
                className="site-drawer-social-link site-external-link"
            >
                <DiscordIcon className="h-4 w-4 shrink-0" />
                <span className="site-drawer-social-label">
                    {EXTERNAL[2].label}
                </span>
                {discordOnline !== null && (
                    <Chip intent="info" size="sm" className="ml-auto">
                        {discordOnline} online
                    </Chip>
                )}
            </DropdownItem>
            <footer className="mt-1 flex items-center gap-3 px-2 py-2">
                <div className="flex items-center gap-2">
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
                            onClick={close}
                            className="site-external-link h-8 w-8 shrink-0 p-0"
                        >
                            <Icon className="h-4 w-4" />
                        </Button>
                    ))}
                </div>
            </footer>
        </>
    );
}

export function SiteHeader() {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const { data: repoStars } = useRepoStars();
    const displayedRepoStars = compact(repoStars ?? REPO_STARS_FALLBACK);
    const { data: discordOnline } = useDiscordPresence({
        enabled: mobileMenuOpen,
        refreshMs: 30_000,
    });
    const scrolled = useScrolled();
    const scrolledAway = useHideOnScroll();
    const pathname = useRouterState({
        select: (state) => state.location.pathname,
    });

    // The header must not slide away while its own menu is open.
    const hidden = scrolledAway && !mobileMenuOpen;

    return (
        <header
            className={`pointer-events-none fixed inset-x-0 top-0 z-30 bg-transparent py-4 transition-transform duration-300 focus-within:translate-y-0 min-[780px]:pointer-events-auto min-[780px]:sticky sm:py-5 motion-reduce:transition-none ${
                hidden ? "-translate-y-full" : "translate-y-0"
            }`}
        >
            <div
                aria-hidden="true"
                className={`site-header-dissolve pointer-events-none absolute inset-x-0 top-0 hidden h-40 transition-opacity duration-300 min-[780px]:block motion-reduce:transition-none ${
                    scrolled && !hidden ? "opacity-100" : "opacity-0"
                }`}
            />
            <div className="site-shell relative z-10">
                <div className="site-gutter site-header-gutter flex items-center justify-between gap-4 sm:gap-6">
                    <div className="site-home-nav-group flex min-w-0 items-center gap-6">
                        <Link
                            to="/"
                            className="site-home-logo group relative hidden items-center rounded-md text-theme-text-strong transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-theme-border min-[780px]:flex motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                            aria-label="pollinations.ai — home"
                        >
                            <span className="relative inline-flex">
                                <span
                                    aria-hidden="true"
                                    style={MARK_STYLE}
                                    className={`site-home-logo-accent absolute translate-x-[3px] translate-y-[3px] text-theme-bg-active transition-opacity duration-200 motion-reduce:transition-none ${
                                        pathname === "/"
                                            ? "opacity-100"
                                            : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                                    }`}
                                />
                                <span
                                    aria-hidden="true"
                                    style={MARK_STYLE}
                                    className="relative z-10 block shrink-0"
                                />
                            </span>
                        </Link>
                        <nav className="hidden gap-1.5 min-[780px]:flex">
                            {NAV.map((item) => {
                                const active = isCurrent(item.to, pathname);
                                return (
                                    <TabButton
                                        key={item.to}
                                        as={Link}
                                        to={item.to}
                                        variant="ghost"
                                        active={active}
                                        className={`site-primary-nav-button ${
                                            item.to === "/"
                                                ? "site-home-nav-button"
                                                : ""
                                        }`}
                                    >
                                        {item.label}
                                    </TabButton>
                                );
                            })}
                        </nav>
                    </div>
                    <div className="pointer-events-auto flex items-center gap-2">
                        <Button
                            as="a"
                            href={EXTERNAL[0].href}
                            size="sm"
                            aria-label="Docs"
                            title="Docs"
                            className={DESKTOP_ACTION_CLASS}
                        >
                            <BookIcon className="h-4 w-4" />
                            <span>Docs</span>
                        </Button>
                        <Button
                            as="a"
                            href="https://enter.pollinations.ai"
                            size="sm"
                            aria-label="Login"
                            title="Login"
                            className={DESKTOP_ACTION_CLASS}
                        >
                            <LogInIcon className="h-4 w-4" />
                            <span>Login</span>
                        </Button>
                        <div className="hidden h-9 items-center min-[780px]:flex">
                            <ColorModeToggle />
                        </div>
                        <Button
                            aria-label="Open menu"
                            aria-expanded={mobileMenuOpen}
                            aria-controls="mobile-site-menu"
                            onClick={() => setMobileMenuOpen(true)}
                            className="mt-2 h-11 min-w-[5.5rem] gap-2 px-3 min-[780px]:hidden [&>svg]:size-6"
                        >
                            <span
                                aria-hidden="true"
                                style={MOBILE_MENU_MARK_STYLE}
                                className="block shrink-0"
                            />
                            <MenuIcon />
                        </Button>

                        <Drawer
                            open={mobileMenuOpen}
                            onOpenChange={setMobileMenuOpen}
                            ariaLabel="Site navigation"
                            side="right"
                            contentClassName="w-[min(18rem,78vw)] bg-surface-opaque"
                        >
                            <div className="flex min-h-0 flex-1 flex-col">
                                <div className="flex justify-end pb-2 pl-4 pr-8 pt-6">
                                    <Button
                                        aria-label="Close menu"
                                        onClick={() => setMobileMenuOpen(false)}
                                        className="h-11 w-full justify-between px-3 [&>svg]:size-6"
                                    >
                                        <span
                                            aria-hidden="true"
                                            style={DRAWER_MENU_LOCKUP_STYLE}
                                            className="block shrink-0"
                                        />
                                        <XIcon />
                                    </Button>
                                </div>
                                <nav
                                    id="mobile-site-menu"
                                    className="flex min-h-0 flex-1 flex-col gap-1 overflow-x-hidden overflow-y-auto p-2"
                                >
                                    <div className="flex flex-col gap-1 pl-2 pr-6">
                                        {NAV.map((item) => {
                                            const active = isCurrent(
                                                item.to,
                                                pathname,
                                            );
                                            return (
                                                <TabButton
                                                    key={item.to}
                                                    as={Link}
                                                    to={item.to}
                                                    variant="ghost"
                                                    active={active}
                                                    size="lg"
                                                    onClick={() =>
                                                        setMobileMenuOpen(false)
                                                    }
                                                    className="site-primary-nav-button w-full justify-start"
                                                >
                                                    {item.label}
                                                </TabButton>
                                            );
                                        })}
                                    </div>
                                    <div className="mt-3 flex flex-col gap-2 py-1 pl-2 pr-6">
                                        <Button
                                            as="a"
                                            href={EXTERNAL[0].href}
                                            size="lg"
                                            onClick={() =>
                                                setMobileMenuOpen(false)
                                            }
                                            className="w-full justify-start gap-2"
                                        >
                                            <BookIcon className="h-4 w-4 shrink-0" />
                                            {EXTERNAL[0].label}
                                        </Button>
                                        <Button
                                            as="a"
                                            href="https://enter.pollinations.ai"
                                            size="lg"
                                            onClick={() =>
                                                setMobileMenuOpen(false)
                                            }
                                            className="w-full justify-start gap-2"
                                        >
                                            <LogInIcon className="h-4 w-4 shrink-0" />
                                            Login
                                        </Button>
                                    </div>
                                    <div className="-mx-2 mt-auto flex flex-col gap-1 bg-theme-bg-subtle px-2 pb-2 pt-3">
                                        <MenuUtilities
                                            close={() =>
                                                setMobileMenuOpen(false)
                                            }
                                            displayedRepoStars={
                                                displayedRepoStars
                                            }
                                            discordOnline={discordOnline}
                                        />
                                    </div>
                                    <div className="-mx-2 -mb-2 flex items-center justify-between gap-3 bg-surface-opaque px-4 py-3 text-xs text-theme-text-muted">
                                        <div className="flex items-center gap-2">
                                            {LEGAL.map((item) => (
                                                <Link
                                                    key={item.to}
                                                    to={item.to}
                                                    onClick={() =>
                                                        setMobileMenuOpen(false)
                                                    }
                                                    className="transition-colors hover:text-theme-text-strong"
                                                >
                                                    {item.label}
                                                </Link>
                                            ))}
                                        </div>
                                        <ColorModeToggle />
                                    </div>
                                </nav>
                            </div>
                        </Drawer>
                    </div>
                </div>
            </div>
        </header>
    );
}
