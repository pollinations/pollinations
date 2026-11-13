import {
    AccountIcon,
    BeakerIcon,
    BookIcon,
    BotIcon,
    BrandMark,
    Button,
    ChevronIcon,
    Chip,
    ColorModeToggle,
    CopyButton,
    CopyStateIcon,
    cn,
    InlineLink,
    McpIcon,
    MenuIcon,
    NavItem,
    RocketIcon,
    ScrollArea,
    TerminalIcon,
    useScrollLock,
    WalletIcon,
} from "@pollinations/ui";
import { Link, useRouterState } from "@tanstack/react-router";
import type {
    ComponentType,
    CSSProperties,
    FC,
    PropsWithChildren,
    ReactNode,
    RefObject,
} from "react";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { accountClient, apiClient } from "../../api.ts";
import { genDocsUrl } from "../../config.ts";
import { pageMeta } from "../../page-meta.ts";
import { MobileCopyDocsButton } from "../copy-docs.tsx";
import {
    QUEST_STATUS_UPDATED_EVENT,
    questNavLabel,
} from "../quests/quest-nav-status.ts";
import {
    DASHBOARD_NAV_ITEMS,
    type DashboardNavGroup,
    type DashboardPage,
    type DashboardPath,
    navItemFor,
} from "./dashboard-theme.ts";

export type { DashboardPage } from "./dashboard-theme.ts";

type DashboardNavItem = {
    id: DashboardPage;
    to: DashboardPath;
    search?: { view?: string };
    label: string;
    icon: ComponentType<{ className?: string }>;
    group: DashboardNavGroup;
};

// Two parts: the platform at the top (News & FAQ, models, agents, MCP,
// sandboxes, Docs), and everything about you as one block at the bottom:
// Credits and Quests with their balances, what you build (My listings, Keys),
// Activity, then your name, the way to Settings. A thin line opens each part. Signed out, the bottom holds the sign-in
// buttons.
const NAV_LINE_CLASS = "border-theme-text-strong/10";

type DashboardShellProps = PropsWithChildren<{
    navItems?: readonly DashboardNavItem[];
    githubAvatarUrl?: string;
    accountArea?: ReactNode;
    accountName?: string;
    accountCard?: ReactNode;
    rowStatus?: Partial<Record<DashboardPage, ReactNode>>;
    signInBanner?: ReactNode;
    showQuestStatus?: boolean;
}>;

type FooterLink = {
    label: string;
    href: string;
};

// Refunds sits by the purchase on Credits, where it matters.
const footerLinks: readonly FooterLink[] = [
    { label: "Terms", href: "https://pollinations.ai/terms" },
    { label: "Privacy", href: "https://pollinations.ai/privacy" },
];

