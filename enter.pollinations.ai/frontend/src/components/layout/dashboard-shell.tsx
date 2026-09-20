import {
    AccountIcon,
    AppIcon,
    BeakerIcon,
    BookIcon,
    BotIcon,
    CheckIcon,
    Chip,
    ClipboardIcon,
    ColorModeToggle,
    CopyButton,
    cn,
    DiscordIcon,
    ExternalLinkIcon,
    GitHubIcon,
    KeyIcon,
    McpIcon,
    MenuIcon,
    NavItem,
    PlayIcon,
    ScrollArea,
    SignOutIcon,
    useScrollLock,
} from "@pollinations/ui";
import logoMarkUrl from "@pollinations/ui/brand/mark.svg";
import { AccountPollen } from "@pollinations/ui/wallet";
import { Link, useRouterState } from "@tanstack/react-router";
import type {
    ComponentType,
    CSSProperties,
    FC,
    PropsWithChildren,
    ReactNode,
    RefObject,
} from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { genDocsUrl } from "../../config.ts";
import { DashboardSignInTrigger } from "../auth/dashboard-sign-in-trigger.tsx";
import { OPEN_WEBUI_URL } from "../models/open-webui-link.tsx";
import {
    DASHBOARD_NAV_ITEMS,
    type DashboardPage,
    type DashboardPath,
    PRIMARY_NAV_ITEMS,
} from "./dashboard-theme.ts";

export type { DashboardPage } from "./dashboard-theme.ts";

type DashboardNavItem = {
    id: DashboardPage;
    to: DashboardPath;
    label: string;
    icon: ComponentType<{ className?: string }>;
};

const brandMarkMask: CSSProperties = {
    WebkitMask: `url(${logoMarkUrl}) center / contain no-repeat`,
    mask: `url(${logoMarkUrl}) center / contain no-repeat`,
};

const PollinationsLogoIcon: FC<{ className?: string }> = ({ className }) => (
    <span
        aria-hidden="true"
        className={cn("block shrink-0 bg-current", className)}
        style={brandMarkMask}
    />
);

type DashboardShellProps = PropsWithChildren<{
    navItems?: readonly DashboardNavItem[];
    accountName?: string;
    accountAvatarUrl?: string;
    onSignOut?: () => void;
    pollenBalances?: { paid: number; quest: number };
}>;

type BrandLink = {
    href: string;
    label: string;
    icon: ComponentType<{ className?: string }>;
    text: string;
    count?: string;
};

const brandLinks: readonly BrandLink[] = [
    {
        href: "https://discord.gg/pollinations-ai-885844321461485618",
        label: "Discord community",
        icon: DiscordIcon,
        text: "Discord",
        count: "19k",
    },
    {
        href: "https://github.com/pollinations/pollinations",
        label: "Pollinations on GitHub",
        icon: GitHubIcon,
        text: "GitHub",
        count: "5k",
    },
    {
        href: "https://pollinations.ai",
        label: "Pollinations.ai website",
        icon: PollinationsLogoIcon,
        text: "Pollinations.ai",
    },
];

