import {
    BookIcon,
    CheckIcon,
    ClipboardIcon,
    cn,
    DiscordIcon,
    ExternalLinkIcon,
    GenApiIcon,
    GitHubIcon,
    McpIcon,
    MenuIcon,
    ScrollArea,
    TerminalIcon,
    useScrollLock,
    WalletIcon,
    XIcon,
} from "@pollinations_ai/ui";
import {
    type FC,
    type PropsWithChildren,
    type ReactNode,
    type RefObject,
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";
import { genDocsUrl } from "../../config.ts";
import {
    DASHBOARD_NAV_ITEMS,
    type DashboardPage,
    dashboardThemeByPage,
} from "./dashboard-theme.ts";
import { User } from "./user.tsx";

export type { DashboardPage } from "./dashboard-theme.ts";

type DashboardShellProps = PropsWithChildren<{
    activePage: DashboardPage;
    navItems?: typeof DASHBOARD_NAV_ITEMS;
    githubUsername?: string;
    githubAvatarUrl?: string;
    onPageChange: (page: DashboardPage) => void;
    onSignOut?: () => void;
    accountArea?: ReactNode;
    walletArea?: ReactNode;
}>;

export const DashboardShell: FC<DashboardShellProps> = ({
    activePage,
    navItems = DASHBOARD_NAV_ITEMS,
    githubUsername,
    githubAvatarUrl,
    onPageChange,
    onSignOut,
    accountArea,
    walletArea,
    children,
}) => {
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const drawerRef = useRef<HTMLDivElement>(null);
    const menuButtonRef = useRef<HTMLButtonElement>(null);
    const mainScrollRef = useRef<HTMLDivElement>(null);

    useDashboardBodyClass();
    useScrollLock(isDrawerOpen);

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

        if (activePage === "pollen" && window.location.hash === "#buy-pollen") {
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
    }, [activePage]);

    function handlePageChange(page: DashboardPage): void {
        onPageChange(page);
        closeDrawer();
    }

    const rail = (
        <DashboardRail
            activePage={activePage}
            navItems={navItems}
            githubUsername={githubUsername}
            githubAvatarUrl={githubAvatarUrl}
            onPageChange={handlePageChange}
            onSignOut={onSignOut}
            accountArea={accountArea}
            walletArea={walletArea}
        />
    );

    return (
        <div className="flex h-dvh overflow-hidden bg-emerald-100 text-green-950">
            <div className="hidden md:block">{rail}</div>
            <div
                ref={drawerRef}
                className={cn(
                    "fixed inset-0 z-40 transition-[visibility] md:hidden",
                    isDrawerOpen
                        ? "visible pointer-events-auto delay-0"
                        : "invisible pointer-events-none delay-[420ms]",
                )}
                aria-hidden={!isDrawerOpen}
                inert={!isDrawerOpen}
            >
                <button
                    type="button"
                    className={cn(
                        "absolute inset-0 bg-green-950/25 transition-opacity ease-out",
                        "duration-[420ms]",
                        isDrawerOpen ? "opacity-100" : "opacity-0",
                    )}
                    onClick={closeDrawer}
                    aria-label="Close navigation"
                />
                <div
                    className={cn(
                        "absolute inset-y-0 left-0 flex w-[min(20rem,86vw)] transform-gpu flex-col overflow-hidden border-r border-green-950/10 bg-emerald-100 shadow-xl transition-transform ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform",
                        "duration-[420ms]",
                        isDrawerOpen ? "translate-x-0" : "-translate-x-full",
                    )}
                >
                    <div className="flex shrink-0 flex-col gap-2 border-b border-green-950/10 px-4 py-3">
                        <div className="flex items-center justify-between gap-2">
                            <Brand imageClassName="h-6 min-[390px]:h-7 sm:h-8" />
                            <button
                                type="button"
                                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/70 text-green-950 hover:bg-white"
                                onClick={closeDrawer}
                                aria-label="Close navigation"
                            >
                                <XIcon className="h-5 w-5" />
                            </button>
                        </div>
                        <BrandSocialChips />
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                        {rail}
                    </div>
                </div>
            </div>
            <div
                className="flex min-w-0 flex-1 flex-col md:ml-60"
                data-theme={dashboardThemeByPage[activePage]}
            >
                <MobileHeader
                    buttonRef={menuButtonRef}
                    onOpen={() => setIsDrawerOpen(true)}
                />
                <ScrollArea
                    ref={mainScrollRef}
                    className="min-h-0 min-w-0 flex-1 overscroll-contain px-4 pb-8 pt-6 md:px-6 md:pt-10"
                >
                    <main className="mx-auto flex max-w-[800px] flex-col gap-6">
                        {children}
                    </main>
                </ScrollArea>
            </div>
        </div>
    );
};

