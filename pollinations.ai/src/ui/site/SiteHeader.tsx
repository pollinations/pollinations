import {
    BookIcon,
    Button,
    Chip,
    ColorModeToggle,
    DiscordIcon,
    Drawer,
    DropdownItem,
    ExternalLinkIcon,
    GitHubIcon,
    InstagramIcon,
    LinkedInIcon,
    LogInIcon,
    MenuIcon,
    StarIcon,
    TabButton,
    XIcon,
    XSocialIcon,
} from "@pollinations/ui";
import lockupUrl from "@pollinations/ui/brand/lockup-horizontal.svg";
import markUrl from "@pollinations/ui/brand/mark.svg";
import { Link, useRouterState } from "@tanstack/react-router";
import { type CSSProperties, Fragment, useState } from "react";
import { useDiscordPresence, useRepoStars } from "../../data/community";
import { compact } from "../../data/publicStats";
import {
    DISCORD_BLURPLE_STYLE,
    DiscordPresenceBadge,
} from "./DiscordPresenceBadge";
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
        label: "X",
        Icon: XSocialIcon,
    },
    {
        href: "https://www.linkedin.com/company/pollinations-ai",
        label: "LinkedIn",
        Icon: LinkedInIcon,
    },
] as const;

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
    "hidden h-9 shrink-0 gap-1.5 bg-surface-opaque px-3 text-theme-text-strong shadow-well min-[780px]:inline-flex";

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
                href={EXTERNAL[1].href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={close}
                className="site-drawer-social-link site-external-link"
            >
                <GitHubIcon className="h-4 w-4 shrink-0" />
                <span className="site-drawer-social-label">
                    {EXTERNAL[1].label}
                </span>
                {displayedRepoStars !== null && (
                    <Chip intent="neutral" size="sm">
                        {displayedRepoStars} stars
                    </Chip>
                )}
            </DropdownItem>
            <DropdownItem
                as="a"
                href={EXTERNAL[2].href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={close}
                aria-label={
                    discordOnline === null
                        ? "Discord"
                        : `Discord — ${discordOnline.toLocaleString()} users online now`
                }
                className="site-drawer-social-link site-external-link"
            >
                <DiscordIcon className="h-4 w-4 shrink-0" />
                <span className="site-drawer-social-label">
                    {EXTERNAL[2].label}
                </span>
                <DiscordPresenceBadge online={discordOnline} />
            </DropdownItem>
            <footer className="mt-1 flex items-center gap-2 border-t border-theme-text-strong/10 px-2 pt-2">
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
        </>
    );
}

function GitHubStarsButton({ stars }: { stars: number | null }) {
    if (stars === null) return null;

    const displayedStars = compact(stars);
    const label = `Star us on GitHub — ${stars.toLocaleString()} stars`;

    return (
        <Button
            as="a"
            href={EXTERNAL[1].href}
            target="_blank"
            rel="noopener noreferrer"
            intent="neutral"
            size="xs"
            aria-label={label}
            title={label}
            className="site-github-stars hidden gap-2 px-3 min-[1120px]:inline-flex"
        >
            <GitHubIcon className="h-3 w-3" />
            <span>{displayedStars}</span>
            <StarIcon filled className="h-2.5 w-2.5" />
        </Button>
    );
}

function DiscordLiveButton({ online }: { online: number | null }) {
    if (online === null) return null;

    const label = `Join Discord — ${online.toLocaleString()} users online now`;

    return (
        <Button
            as="a"
            href={EXTERNAL[2].href}
            target="_blank"
            rel="noopener noreferrer"
            intent="neutral"
            size="xs"
            aria-label={label}
            title={label}
            style={DISCORD_BLURPLE_STYLE}
            className="hidden gap-2 px-3 min-[1120px]:inline-flex"
        >
            <DiscordIcon className="h-3 w-3" />
            <span>{compact(online)} online</span>
        </Button>
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
            className={`site-header pointer-events-none fixed inset-x-0 top-0 z-30 bg-transparent py-4 transition-transform duration-300 min-[780px]:pointer-events-auto min-[780px]:sticky sm:py-5 motion-reduce:transition-none ${
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
                                    <Fragment key={item.to}>
                                        <TabButton
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
                                        {item.to === "/community" && (
                                            <>
                                                <DiscordLiveButton
                                                    online={discordOnline}
                                                />
                                                <GitHubStarsButton
                                                    stars={repoStars}
                                                />
                                            </>
                                        )}
                                    </Fragment>
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
                            <ExternalLinkIcon className="h-3.5 w-3.5 opacity-60" />
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
                            <ExternalLinkIcon className="h-3.5 w-3.5 opacity-60" />
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
                            contentClassName="w-[min(18.75rem,78vw)]"
                        >
                            <div className="flex min-h-0 flex-1 flex-col gap-3 p-3.5 pt-5">
                                <div className="flex shrink-0 justify-end">
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
                                    className="flex min-h-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto"
                                >
                                    <div
                                        className={`site-drawer-card flex flex-col gap-1.5 rounded-[18px] bg-surface-opaque p-2.5 shadow-well ${
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
                                                    active={active}
                                                    size="lg"
                                                    onClick={() =>
                                                        setMobileMenuOpen(false)
                                                    }
                                                    className="site-primary-nav-button w-full justify-start px-4"
                                                >
                                                    {item.label}
                                                </TabButton>
                                            );
                                        })}
                                    </div>
                                    <div
                                        className={`site-drawer-card site-drawer-card-delay-1 grid grid-cols-2 gap-2 rounded-[18px] bg-surface-opaque p-2.5 shadow-well ${
                                            mobileMenuOpen
                                                ? "site-drawer-card-enter"
                                                : ""
                                        }`}
                                    >
                                        <Button
                                            as="a"
                                            href={EXTERNAL[0].href}
                                            size="md"
                                            onClick={() =>
                                                setMobileMenuOpen(false)
                                            }
                                            className="w-full gap-2 px-3"
                                        >
                                            <BookIcon className="h-4 w-4 shrink-0" />
                                            {EXTERNAL[0].label}
                                            <ExternalLinkIcon className="ml-auto h-3.5 w-3.5 shrink-0 opacity-60" />
                                        </Button>
                                        <Button
                                            as="a"
                                            href="https://enter.pollinations.ai"
                                            size="md"
                                            onClick={() =>
                                                setMobileMenuOpen(false)
                                            }
                                            className="w-full gap-2 px-3"
                                        >
                                            <LogInIcon className="h-4 w-4 shrink-0" />
                                            Login
                                            <ExternalLinkIcon className="ml-auto h-3.5 w-3.5 shrink-0 opacity-60" />
                                        </Button>
                                    </div>
                                    <div
                                        className={`site-drawer-card site-drawer-card-delay-2 mt-auto flex flex-col gap-0.5 rounded-[18px] bg-surface-opaque p-2.5 shadow-well ${
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
                                    <div className="flex shrink-0 items-center justify-between gap-3 px-1.5 pt-0.5 text-xs text-theme-text-muted">
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