export const DashboardShell: FC<DashboardShellProps> = ({
    navItems = DASHBOARD_NAV_ITEMS,
    githubAvatarUrl,
    accountArea,
    accountName,
    accountCard,
    rowStatus,
    signInBanner,
    showQuestStatus = false,
    children,
}) => {
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const drawerRef = useRef<HTMLDivElement>(null);
    const menuButtonRef = useRef<HTMLButtonElement>(null);
    const mainScrollRef = useRef<HTMLDivElement>(null);
    const location = useRouterState({ select: (state) => state.location });
    const activeNavItem = navItemFor(
        location.pathname,
        (location.search as { view?: unknown }).view,
    );
    const activePage = activeNavItem?.id;
    const questStatus = useQuestNavStatus(showQuestStatus);

    useDashboardShellBodyClass();
    useScrollLock(isDrawerOpen);

    useEffect(() => {
        const meta = pageMeta(location.pathname);
        if (!meta) return;
        document.title = meta.title;
    }, [location.pathname]);

    const closeDrawer = useCallback(() => {
        const activeElement = document.activeElement;
        if (
            activeElement instanceof HTMLElement &&
            drawerRef.current?.contains(activeElement)
        ) {
            menuButtonRef.current?.focus({ preventScroll: true });
        }

        setIsDrawerOpen(false);
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

        if (activePage === "pollen" && location.hash === "buy-pollen") {
            const target = scrollElement.querySelector("#buy-pollen");
            if (target instanceof HTMLElement) {
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
            navItems={navItems}
            accountName={accountName}
            avatarUrl={githubAvatarUrl}
            accountCard={accountCard}
            rowStatus={rowStatus}
            accountArea={accountArea}
            questStatus={questStatus}
            onNavigate={closeDrawer}
        />
    );

    return (
        <div className="flex h-dvh overflow-hidden bg-app-bg text-theme-text-strong">
            <div className="hidden lg:block">{rail}</div>
            <div
                ref={drawerRef}
                className={cn(
                    "fixed inset-0 z-40 transition-[visibility] lg:hidden",
                    isDrawerOpen
                        ? "pointer-events-auto visible delay-0"
                        : "pointer-events-none invisible delay-[420ms]",
                )}
                aria-hidden={!isDrawerOpen}
                inert={!isDrawerOpen}
            >
                <button
                    type="button"
                    className={cn(
                        "absolute inset-0 bg-black/40 transition-opacity ease-out",
                        "duration-[420ms]",
                        isDrawerOpen ? "opacity-100" : "opacity-0",
                    )}
                    onClick={closeDrawer}
                    aria-label="Close navigation"
                />
                <div
                    className={cn(
                        "absolute inset-y-0 left-0 flex w-[clamp(14.5rem,76vw,17rem)] transform-gpu flex-col overflow-hidden bg-app-bg transition-transform ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform",
                        "duration-[420ms]",
                        isDrawerOpen ? "translate-x-0" : "-translate-x-full",
                    )}
                >
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                        {rail}
                    </div>
                </div>
            </div>
            <div className="flex min-w-0 flex-1 flex-col lg:ml-68">
                <MobileMenuButton
                    buttonRef={menuButtonRef}
                    avatarUrl={githubAvatarUrl}
                    onOpen={() => setIsDrawerOpen(true)}
                />
                <MobileCopyDocsButton />
                <ScrollArea
                    ref={mainScrollRef}
                    className={cn(
                        // The page starts on the profile row's line (the rail's py-4).
                        "min-h-0 min-w-0 flex-1 overscroll-contain px-0 pb-8 sm:px-4 lg:px-6 lg:pt-4",
                        signInBanner ? "pt-3" : "pt-16",
                    )}
                >
                    <main className="mx-auto flex max-w-[800px] flex-col gap-3">
                        {/* The open drawer has its own sign-in; the banner
                            keeps its space so the page doesn't move. */}
                        {signInBanner && (
                            <div className={isDrawerOpen ? "invisible" : ""}>
                                {signInBanner}
                            </div>
                        )}
                        {children}
                    </main>
                </ScrollArea>
            </div>
        </div>
    );
};

function useQuestNavStatus(enabled: boolean): string | null {
    const [label, setLabel] = useState<string | null>(null);

    useEffect(() => {
        if (!enabled) {
            setLabel(null);
            return;
        }

        let cancelled = false;
        let requestId = 0;
        const refresh = async () => {
            const currentRequest = ++requestId;
            try {
                const [catalogResponse, rewardsResponse] = await Promise.all([
                    apiClient.quests.catalog.$get(),
                    accountClient.quests.rewards.$get(),
                ]);
                if (!catalogResponse.ok || !rewardsResponse.ok) {
                    throw new Error("Quest status unavailable");
                }
                const [catalog, rewards] = await Promise.all([
                    catalogResponse.json(),
                    rewardsResponse.json(),
                ]);
                if (!cancelled && currentRequest === requestId) {
                    setLabel(questNavLabel(catalog.quests, rewards.rewards));
                }
            } catch {
                if (!cancelled && currentRequest === requestId) setLabel(null);
            }
        };
        const handleUpdate = () => void refresh();

        void refresh();
        window.addEventListener(QUEST_STATUS_UPDATED_EVENT, handleUpdate);
        return () => {
            cancelled = true;
            window.removeEventListener(
                QUEST_STATUS_UPDATED_EVENT,
                handleUpdate,
            );
        };
    }, [enabled]);

    return label;
}

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
    navItems: readonly DashboardNavItem[];
    accountName?: string;
    avatarUrl?: string;
    accountCard?: ReactNode;
    rowStatus?: Partial<Record<DashboardPage, ReactNode>>;
    accountArea?: ReactNode;
    questStatus: string | null;
    onNavigate: () => void;
};

const DashboardRail: FC<DashboardRailProps> = ({
    activePage,
    navItems,
    accountName,
    avatarUrl,
    accountCard,
    rowStatus,
    accountArea,
    questStatus,
    onNavigate,
}) => {
    const rows = (group: DashboardNavGroup) =>
        navItems
            .filter((item) => item.group === group)
            .map((item) => (
                <NavRow
                    key={item.id}
                    item={item}
                    active={activePage === item.id}
                    questStatus={questStatus}
                    rowStatus={rowStatus}
                    onNavigate={onNavigate}
                />
            ));
    const yours = rows("yours");
    return (
        <aside
            data-theme="neutral"
            className="flex min-h-0 flex-1 flex-col px-2 py-4 lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:w-68"
            aria-label="Dashboard navigation"
        >
            {/* You first: your name (the way to Settings), or the sign-in
            buttons. The phone's drawer closes by tapping outside it. */}
            <div className="flex shrink-0 flex-col gap-2 pb-1">
                {accountName && (
                    <AccountLink
                        name={accountName}
                        avatarUrl={avatarUrl}
                        active={activePage === "account"}
                        onNavigate={onNavigate}
                    />
                )}
                {accountArea}
            </div>
            <ScrollArea
                // A size container: the guides under Docs show by its height.
                className="-mr-2 min-h-0 flex-1 pt-3 [container-type:size]"
                style={
                    {
                        "--polli-color-scrollbar-thumb":
                            "color-mix(in oklab, var(--polli-color-text-muted) 65%, transparent)",
                    } as CSSProperties
                }
            >
                {/* Signed out, a thin line sets the sign-in buttons apart from
                the pages, as the one above the footer does. */}
                {!accountName && <hr className={cn("mb-2", NAV_LINE_CLASS)} />}
                {yours.length > 0 && (
                    <>
                        <nav
                            aria-label="Yours"
                            className="flex flex-col gap-0.5"
                        >
                            {yours}
                        </nav>
                        {accountCard}
                        <hr className={cn("my-2", NAV_LINE_CLASS)} />
                    </>
                )}
                <nav
                    aria-label="Pollinations"
                    className="flex flex-col gap-0.5"
                >
                    {rows("resources")}
                    {/* Docs leaves the dashboard: a thin line sets it apart from
                    the page rows above. */}
                    <hr className={cn("my-2", NAV_LINE_CLASS)} />
                    <DocsRow />
                    <DocGuides />
                </nav>
            </ScrollArea>
            <div className={cn("shrink-0 border-t pt-3", NAV_LINE_CLASS)}>
                <DashboardFooter />
            </div>
        </aside>
    );
};

// Signed in with a profile picture, the phone menu button shows it, so you
// see whose dashboard this is; otherwise the menu icon.
const MobileMenuButton: FC<{
    buttonRef: RefObject<HTMLButtonElement | null>;
    avatarUrl?: string;
    onOpen: () => void;
}> = ({ buttonRef, avatarUrl, onOpen }) => (
    <button
        ref={buttonRef}
        type="button"
        // Light: the near-white circle darkens on hover, like the small copy
        // fields; dark already shows it by turning opaque.
        className="fixed left-3 top-3 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-surface-menu/80 text-theme-text-strong backdrop-blur-md hover:bg-theme-text-muted/12 [.dark_&]:hover:bg-surface-menu lg:hidden"
        onClick={onOpen}
        aria-label="Open navigation"
    >
        {avatarUrl ? (
            <img
                src={avatarUrl}
                alt=""
                className="h-8 w-8 rounded-full object-cover"
            />
        ) : (
            <MenuIcon className="h-5 w-5" />
        )}
    </button>
);

/** "49 claimable" → "49"; nothing for other quest statuses. */
const claimableCount = (status: string | null) =>
    status?.match(/^(\d+) claimable/)?.[1] ?? null;

const NavRow: FC<{
    item: DashboardNavItem;
    active: boolean;
    questStatus: string | null;
    rowStatus?: Partial<Record<DashboardPage, ReactNode>>;
    onNavigate: () => void;
}> = ({ item, active, questStatus, rowStatus, onNavigate }) => (
    <NavItem
        as={Link}
        to={item.to}
        // Agents and MCP share /agents and differ by `view`; Link can't type a
        // search across a union of routes, so it is passed untyped. An exact
        // `view` match keeps Agents from also counting as current on MCP.
        search={item.search as never}
        activeOptions={{ explicitUndefined: true }}
        data-theme="accent"
        icon={item.icon}
        active={active}
        onClick={onNavigate}
    >
        {item.label}
        {/* Quests waiting to be claimed: their count in the "New!" badge
            style, right by the label. */}
        {item.id === "quests" && claimableCount(questStatus) && (
            <Chip intent="news" size="sm" title={questStatus ?? undefined}>
                {claimableCount(questStatus)}
                <span className="sr-only"> claimable</span>
            </Chip>
        )}
        {rowStatus?.[item.id]}
    </NavItem>
);

// Docs opens the docs site, so it is drawn as a link, not a page row: same
// icon and spacing as the rows, link text with ↗ instead of the row's pill.
// The quiet icon copies all of it as plain text for an AI chat.
const DocsRow: FC = () => (
    <div className="flex items-center">
        <span className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-sm">
            <BookIcon className="h-4 w-4 shrink-0 text-ink-800" />
            <InlineLink href={genDocsUrl()}>Docs</InlineLink>
        </span>
        <CopyButton
            value={async () => {
                const res = await fetch(`${genDocsUrl()}/llm.txt`);
                return res.text();
            }}
            copiedTimeoutMs={1500}
            data-theme="accent"
            tooltip="Copy all docs as text"
            aria-label="Copy all docs as text"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-theme-text-muted transition-colors hover:bg-theme-bg-active/40 hover:text-theme-text-strong"
        >
            {(copied) => <CopyStateIcon copied={copied} className="h-4 w-4" />}
        </CopyButton>
    </div>
);

// A few guides straight under Docs. Each line shows only while the drawer has
// room for it above your section, so the guides never make it scroll.
const DOC_GUIDES = [
    {
        label: "Quick start",
        tag: "quick-start",
        icon: RocketIcon,
        show: "[@container(min-height:14.8125rem)]:flex",
    },
    {
        label: "Pollinations Pay",
        tag: "pollinations-pay",
        icon: WalletIcon,
        show: "[@container(min-height:16.0625rem)]:flex",
    },
    {
        label: "Publish an agent",
        tag: "publish-an-agent",
        icon: BotIcon,
        show: "[@container(min-height:17.3125rem)]:flex",
    },
    {
        label: "Publish a model",
        tag: "publish-a-model",
        icon: BeakerIcon,
        show: "[@container(min-height:18.5625rem)]:flex",
    },
    // The catalog's order: Sandboxes, then MCP.
    {
        label: "Sandboxes",
        tag: "sandboxes",
        icon: TerminalIcon,
        show: "[@container(min-height:19.8125rem)]:flex",
    },
    {
        label: "MCP servers",
        tag: "mcp-servers",
        icon: McpIcon,
        show: "[@container(min-height:21.0625rem)]:flex",
    },
] as const;

const DocGuides: FC = () => (
    // Indented under Docs, lined up with its label.
    <div
        className={cn(
            "mb-1 ml-5 hidden flex-col gap-1 border-l py-1 pr-3 pl-[15px] text-xs [@container(min-height:14.8125rem)]:flex",
            NAV_LINE_CLASS,
        )}
    >
        {DOC_GUIDES.map(({ label, tag, icon: Icon, show }) => (
            <a
                key={tag}
                href={genDocsUrl(`#tag/${tag}`)}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                    "hidden items-center gap-2 text-theme-text-muted transition-colors hover:text-theme-text-strong",
                    show,
                )}
            >
                <span className="flex w-4 justify-center">
                    <Icon className="h-3.5 w-3.5" />
                </span>
                {label}
            </a>
        ))}
    </div>
);