function useDashboardBodyClass(): void {
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
    activePage: DashboardPage;
    navItems: typeof DASHBOARD_NAV_ITEMS;
    githubUsername?: string;
    githubAvatarUrl?: string;
    onPageChange: (page: DashboardPage) => void;
    onSignOut?: () => void;
    accountArea?: ReactNode;
    walletArea?: ReactNode;
};

const DashboardRail: FC<DashboardRailProps> = ({
    activePage,
    navItems,
    githubUsername,
    githubAvatarUrl,
    onPageChange,
    onSignOut,
    accountArea,
    walletArea,
}) => {
    const [docsCopied, setDocsCopied] = useState(false);
    const handleCopyDocs = useCallback(async () => {
        const res = await fetch(`${genDocsUrl()}/llm.txt`);
        const text = await res.text();
        await navigator.clipboard.writeText(text);
        setDocsCopied(true);
        setTimeout(() => setDocsCopied(false), 1200);
    }, []);
    return (
        <aside
            className="flex min-h-0 flex-1 flex-col px-2 py-4 md:fixed md:inset-y-0 md:left-0 md:z-30 md:w-60 md:border-r md:border-green-950/10"
            aria-label="Dashboard navigation"
        >
            <div className="hidden shrink-0 flex-col gap-2 border-b border-green-950/10 pb-4 pl-1 md:flex">
                <Brand imageClassName="h-6" />
                <BrandSocialChips />
            </div>
            <ScrollArea
                className="-mr-2 min-h-0 flex-1 pt-3"
                style={
                    {
                        "--polli-color-scrollbar-thumb":
                            "oklch(from var(--color-gray-400) l c h / 0.65)",
                    } as React.CSSProperties
                }
            >
                <nav className="flex flex-col gap-1 pr-2">
                    {navItems.map((item) => (
                        <NavButton
                            key={item.id}
                            item={item}
                            active={activePage === item.id}
                            onClick={() => onPageChange(item.id)}
                        />
                    ))}
                    <div className="mt-2 border-t border-green-950/10 pt-3">
                        <button
                            type="button"
                            onClick={handleCopyDocs}
                            title="Copy full docs for LLMs"
                            className="group flex w-full items-center justify-between gap-2 rounded-full px-3 py-2 text-left text-sm font-medium text-gray-900 transition-colors hover:bg-white/60 hover:text-gray-950"
                        >
                            <span className="flex items-center gap-2">
                                <BookIcon className="h-4 w-4 shrink-0 text-gray-500" />
                                Docs
                            </span>
                            {docsCopied ? (
                                <CheckIcon className="h-4 w-4 shrink-0 text-green-700" />
                            ) : (
                                <ClipboardIcon className="h-4 w-4 shrink-0 text-gray-400 transition-colors group-hover:text-gray-600" />
                            )}
                        </button>
                        <div className="ml-3.5 mt-0.5 flex flex-col gap-0.5 border-l border-green-950/10 pl-2">
                            <DocLinkRow
                                label="API"
                                href={`${genDocsUrl()}`}
                                icon={
                                    <GenApiIcon className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                                }
                            />
                            <DocLinkRow
                                label="BYOP"
                                href={`${genDocsUrl()}#tag/byop`}
                                icon={
                                    <WalletIcon className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                                }
                            />
                            <DocLinkRow
                                label="CLI"
                                href={`${genDocsUrl()}#tag/cli`}
                                icon={
                                    <TerminalIcon className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                                }
                            />
                            <DocLinkRow
                                label="MCP Server"
                                href={`${genDocsUrl()}#tag/mcp-server`}
                                icon={
                                    <McpIcon className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                                }
                            />
                        </div>
                    </div>
                </nav>
            </ScrollArea>
            <div className="shrink-0 flex flex-col gap-2 border-t border-green-950/10 pt-4">
                {walletArea && <div className="px-1">{walletArea}</div>}
                {accountArea ??
                    (githubUsername && onSignOut ? (
                        <User
                            githubUsername={githubUsername}
                            githubAvatarUrl={githubAvatarUrl ?? ""}
                            onSignOut={onSignOut}
                            className="w-full justify-start"
                            menuItems={<AccountMenuLinks />}
                        />
                    ) : null)}
                <div className="flex flex-wrap gap-x-2 gap-y-1 px-3 text-xs leading-snug text-green-950/55">
                    <a
                        href="https://pollinations.ai/terms"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="transition-colors hover:text-green-950"
                    >
                        Terms
                    </a>
                    <a
                        href="https://pollinations.ai/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="transition-colors hover:text-green-950"
                    >
                        Privacy
                    </a>
                    <a
                        href="https://pollinations.ai/refunds"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="transition-colors hover:text-green-950"
                    >
                        Refunds
                    </a>
                </div>
                <div className="px-3 text-xs leading-none text-green-950/45">
                    © 2026 Myceli.AI
                </div>
            </div>
        </aside>
    );
};

