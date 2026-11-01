import {
    AccountIcon,
    BeakerIcon,
    BookIcon,
    BotIcon,
    BrandMark,
    Button,
    CheckIcon,
    ChevronIcon,
    ClipboardIcon,
    ColorModeToggle,
    CopyButton,
    cn,
    InlineLink,
    LoadingStatus,
    MenuIcon,
    NavItem,
    RocketIcon,
    ScrollArea,
    useScrollLock,
    WalletIcon,
    XIcon,
} from "@pollinations/ui";
import { Link, useRouterState } from "@tanstack/react-router";
import type {
    ComponentType,
    CSSProperties,
    Dispatch,
    FC,
    PropsWithChildren,
    ReactNode,
    RefObject,
    SetStateAction,
} from "react";
import { createContext, useCallback, useEffect, useRef, useState } from "react";
import { accountClient, apiClient } from "../../api.ts";
import { genDocsUrl } from "../../config.ts";
import { pageMeta } from "../../page-meta.ts";
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

/** Counts what the page still waits for; the shell shows one status while > 0. */
export const PendingCount = createContext<Dispatch<SetStateAction<number>>>(
    () => {},
);

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
// Docs), and everything about you as one block at the bottom: Credits and
// Quests with their balances, what you build (My Listings, Keys, Sandboxes),
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
    showFooterLinks?: boolean;
    showQuestStatus?: boolean;
}>;

type FooterLink = {
    label: string;
    href: string;
};

const footerLinks: readonly FooterLink[] = [
    { label: "Terms", href: "https://pollinations.ai/terms" },
    { label: "Privacy", href: "https://pollinations.ai/privacy" },
    { label: "Refunds", href: "https://pollinations.ai/refunds" },
];

export const DashboardShell: FC<DashboardShellProps> = ({
    navItems = DASHBOARD_NAV_ITEMS,
    githubAvatarUrl,
    accountArea,
    accountName,
    accountCard,
    rowStatus,
    signInBanner,
    showFooterLinks = true,
    showQuestStatus = false,
    children,
}) => {
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [pendingCount, setPendingCount] = useState(0);
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
            showFooterLinks={showFooterLinks}
            onNavigate={closeDrawer}
        />
    );

    return (
        <PendingCount.Provider value={setPendingCount}>
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
                            isDrawerOpen
                                ? "translate-x-0"
                                : "-translate-x-full",
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
                    {/* One status for everything the page waits for, floating at
                    the bottom centre of the content column. */}
                    {pendingCount > 0 && (
                        <div className="fixed bottom-6 left-1/2 z-30 flex h-10 -translate-x-1/2 items-center rounded-full bg-surface-menu/80 px-4 backdrop-blur-md lg:left-[calc(50%+8.5rem)] lg:h-8 lg:px-3">
                            <LoadingStatus>Loading…</LoadingStatus>
                        </div>
                    )}
                    <ScrollArea
                        ref={mainScrollRef}
                        className={cn(
                            "min-h-0 min-w-0 flex-1 overscroll-contain px-0 pb-8 sm:px-4 lg:px-6 lg:pt-10",
                            signInBanner ? "pt-3" : "pt-16",
                        )}
                    >
                        <main className="mx-auto flex max-w-[800px] flex-col gap-3">
                            {signInBanner}
                            {children}
                        </main>
                    </ScrollArea>
                </div>
            </div>
        </PendingCount.Provider>
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
                    setLabel(
                        questNavLabel(
                            catalog.quests,
                            rewards.rewards,
                            rewards.setupHold !== null,
                        ),
                    );
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
    showFooterLinks: boolean;
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
    showFooterLinks,
    onNavigate,
}) => (
    <aside
        data-theme="neutral"
        className="flex min-h-0 flex-1 flex-col px-2 py-4 lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:w-68"
        aria-label="Dashboard navigation"
    >
        <BrandHeader onClose={onNavigate} />
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
            <nav aria-label="Pollinations" className="flex flex-col gap-0.5">
                {navItems
                    .filter((item) => item.group === "resources")
                    .map((item) => (
                        <NavRow
                            key={item.id}
                            item={item}
                            active={activePage === item.id}
                            questStatus={questStatus}
                            rowStatus={rowStatus}
                            onNavigate={onNavigate}
                        />
                    ))}
                {/* Docs leaves the dashboard: a thin line sets it apart from
                    the page rows above. */}
                <hr className={cn("my-2", NAV_LINE_CLASS)} />
                <DocsRow />
                <DocGuides />
            </nav>
        </ScrollArea>
        <div
            className={cn(
                "flex shrink-0 flex-col gap-2 border-t pt-3",
                NAV_LINE_CLASS,
            )}
        >
            {navItems.some((item) => item.group === "yours") && (
                <nav aria-label="Yours" className="flex flex-col gap-0.5">
                    {navItems
                        .filter((item) => item.group === "yours")
                        .map((item) => (
                            <NavRow
                                key={item.id}
                                item={item}
                                active={activePage === item.id}
                                questStatus={questStatus}
                                rowStatus={rowStatus}
                                onNavigate={onNavigate}
                            />
                        ))}
                </nav>
            )}
            {accountName && (
                <AccountLink
                    name={accountName}
                    avatarUrl={avatarUrl}
                    active={activePage === "account"}
                    onNavigate={onNavigate}
                />
            )}
            {accountCard}
            {accountArea}
            <DashboardFooter links={showFooterLinks ? footerLinks : []} />
        </div>
    </aside>
);

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
        className="fixed left-3 top-3 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-surface-menu/80 text-theme-text-strong backdrop-blur-md hover:bg-surface-menu lg:hidden"
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
        {/* Something to claim or a new quest: a dot by the label, the
            count on hover. */}
        {item.id === "quests" && questStatus && (
            <span
                title={questStatus}
                className="-ml-1 self-start pt-1 text-theme-text-soft"
            >
                <span className="block h-1.5 w-1.5 rounded-full bg-current" />
                <span className="sr-only">{questStatus}</span>
            </span>
        )}
        {rowStatus?.[item.id]}
    </NavItem>
);

