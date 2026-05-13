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
import { cn } from "@/util.ts";
import { genDocsUrl } from "../../config.ts";
import { useScrollLock } from "../../hooks/use-scroll-lock.ts";
import {
    DASHBOARD_NAV_ITEMS,
    type DashboardPage,
    dashboardThemeByPage,
    dashboardThemeClasses,
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
    const mainScrollRef = useRef<HTMLElement>(null);

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
                                <svg
                                    viewBox="0 0 24 24"
                                    className="h-5 w-5"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    aria-hidden="true"
                                >
                                    <path
                                        d="M18 6 6 18M6 6l12 12"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                </svg>
                            </button>
                        </div>
                        <BrandSocialChips />
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
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
                <main
                    ref={mainScrollRef}
                    className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-8 pt-6 md:px-6 md:pt-10"
                >
                    <div className="mx-auto flex max-w-[800px] flex-col gap-6">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
};

function useDashboardBodyClass(): void {
    useEffect(() => {
        document.documentElement.classList.add("dashboard-shell");
        document.body.classList.add("dashboard-shell");
        return () => {
            document.documentElement.classList.remove("dashboard-shell");
            document.body.classList.remove("dashboard-shell");
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
    return (
        <aside
            className="flex h-full min-h-0 flex-col gap-1 px-2 py-4 md:fixed md:inset-y-0 md:left-0 md:z-30 md:w-60 md:border-r md:border-green-950/10"
            aria-label="Dashboard navigation"
        >
            <div className="hidden flex-col gap-2 border-b border-green-950/10 pb-4 pl-1 md:flex">
                <Brand imageClassName="h-6" />
                <BrandSocialChips />
            </div>
            <nav className="flex flex-col gap-1 pt-3">
                {navItems.map((item) => (
                    <NavButton
                        key={item.id}
                        item={item}
                        active={activePage === item.id}
                        onClick={() => onPageChange(item.id)}
                    />
                ))}
                <div className="mt-2 border-t border-green-950/10 pt-3">
                    <a
                        href={genDocsUrl()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-2 rounded-full px-3 py-2 text-left text-[15px] font-medium text-gray-900 transition-colors hover:bg-white/60 hover:text-gray-950"
                    >
                        <span>API Reference</span>
                        <svg
                            viewBox="0 0 24 24"
                            className="h-4 w-4 shrink-0 text-gray-500"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            aria-hidden="true"
                        >
                            <path
                                d="M7 17 17 7M9 7h8v8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </a>
                </div>
            </nav>
            <div className="mt-auto flex flex-col gap-2 border-t border-green-950/10 pt-4">
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
                <div className="flex flex-wrap gap-x-2 gap-y-1 px-3 text-[11px] leading-snug text-green-950/55">
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
                <div className="px-3 text-[11px] leading-none text-green-950/45">
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
            className={cn(
                "flex items-center gap-2 rounded-full px-3 py-2 text-left text-[15px] font-medium transition-colors",
                active
                    ? dashboardThemeClasses[item.theme].active
                    : "text-gray-800 hover:bg-white/60 hover:text-gray-950",
            )}
            onClick={onClick}
            aria-current={active ? "page" : undefined}
        >
            <span
                className={cn(
                    "h-2.5 w-2.5 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]",
                    dashboardThemeClasses[item.theme].dot,
                )}
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
                <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                >
                    <path
                        d="M4 7h16M4 12h16M4 17h16"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
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
            icon={<GitHubIcon />}
            text="github"
            count="4.4k"
        />
        <BrandChip
            href="https://discord.gg/pollinations-ai-885844321461485618"
            label="Discord community"
            icon={<DiscordIcon />}
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
        className="inline-flex items-center gap-1.5 rounded-full border border-transparent bg-white/55 py-[3px] pl-[7px] pr-[10px] text-[11px] font-medium leading-none text-green-950/80 transition-colors hover:border-green-950/15 hover:bg-white hover:text-green-950"
    >
        <span className="h-[11px] w-[11px]">{icon}</span>
        <span>{text}</span>
        {count && (
            <span className="ml-0.5 border-l border-green-950/15 pl-1.5 font-mono text-[10px] text-green-950/55">
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
            icon={<DiscordIcon />}
            ariaLabel="#pollen-beta Discord channel"
        />
        <AccountIconLink
            href="https://github.com/pollinations/pollinations/issues"
            label="Report an issue"
            icon={<GitHubIcon />}
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
        className="flex items-center justify-start gap-2 rounded-md px-3 py-2 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-300 focus:outline-none focus-visible:bg-amber-300"
    >
        <span className="h-4 w-4 shrink-0" aria-hidden="true">
            {icon}
        </span>
        <span>{label}</span>
    </a>
);

const DiscordIcon: FC = () => (
    <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden="true">
        <path
            fill="currentColor"
            d="M20.32 4.37A19.8 19.8 0 0 0 15.36 2.83a.07.07 0 0 0-.08.04c-.21.38-.45.88-.62 1.27a18.27 18.27 0 0 0-5.52 0 12.84 12.84 0 0 0-.63-1.27.08.08 0 0 0-.08-.04A19.74 19.74 0 0 0 3.47 4.37a.07.07 0 0 0-.03.03C.31 9.07-.55 13.61-.13 18.1a.08.08 0 0 0 .03.06 19.9 19.9 0 0 0 6.08 3.07.08.08 0 0 0 .09-.03c.47-.64.88-1.31 1.24-2.02a.08.08 0 0 0-.04-.1 13.08 13.08 0 0 1-1.9-.91.08.08 0 0 1-.01-.13c.13-.1.25-.2.37-.29a.07.07 0 0 1 .08-.01 14.24 14.24 0 0 0 12.38 0 .07.07 0 0 1 .08.01c.12.1.25.2.38.3a.08.08 0 0 1-.01.12 12.22 12.22 0 0 1-1.9.9.08.08 0 0 0-.04.11c.36.7.77 1.38 1.23 2.02a.08.08 0 0 0 .1.03 19.84 19.84 0 0 0 6.08-3.07.08.08 0 0 0 .03-.05c.5-5.2-.84-9.7-3.77-13.71a.06.06 0 0 0-.03-.03ZM8.02 15.37c-1.18 0-2.16-1.08-2.16-2.4 0-1.32.96-2.4 2.16-2.4 1.2 0 2.18 1.09 2.16 2.4 0 1.32-.96 2.4-2.16 2.4Zm7.96 0c-1.18 0-2.16-1.08-2.16-2.4 0-1.32.96-2.4 2.16-2.4 1.2 0 2.18 1.09 2.16 2.4 0 1.32-.95 2.4-2.16 2.4Z"
        />
    </svg>
);

const GitHubIcon: FC = () => (
    <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden="true">
        <path
            fill="currentColor"
            d="M12 .5A11.5 11.5 0 0 0 8.36 22.9c.58.11.79-.25.79-.56v-2.16c-3.21.7-3.89-1.38-3.89-1.38-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.04 1.76 2.71 1.25 3.37.96.11-.75.4-1.25.74-1.54-2.56-.29-5.26-1.28-5.26-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.06 0 0 .97-.31 3.16 1.18a10.88 10.88 0 0 1 5.76 0c2.19-1.49 3.15-1.18 3.15-1.18.63 1.6.23 2.77.11 3.06.74.81 1.19 1.84 1.19 3.1 0 4.43-2.7 5.4-5.27 5.69.41.36.78 1.06.78 2.14v3.19c0 .31.21.68.8.56A11.5 11.5 0 0 0 12 .5Z"
        />
    </svg>
);