type NavButtonProps = {
    item: (typeof DASHBOARD_NAV_ITEMS)[number];
    active: boolean;
    onClick: () => void;
};

const NavButton: FC<NavButtonProps> = ({ item, active, onClick }) => {
    return (
        <button
            type="button"
            data-theme={item.theme}
            className={cn(
                "flex items-center gap-2 rounded-full px-3 py-2 text-left text-sm font-medium transition-colors",
                active
                    ? "bg-theme-bg-active text-theme-text-strong"
                    : "text-gray-800 hover:bg-white/60 hover:text-gray-950",
            )}
            onClick={onClick}
            aria-current={active ? "page" : undefined}
        >
            <span
                className="h-2.5 w-2.5 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)] bg-theme-bg-hover"
                aria-hidden="true"
            />
            {item.label}
        </button>
    );
};

const MobileHeader: FC<{
    buttonRef: RefObject<HTMLButtonElement | null>;
    onOpen: () => void;
}> = ({ buttonRef, onOpen }) => {
    return (
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-green-950/10 bg-emerald-100 px-4 py-3 md:hidden">
            <button
                ref={buttonRef}
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/70 text-green-950 hover:bg-white"
                onClick={onOpen}
                aria-label="Open navigation"
            >
                <MenuIcon className="h-5 w-5" />
            </button>
            <Brand imageClassName="h-6 min-[390px]:h-7 sm:h-8" />
            <span className="h-9 w-9" aria-hidden="true" />
        </header>
    );
};

const Brand: FC<{ imageClassName?: string }> = ({ imageClassName }) => (
    <a
        href="https://pollinations.ai"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center"
    >
        <img
            src="/logo_text_black.svg"
            alt="pollinations.ai"
            className={cn("h-10 w-auto", imageClassName)}
        />
    </a>
);

const BrandSocialChips: FC = () => (
    <div className="flex items-center gap-1.5">
        <BrandChip
            href="https://github.com/pollinations/pollinations"
            label="Pollinations on GitHub"
            icon={<GitHubIcon className="h-full w-full" />}
            text="github"
            count="4.4k"
        />
        <BrandChip
            href="https://discord.gg/pollinations-ai-885844321461485618"
            label="Discord community"
            icon={<DiscordIcon className="h-full w-full" />}
            text="discord"
            count="18k"
        />
    </div>
);

const BrandChip: FC<{
    href: string;
    label: string;
    icon: ReactNode;
    text: string;
    count?: string;
}> = ({ href, label, icon, text, count }) => (
    <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        className="inline-flex items-center gap-1.5 rounded-full border border-transparent bg-white/55 py-[3px] pl-[7px] pr-[10px] text-micro font-medium leading-none text-green-950/80 transition-colors hover:border-green-950/15 hover:bg-white hover:text-green-950"
    >
        <span className="h-[11px] w-[11px]">{icon}</span>
        <span className="-translate-y-px">{text}</span>
        {count && (
            <span className="ml-0.5 border-l border-green-950/15 pl-1.5 font-mono text-micro text-green-950/55">
                {count}
            </span>
        )}
    </a>
);

const AccountMenuLinks: FC = () => (
    <div className="flex flex-col gap-1">
        <AccountIconLink
            href="https://discord.com/channels/885844321461485618/1432378056126894343"
            label="#pollen-beta"
            icon={<DiscordIcon className="h-full w-full" />}
            ariaLabel="#pollen-beta Discord channel"
        />
        <AccountIconLink
            href="https://github.com/pollinations/pollinations/issues"
            label="Report an issue"
            icon={<GitHubIcon className="h-full w-full" />}
            ariaLabel="Report an issue on GitHub"
        />
    </div>
);

const AccountIconLink: FC<{
    href: string;
    label: string;
    icon: ReactNode;
    ariaLabel?: string;
}> = ({ href, label, icon, ariaLabel }) => (
    <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={ariaLabel ?? label}
        className="flex items-center justify-start gap-2 rounded-lg px-3 py-2 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-300 focus:outline-none focus-visible:bg-amber-300"
    >
        <span className="h-4 w-4 shrink-0" aria-hidden="true">
            {icon}
        </span>
        <span>{label}</span>
    </a>
);

type DocLinkRowProps = {
    label: string;
    href: string;
    icon: ReactNode;
};

const DocLinkRow: FC<DocLinkRowProps> = ({ label, href, icon }) => (
    <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-center justify-between gap-2 rounded-full px-3 py-1.5 text-left text-xs font-medium text-gray-700 transition-colors hover:bg-white/60 hover:text-gray-950"
    >
        <span className="flex items-center gap-2">
            {icon}
            {label}
        </span>
        <ExternalLinkIcon className="h-3.5 w-3.5 shrink-0 text-gray-400 transition-colors group-hover:text-gray-600" />
    </a>
);
