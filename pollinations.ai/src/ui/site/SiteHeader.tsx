import {
    BookIcon,
    BrandLockup,
    Button,
    Chip,
    ColorModeToggle,
    DiscordIcon,
    Dropdown,
    DropdownItem,
    Eyebrow,
    GitHubIcon,
    InstagramIcon,
    LinkedInIcon,
    LogInIcon,
    MenuIcon,
    TabButton,
    XIcon,
    XSocialIcon,
} from "@pollinations/ui";
import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { useDiscordPresence, useRepoStars } from "../../data/community";
import { compact } from "../../data/publicStats";
import { useHideOnScroll, useScrolled } from "./useHideOnScroll";

const NAV = [
    { to: "/", label: "Hello" },
    { to: "/play", label: "Play" },
    { to: "/apps", label: "Apps" },
    { to: "/community", label: "Community" },
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

const DESKTOP_UTILITIES = [
    { ...EXTERNAL[1], Icon: GitHubIcon },
    { ...EXTERNAL[2], Icon: DiscordIcon },
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
const DESKTOP_ACTION_CLASS =
    "hidden h-9 w-9 shrink-0 bg-surface-opaque p-0 text-theme-text-strong shadow-well transition-all duration-200 hover:-translate-y-0.5 hover:bg-theme-bg-hover hover:shadow-lg min-[700px]:inline-flex min-[800px]:w-auto min-[800px]:gap-1.5 min-[800px]:px-3 motion-reduce:hover:translate-y-0";

const isCurrent = (to: string, pathname: string) =>
    to === "/" ? pathname === "/" : pathname.startsWith(to);

export function SiteHeader() {
    const [menuOpen, setMenuOpen] = useState(false);
    const { data: repoStars } = useRepoStars();
    const displayedRepoStars = compact(repoStars ?? REPO_STARS_FALLBACK);
    const { data: discordOnline } = useDiscordPresence({
        enabled: menuOpen,
        refreshMs: 30_000,
    });
    const scrolled = useScrolled();
    const scrolledAway = useHideOnScroll();
    const pathname = useRouterState({
        select: (state) => state.location.pathname,
    });

    // The header must not slide away while its own menu is open.
    const hidden = scrolledAway && !menuOpen;

    return (
        <header
            className={`pointer-events-none fixed inset-x-0 top-0 z-30 bg-transparent py-4 transition-transform duration-300 focus-within:translate-y-0 min-[700px]:pointer-events-auto min-[700px]:sticky sm:py-5 motion-reduce:transition-none ${
                hidden ? "-translate-y-full" : "translate-y-0"
            }`}
        >
            <div
                aria-hidden="true"
                className={`site-header-dissolve pointer-events-none absolute inset-x-0 top-0 hidden h-40 transition-opacity duration-300 min-[700px]:block motion-reduce:transition-none ${
                    scrolled && !hidden ? "opacity-100" : "opacity-0"
                }`}
            />
            <div className="site-shell relative z-10">
                <div className="site-gutter site-header-gutter flex items-center justify-between gap-4 sm:gap-6">
                    <div className="site-home-nav-group flex min-w-0 items-center gap-6">
                        <Link
                            to="/"
                            className="site-home-logo group relative hidden items-center rounded-md text-theme-text-strong transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-theme-border min-[700px]:flex motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                            aria-label="pollinations.ai — home"
                        >
                            <span className="relative inline-flex min-[1080px]:hidden">
                                <BrandLockup
                                    variant="mark"
                                    height={32}
                                    label=""
                                    className={`site-home-logo-accent absolute translate-x-[3px] translate-y-[3px] text-theme-bg-active transition-opacity duration-200 motion-reduce:transition-none ${
                                        pathname === "/"
                                            ? "opacity-100"
                                            : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                                    }`}
                                />
                                <BrandLockup
                                    variant="mark"
                                    height={32}
                                    label=""
                                    className="relative z-10"
                                />
                            </span>
                            <span className="relative hidden min-[1080px]:inline-flex">
                                <BrandLockup
                                    height={30}
                                    label=""
                                    className={`site-home-logo-accent absolute translate-x-[3px] translate-y-[3px] text-theme-bg-active transition-opacity duration-200 motion-reduce:transition-none ${
                                        pathname === "/"
                                            ? "opacity-100"
                                            : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                                    }`}
                                />
                                <BrandLockup
                                    height={30}
                                    label=""
                                    className="relative z-10"
                                />
                            </span>
                        </Link>
                        <nav className="hidden gap-1.5 min-[700px]:flex">
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
                            <span className="hidden min-[800px]:inline">
                                Docs
                            </span>
                        </Button>
                        {DESKTOP_UTILITIES.map((item) => {
                            const { href, label, Icon } = item;
                            const showStars = label === "GitHub";
                            return (
                                <Button
                                    key={href}
                                    as="a"
                                    href={href}
                                    size="sm"
                                    aria-label={label}
                                    title={label}
                                    className={`site-external-link hidden h-9 shrink-0 min-[900px]:inline-flex ${
                                        showStars
                                            ? "w-auto gap-1.5 px-2"
                                            : "w-9 p-0"
                                    }`}
                                >
                                    <Icon className="h-4 w-4" />
                                    {showStars && (
                                        <span className="text-xs tabular-nums">
                                            {displayedRepoStars}
                                        </span>
                                    )}
                                </Button>
                            );
                        })}
                        <Button
                            as="a"
                            href="https://enter.pollinations.ai"
                            size="sm"
                            aria-label="Login"
                            title="Login"
                            className={DESKTOP_ACTION_CLASS}
                        >
                            <LogInIcon className="h-4 w-4" />
                            <span className="hidden min-[800px]:inline">
                                Login
                            </span>
                        </Button>
                        <Dropdown
                            align="end"
                            open={menuOpen}
                            onOpenChange={setMenuOpen}
                            className="w-64 bg-surface-opaque p-2 shadow-well"
                            trigger={(open) => (
                                <Button
                                    aria-label={
                                        open ? "Close menu" : "Open menu"
                                    }
                                    aria-expanded={open}
                                    aria-controls="site-menu"
                                    className="mt-2 h-11 w-11 min-w-11 p-0 min-[700px]:mt-0 min-[900px]:hidden [&>svg]:size-6"
                                >
                                    {open ? <XIcon /> : <MenuIcon />}
                                </Button>
                            )}
                        >
                            {(close) => (
                                <nav
                                    id="site-menu"
                                    className="flex max-h-[calc(100dvh-6rem)] flex-col gap-1 overflow-x-hidden overflow-y-auto"
                                >
                                    <div className="contents min-[700px]:hidden">
                                        <div className="flex items-center px-2 py-2">
                                            <Link
                                                to="/"
                                                onClick={close}
                                                aria-label="pollinations.ai — home"
                                                className="rounded-md text-theme-text-strong focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-theme-border"
                                            >
                                                <BrandLockup
                                                    height={24}
                                                    label=""
                                                />
                                            </Link>
                                        </div>
                                        <span className="mx-2 my-1 h-px bg-theme-border" />
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
                                                    className="site-primary-nav-button w-full justify-start"
                                                >
                                                    {item.label}
                                                </TabButton>
                                            );
                                        })}
                                        <span className="mx-2 my-1 h-px bg-theme-border" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 px-1 py-1 min-[700px]:hidden">
                                        <Button
                                            as="a"
                                            href={EXTERNAL[0].href}
                                            intent="info"
                                            size="sm"
                                            onClick={close}
                                            className="w-full gap-2"
                                        >
                                            <BookIcon className="h-4 w-4 shrink-0" />
                                            {EXTERNAL[0].label}
                                        </Button>
                                        <Button
                                            as="a"
                                            href="https://enter.pollinations.ai"
                                            intent="info"
                                            size="sm"
                                            onClick={close}
                                            className="w-full gap-2"
                                        >
                                            <LogInIcon className="h-4 w-4 shrink-0" />
                                            Login
                                        </Button>
                                    </div>
                                    <span className="mx-2 my-1 h-px bg-theme-border min-[700px]:hidden" />
                                    <div className="flex items-center justify-between px-3 py-2">
                                        <Eyebrow size="chrome">
                                            Appearance
                                        </Eyebrow>
                                        <ColorModeToggle />
                                    </div>
                                    <span className="mx-2 my-1 h-px bg-theme-border" />
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
                                        <Chip
                                            intent="alpha"
                                            size="sm"
                                            className="ml-auto"
                                        >
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
                                            <Chip
                                                intent="info"
                                                size="sm"
                                                className="ml-auto"
                                            >
                                                {discordOnline} online
                                            </Chip>
                                        )}
                                    </DropdownItem>
                                    <footer className="flex items-center gap-2 px-2 py-1">
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
                                    </footer>
                                </nav>
                            )}
                        </Dropdown>
                    </div>
                </div>
            </div>
        </header>
    );
}