// The lotus above a line; on phones the row also holds the drawer's close
// button.
const BrandHeader: FC<{ onClose: () => void }> = ({ onClose }) => (
    <div
        className={cn(
            "flex shrink-0 items-center justify-between gap-2 border-b pb-3 pl-1",
            NAV_LINE_CLASS,
        )}
    >
        <a
            href="https://pollinations.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="flex shrink-0 text-current"
            aria-label="Pollinations"
        >
            <span className="sr-only">Pollinations</span>
            <BrandMark variant="mark" className="h-7 w-7" />
        </a>
        <button
            type="button"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-opaque/70 text-theme-text-strong hover:bg-surface-opaque lg:hidden"
            onClick={onClose}
            aria-label="Close navigation"
        >
            <XIcon className="h-5 w-5" />
        </button>
    </div>
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
            {(copied) =>
                copied ? (
                    <CheckIcon className="h-4 w-4" />
                ) : (
                    <ClipboardIcon className="h-4 w-4" />
                )
            }
        </CopyButton>
    </div>
);

// A few guides straight under Docs. Each line shows only while the drawer has
// room for it above your section, so the guides never make it scroll.
const DOC_GUIDES = [
    {
        label: "Quick Start",
        tag: "quick-start",
        icon: RocketIcon,
        show: "[@container(min-height:14.8125rem)]:flex",
    },
    {
        label: "Connect User Wallets",
        tag: "connect-user-wallets",
        icon: WalletIcon,
        show: "[@container(min-height:16.0625rem)]:flex",
    },
    {
        label: "Publish an Agent",
        tag: "publish-an-agent",
        icon: BotIcon,
        show: "[@container(min-height:17.3125rem)]:flex",
    },
    {
        label: "Publish a Model",
        tag: "publish-a-model",
        icon: BeakerIcon,
        show: "[@container(min-height:18.5625rem)]:flex",
    },
] as const;

const DocGuides: FC = () => (
    <SubLines className="hidden flex-col gap-1 text-xs [@container(min-height:14.8125rem)]:flex">
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
    </SubLines>
);

const DashboardFooter: FC<{
    links: readonly FooterLink[];
}> = ({ links }) => (
    <div className="flex items-end justify-between gap-2 pl-3 text-xs leading-none text-theme-text-muted">
        {links.length > 0 && (
            <div className="flex flex-wrap gap-x-2 gap-y-1 leading-snug">
                {links.map((link) => (
                    <a
                        key={link.href}
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="transition-colors hover:text-theme-text-strong"
                    >
                        {link.label}
                    </a>
                ))}
            </div>
        )}
        {/* accent on the toggle's active icon, over the neutral rail */}
        <span data-theme="accent" className="ml-auto shrink-0">
            <ColorModeToggle />
        </span>
    </div>
);

// Who is signed in, under the cards, and the way to Settings (profile,
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

// Lines indented under a row, lined up with its label: the guides under Docs.
const SubLines: FC<PropsWithChildren<{ className?: string }>> = ({
    className,
    children,
}) => (
    <div
        className={cn(
            "mb-1 ml-5 border-l py-1 pr-3 pl-[15px]",
            NAV_LINE_CLASS,
            className,
        )}
    >
        {children}
    </div>
);