export const DashboardShell: FC<DashboardShellProps> = ({
    navItems = PRIMARY_NAV_ITEMS,
    accountName,
    accountAvatarUrl,
    onSignOut,
    pollenBalances,
    children,
}) => {
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const drawerRef = useRef<HTMLDivElement>(null);
    const menuButtonRef = useRef<HTMLButtonElement>(null);
    const mainScrollRef = useRef<HTMLDivElement>(null);
    const location = useRouterState({ select: (state) => state.location });
    const activeNavItem = DASHBOARD_NAV_ITEMS.find(
        (item) => item.to === location.pathname,
    );
    const activePage = activeNavItem?.id;
    const activeModelCategory = (location.search as { category?: string })
        .category;
    const activePageLabel =
        location.pathname === "/account"
            ? "Account"
            : activePage === "models"
              ? activeModelCategory === "agent"
                  ? "Agents"
                  : activeModelCategory === "mcp"
                    ? "MCP"
                    : "Models"
              : (activeNavItem?.label ?? "Dashboard");

    useDashboardShellBodyClass();
    useScrollLock(isDrawerOpen);

    useEffect(() => {
        const canonicalUrl = new URL(
            location.pathname,
            window.location.origin,
        ).toString();
        const title = `${activePageLabel} | pollinations.ai`;
        document.title = title;
        document
            .querySelector('link[rel="canonical"]')
            ?.setAttribute("href", canonicalUrl);
        document
            .querySelector('meta[property="og:url"]')
            ?.setAttribute("content", canonicalUrl);
        document
            .querySelector('meta[property="og:title"]')
            ?.setAttribute("content", title);
        document
            .querySelector('meta[name="twitter:title"]')
            ?.setAttribute("content", title);
    }, [activePageLabel, location.pathname]);

    const closeDrawer = useCallback(() => {
        const activeElement = document.activeElement;
        const restoreFocus =
            activeElement instanceof HTMLElement &&
            drawerRef.current?.contains(activeElement);

        setIsDrawerOpen(false);
        if (restoreFocus) {
            requestAnimationFrame(() =>
                menuButtonRef.current?.focus({ preventScroll: true }),
            );
        }
    }, []);

    useEffect(() => {
        if (isDrawerOpen)
            drawerRef.current
                ?.querySelector<HTMLElement>("nav a, nav button")
                ?.focus({ preventScroll: true });
    }, [isDrawerOpen]);

    useEffect(() => {
        // Match Tailwind's lg layout, which replaces the drawer with the rail.
        const desktopLayout = window.matchMedia("(min-width: 64rem)");
        const closeOnDesktop = () => {
            // The mobile trigger is hidden here, so do not restore focus to it.
            if (desktopLayout.matches) setIsDrawerOpen(false);
        };
        closeOnDesktop();
        desktopLayout.addEventListener("change", closeOnDesktop);
        return () =>
            desktopLayout.removeEventListener("change", closeOnDesktop);
    }, []);

    useEffect(() => {
        if (!isDrawerOpen) return;

        function handleKeyDown(event: KeyboardEvent): void {
            if (event.key === "Escape") closeDrawer();
        }

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [closeDrawer, isDrawerOpen]);

    useEffect(() => {
        const scrollElement = mainScrollRef.current;
        if (!scrollElement) return;

        const sectionHash =
            (activePage === "pollen" && location.hash === "buy-pollen") ||
            (activePage === "news-faq" && location.hash === "faq") ||
            (activePage === "keys" &&
                (location.hash === "api-keys" ||
                    location.hash === "app-keys")) ||
            (activePage === "my-models" &&
                (location.hash === "models" || location.hash === "agents"));
        if (sectionHash) {
            const target = document.getElementById(location.hash);
            if (
                target instanceof HTMLElement &&
                scrollElement.contains(target)
            ) {
                const scrollRect = scrollElement.getBoundingClientRect();
                const targetRect = target.getBoundingClientRect();
                const targetTop =
                    targetRect.top - scrollRect.top + scrollElement.scrollTop;

                scrollElement.scrollTo({
                    top: Math.max(0, targetTop - 24),
                    behavior: "auto",
                });
                return;
            }
        }

        scrollElement.scrollTo({ top: 0, behavior: "auto" });
    }, [activePage, location.hash]);

    const rail = (
        <DashboardRail
            activePage={activePage}
            activeSection={location.hash}
            accountActive={location.pathname === "/account"}
            activeModelCategory={activeModelCategory}
            showCreate={Boolean(onSignOut)}
            navItems={navItems}
            accountName={accountName}
            accountAvatarUrl={accountAvatarUrl}
            onSignOut={onSignOut}
            pollenBalances={pollenBalances}
            onNavigate={closeDrawer}
            onSignIn={() => setIsDrawerOpen(false)}
        />
    );

    return (
        <div className="flex h-dvh overflow-hidden bg-app-bg text-theme-text-strong">
            <div className="hidden lg:block">{rail}</div>
            <div
                ref={drawerRef}
                id="mobile-navigation"
                role="dialog"
                aria-modal={isDrawerOpen || undefined}
                aria-label="Navigation"
                className={cn(
                    "fixed inset-0 z-40 lg:hidden",
                    isDrawerOpen
                        ? "pointer-events-auto visible transition-none"
                        : "pointer-events-none invisible transition-[visibility] delay-[420ms]",
                )}
                aria-hidden={!isDrawerOpen}
                inert={!isDrawerOpen}
            >
                <button
                    type="button"
                    className={cn(
                        "absolute inset-0 bg-surface-opaque/45 backdrop-blur-xl transition-opacity ease-out",
                        "duration-[420ms]",
                        isDrawerOpen ? "opacity-100" : "opacity-0",
                    )}
                    onClick={closeDrawer}
                    aria-label="Close navigation"
                />
                <div
                    className={cn(
                        "absolute inset-y-0 left-0 w-max max-w-[calc(100vw-3rem)] transform-gpu transition-transform ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform",
                        "duration-[420ms]",
                        isDrawerOpen ? "translate-x-0" : "-translate-x-full",
                    )}
                >
                    <div className="flex h-full flex-col overflow-hidden">
                        {rail}
                    </div>
                </div>
            </div>
            <div
                className="flex min-w-0 flex-1 flex-col lg:ml-60"
                inert={isDrawerOpen}
            >
                <MobileMenuButton
                    buttonRef={menuButtonRef}
                    expanded={isDrawerOpen}
                    onOpen={() => setIsDrawerOpen(true)}
                />
                <ScrollArea
                    ref={mainScrollRef}
                    className="min-h-0 min-w-0 flex-1 overscroll-contain px-4 pt-14 pb-8 lg:px-6 lg:pt-10"
                    style={{ overflowY: isDrawerOpen ? "hidden" : undefined }}
                >
                    <main className="mx-auto w-full max-w-[800px]">
                        <div className="flex w-full flex-col gap-6">
                            {children}
                        </div>
                    </main>
                </ScrollArea>
            </div>
        </div>
    );
};

function useDashboardShellBodyClass(): void {
    useEffect(() => {
        document.documentElement.classList.add("polli-ui-shell");
        document.body.classList.add("polli-ui-shell");
        return () => {
            document.documentElement.classList.remove("polli-ui-shell");
            document.body.classList.remove("polli-ui-shell");
        };
    }, []);
}

type DashboardRailProps = {
    activePage?: DashboardPage;
    activeSection?: string;
    accountActive: boolean;
    activeModelCategory?: string;
    showCreate: boolean;
    navItems: readonly DashboardNavItem[];
    accountName?: string;
    accountAvatarUrl?: string;
    onSignOut?: () => void;
    pollenBalances?: { paid: number; quest: number };
    onNavigate: () => void;
    onSignIn: () => void;
};

const DashboardRail: FC<DashboardRailProps> = ({
    activePage,
    activeSection,
    accountActive,
    activeModelCategory,
    showCreate,
    navItems,
    accountName,
    accountAvatarUrl,
    onSignOut,
    pollenBalances,
    onNavigate,
    onSignIn,
}) => (
    <aside
        data-theme="neutral"
        className="flex min-h-0 flex-1 flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:w-60"
        aria-label="Dashboard navigation"
    >
        <RailScrollArea>
            <div className="flex min-h-full flex-col pr-2 pb-4">
                <nav className="flex flex-col items-start gap-1 pt-[max(1rem,env(safe-area-inset-top))] lg:pt-3">
                    {onSignOut ? (
                        <section aria-label="Account" className="mb-3 w-full">
                            <div className="flex items-center gap-2">
                                <NavItem
                                    as={Link}
                                    to="/account"
                                    flushLeft
                                    data-theme="accent"
                                    icon={AccountIcon}
                                    active={accountActive}
                                    onClick={onNavigate}
                                    aria-label={`Account: ${accountName ?? "Account"}`}
                                    className="dashboard-rail-tab min-w-0"
                                >
                                    <span
                                        className="min-w-0 truncate"
                                        title={accountName}
                                    >
                                        {accountName ?? "Account"}
                                    </span>
                                    {accountAvatarUrl ? (
                                        <img
                                            src={accountAvatarUrl}
                                            alt=""
                                            className="h-5 w-5 shrink-0 rounded-full object-cover"
                                        />
                                    ) : (
                                        <span
                                            aria-hidden="true"
                                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-theme-bg-pale text-micro"
                                        >
                                            {accountName
                                                ?.slice(0, 1)
                                                .toUpperCase() ?? "?"}
                                        </span>
                                    )}
                                </NavItem>
                                <button
                                    type="button"
                                    aria-label="Sign out"
                                    title="Sign out"
                                    onClick={() => {
                                        onNavigate();
                                        onSignOut();
                                    }}
                                    className="polli-control dashboard-rail-action flex shrink-0 items-center justify-center rounded-full text-theme-text-muted transition-colors hover:text-theme-text-strong"
                                >
                                    <SignOutIcon
                                        className="h-4 w-4"
                                        aria-hidden="true"
                                    />
                                </button>
                            </div>
                        </section>
                    ) : (
                        <section aria-label="Account" className="mb-3 w-full">
                            <DashboardSignInTrigger
                                variant="navigation"
                                onOpen={onSignIn}
                            />
                        </section>
                    )}
                    {navItems
                        .filter((item) => item.id === "pollen")
                        .map((pollen) => (
                            <NavItem
                                key={pollen.id}
                                as={Link}
                                to={pollen.to}
                                flushLeft
                                data-theme="accent"
                                icon={pollen.icon}
                                active={activePage === pollen.id}
                                onClick={onNavigate}
                                className="dashboard-rail-tab"
                            >
                                <span className="inline-flex items-center gap-1">
                                    {pollen.label}
                                    {pollenBalances && (
                                        <span className="text-xs tabular-nums opacity-75">
                                            <AccountPollen
                                                source={{
                                                    type: "wallet",
                                                    balances: pollenBalances,
                                                }}
                                            />
                                        </span>
                                    )}
                                </span>
                            </NavItem>
                        ))}
                    {navItems
                        .filter((item) => item.id === "quests")
                        .map((item) => (
                            <DashboardNavGroup
                                key={item.id}
                                title="Quests"
                                className="mb-3"
                            >
                                <NavItem
                                    as={Link}
                                    to={item.to}
                                    flushLeft
                                    data-theme="accent"
                                    icon={item.icon}
                                    active={activePage === item.id}
                                    onClick={onNavigate}
                                    className="dashboard-rail-tab"
                                >
                                    {item.label}
                                    <Chip
                                        intent="neutral"
                                        size="sm"
                                        className="ml-auto bg-transparent text-theme-text-soft"
                                    >
                                        3 new!
                                    </Chip>
                                </NavItem>
                            </DashboardNavGroup>
                        ))}
                    {showCreate && (
                        <DashboardNavGroup title="Your resources">
                            <NavItem
                                as={Link}
                                to="/keys"
                                hash="api-keys"
                                flushLeft
                                data-theme="accent"
                                icon={KeyIcon}
                                active={
                                    activePage === "keys" &&
                                    activeSection !== "app-keys"
                                }
                                onClick={onNavigate}
                                className="dashboard-rail-tab"
                            >
                                My keys
                            </NavItem>
                            <NavItem
                                as={Link}
                                to="/keys"
                                hash="app-keys"
                                flushLeft
                                data-theme="accent"
                                icon={AppIcon}
                                active={
                                    activePage === "keys" &&
                                    activeSection === "app-keys"
                                }
                                onClick={onNavigate}
                                className="dashboard-rail-tab"
                            >
                                My apps
                            </NavItem>
                            <NavItem
                                as={Link}
                                to="/my-models"
                                hash="models"
                                flushLeft
                                data-theme="accent"
                                icon={BeakerIcon}
                                active={
                                    activePage === "my-models" &&
                                    activeSection !== "agents"
                                }
                                onClick={onNavigate}
                                className="dashboard-rail-tab"
                            >
                                My models
                            </NavItem>
                            <NavItem
                                as={Link}
                                to="/my-models"
                                hash="agents"
                                flushLeft
                                data-theme="accent"
                                icon={BotIcon}
                                active={
                                    activePage === "my-models" &&
                                    activeSection === "agents"
                                }
                                onClick={onNavigate}
                                className="dashboard-rail-tab"
                            >
                                My agents
                            </NavItem>
                        </DashboardNavGroup>
                    )}
                    {navItems
                        .filter((candidate) => candidate.id === "activity")
                        .map((activity) => (
                            <NavItem
                                key={activity.id}
                                as={Link}
                                to={activity.to}
                                flushLeft
                                data-theme="accent"
                                icon={activity.icon}
                                active={activePage === activity.id}
                                onClick={onNavigate}
                                className="dashboard-rail-tab"
                            >
                                {activity.label}
                            </NavItem>
                        ))}
                    {navItems
                        .filter((item) => item.id === "news-faq")
                        .map((item) => (
                            <NavItem
                                key={item.id}
                                as={Link}
                                to={item.to}
                                hash=""
                                flushLeft
                                data-theme="accent"
                                active={activePage === item.id}
                                onClick={onNavigate}
                                aria-label="News and FAQ"
                                className="dashboard-rail-tab mt-4 self-start"
                            >
                                <PollinationsLogoIcon className="h-4 w-4" />
                                News &amp; FAQ
                            </NavItem>
                        ))}
                    <div className="mb-3 w-full">
                        <ExploreNav
                            active={activePage === "models"}
                            category={activeModelCategory}
                            onNavigate={onNavigate}
                        />
                    </div>
                </nav>
                <div className="mt-auto flex w-full flex-col gap-1 pt-1">
                    <DashboardDocs />
                    <DashboardPlayground />
                    <BrandLinks links={brandLinks} />
                    <div
                        data-theme="accent"
                        className="dashboard-rail-theme mt-2 flex"
                    >
                        <ColorModeToggle />
                    </div>
                </div>
            </div>
        </RailScrollArea>
    </aside>
);

const RailScrollArea: FC<PropsWithChildren> = ({ children }) => (
    <div data-theme="accent" className="min-h-0 flex-1">
        <ScrollArea
            scrollbar="native"
            className="h-full min-h-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
            {children}
        </ScrollArea>
    </div>
);

const DashboardNavGroup: FC<{
    title: string;
    children: ReactNode;
    className?: string;
}> = ({ title, children, className }) => (
    <section
        aria-label={title}
        className={cn("flex w-full flex-col items-start gap-1", className)}
    >
        {children}
    </section>
);

const ExploreNav: FC<{
    active: boolean;
    category?: string;
    onNavigate: () => void;
}> = ({ active, category, onNavigate }) => (
    <DashboardNavGroup title="Explore">
        <Link
            to="/models"
            search={(previous) => ({ ...previous, category: undefined })}
            aria-current={
                active && category !== "agent" && category !== "mcp"
                    ? "page"
                    : undefined
            }
            className="w-fit"
            onClick={onNavigate}
        >
            <NavItem
                as="span"
                flushLeft
                data-theme="accent"
                icon={BeakerIcon}
                active={active && category !== "agent" && category !== "mcp"}
                className="dashboard-rail-tab"
            >
                Model catalog
            </NavItem>
        </Link>
        <Link
            to="/models"
            search={(previous) => ({ ...previous, category: "agent" })}
            aria-current={active && category === "agent" ? "page" : undefined}
            className="w-fit"
            onClick={onNavigate}
        >
            <NavItem
                as="span"
                flushLeft
                data-theme="accent"
                icon={BotIcon}
                active={active && category === "agent"}
                className="dashboard-rail-tab"
            >
                Agent catalog
            </NavItem>
        </Link>
        <Link
            to="/models"
            search={(previous) => ({ ...previous, category: "mcp" })}
            aria-current={active && category === "mcp" ? "page" : undefined}
            className="w-fit"
            onClick={onNavigate}
        >
            <NavItem
                as="span"
                flushLeft
                data-theme="accent"
                icon={McpIcon}
                active={active && category === "mcp"}
                className="dashboard-rail-tab"
            >
                MCP servers
            </NavItem>
        </Link>
    </DashboardNavGroup>
);

const MobileMenuButton: FC<{
    buttonRef: RefObject<HTMLButtonElement | null>;
    expanded: boolean;
    onOpen: () => void;
}> = ({ buttonRef, expanded, onOpen }) => (
    <button
        ref={buttonRef}
        type="button"
        className="fixed left-3 top-3 z-30 flex h-9 w-9 items-center justify-center rounded-full bg-surface-opaque text-theme-text-strong shadow-md ring-1 ring-theme-text-strong/10 hover:bg-surface-opaque lg:hidden"
        onClick={onOpen}
        aria-label="Open navigation"
        aria-expanded={expanded}
        aria-controls="mobile-navigation"
    >
        <MenuIcon className="h-5 w-5" />
    </button>
);

const BrandLinks: FC<{ links: readonly BrandLink[] }> = ({ links }) => (
    <section
        data-theme="accent"
        aria-label="Pollinations links"
        className="flex flex-col items-start gap-1"
    >
        {links.map(({ href, label, icon, text, count }) => (
            <NavItem
                key={href}
                as="a"
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${label} (opens in a new tab)`}
                flushLeft
                data-theme="neutral"
                icon={icon}
                className="dashboard-rail-tab dashboard-rail-external dashboard-rail-slim-link"
            >
                {text}
                {count && (
                    <span className="font-mono text-micro text-theme-text-muted">
                        {count}
                    </span>
                )}
                <ExternalLinkIcon
                    className="h-3 w-3 text-theme-text-muted"
                    aria-hidden="true"
                />
            </NavItem>
        ))}
    </section>
);

const DashboardPlayground: FC = () => (
    <NavItem
        as="a"
        href={OPEN_WEBUI_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Playground: test chat models in Open WebUI (opens in a new tab)"
        flushLeft
        data-theme="neutral"
        icon={PlayIcon}
        className="dashboard-rail-tab dashboard-rail-external self-start"
    >
        Playground
        <ExternalLinkIcon
            className="h-3 w-3 text-theme-text-muted"
            aria-hidden="true"
        />
    </NavItem>
);

const DashboardDocs: FC = () => (
    <section data-theme="accent" className="flex items-center gap-2">
        <NavItem
            as="a"
            href={genDocsUrl()}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Docs (opens in a new tab)"
            flushLeft
            data-theme="neutral"
            icon={BookIcon}
            className="dashboard-rail-tab dashboard-rail-external"
        >
            Docs
            <ExternalLinkIcon
                className="h-3 w-3 text-theme-text-muted"
                aria-hidden="true"
            />
        </NavItem>
        <CopyButton
            value={async () => {
                const res = await fetch(`${genDocsUrl()}/llm.txt`);
                return res.text();
            }}
            copiedTimeoutMs={1500}
            tooltip="Copy all docs"
            copiedTooltip="Copied"
            aria-label="Copy all docs"
            className="dashboard-rail-action flex shrink-0 items-center justify-center rounded-full text-theme-text-muted transition-colors hover:text-theme-text-strong"
        >
            {(copied) =>
                copied ? (
                    <CheckIcon className="h-4 w-4" aria-hidden="true" />
                ) : (
                    <ClipboardIcon className="h-4 w-4" aria-hidden="true" />
                )
            }
        </CopyButton>
    </section>
);
