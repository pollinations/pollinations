import {
    BookIcon,
    BrandMark,
    Button,
    Chip,
    ColorModeToggle,
    DiscordIcon,
    Drawer,
    DropdownItem,
    ExternalLinkButton,
    GitHubIcon,
    IconButton,
    LiveDot,
    LogInIcon,
    MenuIcon,
    SocialCount,
    StarIcon,
    TabButton,
    XIcon,
} from "@pollinations/ui";
import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { useDiscordPresence, useRepoStars } from "../../data/community";
import { compact } from "../../data/publicStats";
import { DOCS_URL, SOCIAL } from "./links";
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

const [GITHUB, DISCORD, ...OTHER_SOCIAL] = SOCIAL;

// Docs is read beside the site, so it opens a new tab; Sign in moves you
// into your account, so it stays in this one.
const ACCOUNT_ACTIONS = [
    { href: DOCS_URL, label: "Docs", Icon: BookIcon, external: true },
    {
        href: "https://enter.pollinations.ai",
        label: "Sign in",
        Icon: LogInIcon,
        external: false,
    },
] as const;

const isCurrent = (to: string, pathname: string) =>
    to === "/" ? pathname === "/" : pathname.startsWith(to);

function MenuUtilities({
    close,
    displayedRepoStars,
    discordOnline,
}: {
    close: () => void;
    displayedRepoStars: string | null;
    discordOnline: number | null;
}) {
    return (
        <>
            <DropdownItem
                as="a"
                href={GITHUB.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={close}
                className="site-drawer-social-link"
            >
                <GitHubIcon className="h-4 w-4 shrink-0" />
                <span className="site-drawer-social-label">{GITHUB.label}</span>
                {displayedRepoStars !== null && (
                    <Chip intent="neutral" size="sm">
                        {displayedRepoStars} stars
                    </Chip>
                )}
            </DropdownItem>
            <DropdownItem
                as="a"
                href={DISCORD.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={close}
                aria-label={
                    discordOnline === null
                        ? "Discord"
                        : `Discord — ${discordOnline.toLocaleString()} users online now`
                }
                className="site-drawer-social-link"
            >
                <DiscordIcon className="h-4 w-4 shrink-0" />
                <span className="site-drawer-social-label">
                    {DISCORD.label}
                </span>
                {discordOnline !== null && (
                    <SocialCount as="span" network="discord" showIcon={false}>
                        {compact(discordOnline)} online
                        <LiveDot />
                    </SocialCount>
                )}
            </DropdownItem>
            <footer className="mt-1 flex items-center gap-2 border-t border-theme-text-strong/10 px-2 pt-2">
                {OTHER_SOCIAL.map(({ href, label, Icon }) => (
                    <IconButton
                        key={href}
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="ghost"
                        size="md"
                        aria-label={label}
                        onClick={close}
                    >
                        <Icon className="h-4 w-4" />
                    </IconButton>
                ))}
            </footer>
        </>
    );
}

function GitHubStarsButton({ stars }: { stars: number | null }) {
    if (stars === null) return null;

    const displayedStars = compact(stars);
    const label = `Star us on GitHub — ${stars.toLocaleString()} stars`;

    return (
        <SocialCount
            network="github"
            href={GITHUB.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={label}
            title={label}
        >
            <span>{displayedStars}</span>
            <StarIcon filled className="h-2.5 w-2.5" />
        </SocialCount>
    );
}

function DiscordLiveButton({ online }: { online: number | null }) {
    if (online === null) return null;

    const label = `Join the Discord — ${online.toLocaleString()} users online now`;

    return (
        <SocialCount
            network="discord"
            href={DISCORD.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={label}
            title={label}
        >
            {compact(online)} online
            <LiveDot />
        </SocialCount>
    );
}

export function SiteHeader() {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const { data: repoStars } = useRepoStars();
    const displayedRepoStars = repoStars === null ? null : compact(repoStars);
    const { data: discordOnline } = useDiscordPresence({
        refreshMs: 300_000,
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
            className={`site-header pointer-events-none fixed inset-x-0 top-0 z-30 bg-transparent py-4 transition-transform duration-300 min-[880px]:pointer-events-auto min-[880px]:sticky sm:py-5 motion-reduce:transition-none ${
                hidden ? "-translate-y-full" : "translate-y-0"
            }`}
        >
            <div
                aria-hidden="true"
                className={`site-header-dissolve pointer-events-none absolute inset-x-0 top-0 hidden h-40 transition-opacity duration-300 min-[880px]:block motion-reduce:transition-none ${
                    scrolled && !hidden ? "opacity-100" : "opacity-0"
                }`}
            />
            <div className="site-shell relative z-10">
                <div className="site-gutter site-header-gutter flex items-center justify-between gap-4 sm:gap-6">
                    <div className="site-home-nav-group flex min-w-0 items-center gap-6">
                        <Link
                            to="/"
                            className="site-home-logo hidden items-center rounded-md text-theme-text-strong transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-theme-border min-[880px]:flex motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                            aria-label="pollinations.ai — home"
                        >
                            <BrandMark className="size-8" />
                        </Link>
                        <nav className="hidden gap-1.5 min-[880px]:flex">
                            {NAV.map((item) => (
                                <TabButton
                                    key={item.to}
                                    as={Link}
                                    to={item.to}
                                    variant="ghost"
                                    intent="brand"
                                    active={isCurrent(item.to, pathname)}
                                    className={
                                        item.to === "/"
                                            ? "site-home-nav-button"
                                            : undefined
                                    }
                                >
                                    {item.label}
                                </TabButton>
                            ))}
                            {/* Its own small group, at the colour toggle's height. */}
                            <div className="hidden items-center gap-1.5 pl-1 min-[1120px]:flex">
                                <DiscordLiveButton online={discordOnline} />
                                <GitHubStarsButton stars={repoStars} />
                            </div>
                        </nav>
                    </div>
                    <div className="pointer-events-auto flex items-center gap-2">
                        {ACCOUNT_ACTIONS.map(
                            ({ href, label, Icon, external }) => (
                                <ExternalLinkButton
                                    key={href}
                                    href={href}
                                    external={external}
                                    intent="surface"
                                    icon={<Icon className="h-4 w-4" />}
                                    className="hidden shrink-0 min-[880px]:inline-flex"
                                >
                                    {label}
                                </ExternalLinkButton>
                            ),
                        )}
                        <div className="hidden h-9 items-center min-[880px]:flex">
                            <ColorModeToggle />
                        </div>
                        <Button
                            aria-label="Open menu"
                            aria-expanded={mobileMenuOpen}
                            aria-controls="mobile-site-menu"
                            onClick={() => setMobileMenuOpen(true)}
                            className="mt-2 h-11 min-w-[5.5rem] gap-2 px-3 min-[880px]:hidden [&>svg]:size-6"
                        >
                            <BrandMark className="size-6.5" />
                            <MenuIcon />
                        </Button>

                        <Drawer
                            open={mobileMenuOpen}
                            onOpenChange={setMobileMenuOpen}
                            ariaLabel="Site navigation"
                            side="right"
                            contentClassName="w-[min(18.75rem,78vw)]"
                        >
                            <div className="flex min-h-0 flex-1 flex-col gap-3 p-3.5 pt-5">
                                <div className="flex shrink-0 justify-end">
                                    <Button
                                        aria-label="Close menu"
                                        onClick={() => setMobileMenuOpen(false)}
                                        className="h-11 w-full justify-between gap-2 px-3 [&>svg]:size-6 [&>svg]:shrink-0"
                                    >
                                        <BrandMark
                                            variant="lockup"
                                            className="h-5.5 w-43.5 min-w-0 shrink"
                                        />
                                        <XIcon />
                                    </Button>
                                </div>
                                <nav
                                    id="mobile-site-menu"
                                    className="flex min-h-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto"
                                >
                                    <div
                                        className={`flex flex-col gap-1.5 rounded-card bg-surface-opaque p-2.5 ${
                                            mobileMenuOpen
                                                ? "site-drawer-card-enter"
                                                : ""
                                        }`}
                                    >
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
                                                    intent="brand"
                                                    active={active}
                                                    size="lg"
                                                    onClick={() =>
                                                        setMobileMenuOpen(false)
                                                    }
                                                    className="w-full justify-start px-4"
                                                >
                                                    {item.label}
                                                </TabButton>
                                            );
                                        })}
                                    </div>
                                    <div
                                        className={`site-drawer-card-delay-1 grid grid-cols-2 gap-2 rounded-card bg-surface-opaque p-2.5 ${
                                            mobileMenuOpen
                                                ? "site-drawer-card-enter"
                                                : ""
                                        }`}
                                    >
                                        {ACCOUNT_ACTIONS.map(
                                            ({
                                                href,
                                                label,
                                                Icon,
                                                external,
                                            }) => (
                                                <ExternalLinkButton
                                                    key={href}
                                                    href={href}
                                                    external={external}
                                                    icon={
                                                        <Icon className="h-4 w-4 shrink-0" />
                                                    }
                                                    onClick={() =>
                                                        setMobileMenuOpen(false)
                                                    }
                                                    className="w-full px-3"
                                                >
                                                    {label}
                                                </ExternalLinkButton>
                                            ),
                                        )}
                                    </div>
                                    <div
                                        className={`site-drawer-card-delay-2 mt-auto flex flex-col gap-0.5 rounded-card bg-surface-opaque p-2.5 ${
                                            mobileMenuOpen
                                                ? "site-drawer-card-enter"
                                                : ""
                                        }`}
                                    >
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
                                    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-1.5 pt-0.5 text-xs text-theme-text-muted [&>button]:ml-auto">
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