// One line signs off the rail: the logo, the small print, the colour toggle.
const DashboardFooter: FC = () => (
    <div className="flex items-center gap-3 pl-1">
        <a
            href="https://pollinations.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="flex shrink-0 text-theme-text-strong"
            aria-label="Pollinations"
        >
            <BrandMark variant="mark" className="h-6 w-6" />
        </a>
        <nav
            aria-label="Legal"
            className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px] leading-none text-theme-text-muted"
        >
            {footerLinks.map((link, index) => (
                <Fragment key={link.href}>
                    {index > 0 && <span aria-hidden="true">·</span>}
                    <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="transition-colors hover:text-theme-text-strong"
                    >
                        {link.label}
                    </a>
                </Fragment>
            ))}
        </nav>
        {/* accent on the toggle's active icon, over the neutral rail */}
        {/* flex, not inline: no text line, so no descender space below */}
        <span data-theme="accent" className="flex shrink-0">
            <ColorModeToggle />
        </span>
    </div>
);

// Who is signed in, at the top of the rail, and the way to Settings (profile,
// connections, sign out). A button rather than a row: the quiet surface pill when Settings isn't
// open, the accent fill when it is.
const AccountLink: FC<{
    name: string;
    avatarUrl?: string;
    active: boolean;
    onNavigate: () => void;
}> = ({ name, avatarUrl, active, onNavigate }) => (
    <Button
        as={Link}
        to="/account"
        data-theme="accent"
        intent={active ? undefined : "surface"}
        aria-current={active ? "page" : undefined}
        onClick={onNavigate}
        className="w-full self-stretch justify-start gap-2 py-1.5 pr-3 pl-1.5"
    >
        {avatarUrl ? (
            <img
                src={avatarUrl}
                alt=""
                className="h-8 w-8 shrink-0 rounded-full object-cover"
            />
        ) : (
            <AccountIcon className="h-4 w-4 shrink-0" />
        )}
        <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate">{name}</span>
            <span className="text-xs font-normal">Settings</span>
        </span>
        <ChevronIcon className="ml-auto -rotate-90 opacity-60" />
    </Button>
);
