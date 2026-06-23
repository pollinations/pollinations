import {
    BookIcon,
    CheckIcon,
    ChevronIcon,
    ClipboardIcon,
    ColorModeToggle,
    CopyButton,
    cn,
    DiscordIcon,
    Dropdown,
    ExternalLinkIcon,
    GenApiIcon,
    GitHubIcon,
    McpIcon,
    MenuIcon,
    NavItem,
    ScrollArea,
    TerminalIcon,
    useScrollLock,
    WalletIcon,
    XIcon,
} from "@pollinations/ui";
import logoWordmarkUrl from "@pollinations/ui/assets/logo-wordmark.svg";
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
import { DASHBOARD_NAV_ITEMS, type DashboardPage } from "./dashboard-theme.ts";

export type { DashboardPage } from "./dashboard-theme.ts";

type DashboardNavItem = {
    id: DashboardPage;
    label: string;
    icon: ComponentType<{ className?: string }>;
};

const brandWordmarkMask: CSSProperties = {
    WebkitMask: `url(${logoWordmarkUrl}) center / contain no-repeat`,
    mask: `url(${logoWordmarkUrl}) center / contain no-repeat`,
};

type DashboardShellProps = PropsWithChildren<{
    activePage: DashboardPage;
    navItems?: readonly DashboardNavItem[];
    githubUsername?: string;
    githubAvatarUrl?: string;
    onPageChange: (page: DashboardPage) => void;
    onSignOut?: () => void;
    accountArea?: ReactNode;
    walletArea?: ReactNode;
}>;

type BrandLink = {
    href: string;
    label: string;
    icon: ReactNode;
    text: string;
    count?: string;
};

type SupportAction = {
    label: string;
    icon: ReactNode;
    copyLabel: string;
    idleIcon: ReactNode;
    successIcon: ReactNode;
    copyValue: string | (() => string | Promise<string>);
};

type SupportLink = {
    label: string;
    href: string;
    icon?: ReactNode;
};

type FooterLink = {
    label: string;
    href: string;
};

type AccountMenuLink = {
    href: string;
    label: string;
    icon: ReactNode;
    ariaLabel?: string;
};

const brandLinks: readonly BrandLink[] = [
    {
        href: "https://github.com/pollinations/pollinations",
        label: "Pollinations on GitHub",
        icon: <GitHubIcon className="h-full w-full" />,
        text: "github",
        count: "4.4k",
    },
    {
        href: "https://discord.gg/pollinations-ai-885844321461485618",
        label: "Discord community",
        icon: <DiscordIcon className="h-full w-full" />,
        text: "discord",
        count: "18k",
    },
];

const footerLinks: readonly FooterLink[] = [
    { label: "Terms", href: "https://pollinations.ai/terms" },
    { label: "Privacy", href: "https://pollinations.ai/privacy" },
    { label: "Refunds", href: "https://pollinations.ai/refunds" },
];

const accountMenuLinks: readonly AccountMenuLink[] = [
    {
        href: "https://discord.com/channels/885844321461485618/1432378056126894343",
        label: "#pollen-beta",
        icon: <DiscordIcon className="h-full w-full" />,
        ariaLabel: "#pollen-beta Discord channel",
    },
    {
        href: "https://github.com/pollinations/pollinations/issues",
        label: "Report an issue",
        icon: <GitHubIcon className="h-full w-full" />,
        ariaLabel: "Report an issue on GitHub",
    },
];

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

    useDashboardShellBodyClass();
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

    function handleItemChange(page: DashboardPage): void {
        onPageChange(page);
        closeDrawer();
    }

    const supportLinks: readonly SupportLink[] = [
        {
            label: "API",
            href: `${genDocsUrl()}`,
            icon: (
                <GenApiIcon className="h-3.5 w-3.5 shrink-0 text-theme-text-muted" />
            ),
        },
        {
            label: "BYOP",
            href: `${genDocsUrl()}#tag/byop`,
            icon: (
                <WalletIcon className="h-3.5 w-3.5 shrink-0 text-theme-text-muted" />
            ),
        },
        {
            label: "CLI",
            href: `${genDocsUrl()}#tag/cli`,
            icon: (
                <TerminalIcon className="h-3.5 w-3.5 shrink-0 text-theme-text-muted" />
            ),
        },
        {
            label: "MCP Server",
            href: `${genDocsUrl()}#tag/mcp-server`,
            icon: (
                <McpIcon className="h-3.5 w-3.5 shrink-0 text-theme-text-muted" />
            ),
        },
    ];

    const effectiveAccountArea =
        accountArea ??
        (githubUsername && onSignOut ? (
            <AccountMenuButton
                username={githubUsername}
                avatarUrl={githubAvatarUrl ?? ""}
                onSignOut={onSignOut}
                links={accountMenuLinks}
                className="w-full justify-start"
            />
        ) : null);

    const supportAction: SupportAction = {
        label: "Docs",
        icon: <BookIcon className="h-4 w-4 shrink-0 text-theme-text-muted" />,
        copyLabel: "Copy All",
        // No colour on the icons — they inherit the button's text colour so they
        // match the filled idle/copied states.
        idleIcon: <ClipboardIcon className="h-3.5 w-3.5 shrink-0" />,
        successIcon: <CheckIcon className="h-3.5 w-3.5 shrink-0" />,
        copyValue: async () => {
            const res = await fetch(`${genDocsUrl()}/llm.txt`);
            return res.text();
        },
    };

    const rail = (
        <DashboardRail
            activePage={activePage}
            navItems={navItems}
            supportAction={supportAction}
            supportLinks={supportLinks}
            accountArea={effectiveAccountArea}
            walletArea={walletArea}
            onPageChange={handleItemChange}
        />
    );

    return (
        <div className="flex h-dvh overflow-hidden bg-app-bg text-theme-text-strong">
            <div className="hidden md:block">{rail}</div>
            <div
                ref={drawerRef}
                className={cn(
                    "fixed inset-0 z-40 transition-[visibility] md:hidden",
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
                        "absolute inset-y-0 left-0 flex w-[min(20rem,86vw)] transform-gpu flex-col overflow-hidden border-r border-theme-text-strong/10 bg-app-bg transition-transform ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform",
                        "duration-[420ms]",
                        isDrawerOpen ? "translate-x-0" : "-translate-x-full",
                    )}
                >
                    <div className="flex shrink-0 flex-col gap-2 border-b border-theme-text-strong/10 px-4 py-3">
                        <div className="flex items-center justify-between gap-2">
                            <BrandMark size="drawer" />
                            <button
                                type="button"
                                className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-opaque/70 text-theme-text-strong hover:bg-surface-opaque"
                                onClick={closeDrawer}
                                aria-label="Close navigation"
                            >
                                <XIcon className="h-5 w-5" />
                            </button>
                        </div>
                        <BrandLinks links={brandLinks} />
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                        {rail}
                    </div>
                </div>
            </div>
            <div className="flex min-w-0 flex-1 flex-col md:ml-60">
                <MobileMenuButton
                    buttonRef={menuButtonRef}
                    onOpen={() => setIsDrawerOpen(true)}
                />
                <ScrollArea
                    ref={mainScrollRef}
                    className="min-h-0 min-w-0 flex-1 overscroll-contain px-4 pt-14 pb-8 md:px-6 md:pt-10"
                >
                    <main className="mx-auto flex max-w-[800px] flex-col gap-6">
                        {children}
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
    activePage: DashboardPage;
    navItems: readonly DashboardNavItem[];
    supportAction: SupportAction;
    supportLinks: readonly SupportLink[];
    accountArea?: ReactNode;
    walletArea?: ReactNode;
    onPageChange: (page: DashboardPage) => void;
};

const DashboardRail: FC<DashboardRailProps> = ({
    activePage,
    navItems,
    supportAction,
    supportLinks,
    accountArea,
    walletArea,
    onPageChange,
}) => (
    <aside
        data-theme="neutral"
        className="flex min-h-0 flex-1 flex-col px-2 py-4 md:fixed md:inset-y-0 md:left-0 md:z-30 md:w-60 md:border-r md:border-theme-text-strong/10"
        aria-label="Dashboard navigation"
    >
        <div className="hidden shrink-0 flex-col gap-2 border-b border-theme-text-strong/10 pb-4 pl-1 md:flex">
            <BrandMark size="desktop" />
            <BrandLinks links={brandLinks} />
        </div>
        <ScrollArea
            className="-mr-2 min-h-0 flex-1 pt-3"
            style={
                {
                    "--polli-color-scrollbar-thumb":
                        "color-mix(in oklab, var(--polli-color-text-muted) 65%, transparent)",
                } as CSSProperties
            }
        >
            <nav className="flex flex-col gap-1 pr-2">
                {navItems.map((item) => (
                    <NavItem
                        key={item.id}
                        type="button"
                        data-theme="accent"
                        icon={item.icon}
                        active={activePage === item.id}
                        onClick={() => onPageChange(item.id)}
                    >
                        {item.label}
                    </NavItem>
                ))}
                <DashboardSupport action={supportAction} links={supportLinks} />
            </nav>
        </ScrollArea>
        <div className="flex shrink-0 flex-col gap-2 border-t border-theme-text-strong/10 pt-4">
            {walletArea && <div className="px-1">{walletArea}</div>}
            {accountArea}
            <DashboardFooter links={footerLinks} note="© 2026 Myceli.AI" />
        </div>
    </aside>
);

const MobileMenuButton: FC<{
    buttonRef: RefObject<HTMLButtonElement | null>;
    onOpen: () => void;
}> = ({ buttonRef, onOpen }) => (
    <button
        ref={buttonRef}
        type="button"
        className="fixed left-3 top-3 z-30 flex h-9 w-9 items-center justify-center rounded-full bg-surface-opaque text-theme-text-strong shadow-md ring-1 ring-theme-text-strong/10 hover:bg-surface-opaque md:hidden"
        onClick={onOpen}
        aria-label="Open navigation"
    >
        <MenuIcon className="h-5 w-5" />
    </button>
);

const BrandMark: FC<{ size: "desktop" | "drawer" }> = ({ size }) => (
    <a
        href="https://pollinations.ai"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center text-current"
        aria-label="Pollinations"
    >
        <span className="sr-only">Pollinations</span>
        <span
            aria-hidden="true"
            className={cn(
                "block shrink-0 bg-current",
                size === "desktop" ? "h-6 w-[195px]" : "h-5 w-[162px]",
            )}
            style={brandWordmarkMask}
        />
    </a>
);

const BrandLinks: FC<{ links: readonly BrandLink[] }> = ({ links }) => (
    <div className="flex items-center gap-1.5">
        {links.map((link) => (
            <BrandLinkRow key={link.href} {...link} />
        ))}
    </div>
);

const BrandLinkRow: FC<BrandLink> = ({ href, label, icon, text, count }) => (
    <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        className="inline-flex items-center gap-1.5 rounded-full border border-transparent bg-surface-opaque/55 py-[3px] pr-[10px] pl-[7px] text-micro font-medium leading-none text-theme-text-strong/80 transition-colors hover:border-theme-text-strong/15 hover:bg-surface-opaque hover:text-theme-text-strong"
    >
        <span className="h-[11px] w-[11px]">{icon}</span>
        <span className="-translate-y-px">{text}</span>
        {count && (
            <span className="ml-0.5 border-l border-theme-text-strong/15 pl-1.5 font-mono text-micro text-theme-text-muted">
                {count}
            </span>
        )}
    </a>
);

const DashboardSupport: FC<{
    action: SupportAction;
    links: readonly SupportLink[];
}> = ({ action, links }) => (
    <div className="mt-2 border-t border-theme-text-strong/10 pt-3">
        {/* "Docs" header on the left; a small labelled copy button on the right
            (no tooltip — the visible label says what it does). */}
        <div className="flex items-center justify-between gap-2 px-3 py-1">
            <span className="flex items-center gap-2 text-sm font-medium text-ink-900">
                {action.icon}
                {action.label}
            </span>
            {/* accent over the neutral rail (matches the nav buttons) */}
            <span data-theme="accent">
                <CopyButton
                    value={action.copyValue}
                    copiedTimeoutMs={1500}
                    tooltip={null}
                    className={(copied) =>
                        cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                            copied
                                ? "bg-intent-success-bg-light text-intent-success-text"
                                : "bg-theme-bg-active text-theme-text-strong hover:bg-theme-bg-hover",
                        )
                    }
                >
                    {(copied) => (
                        <>
                            {copied ? action.successIcon : action.idleIcon}
                            {copied ? "Copied" : action.copyLabel}
                        </>
                    )}
                </CopyButton>
            </span>
        </div>
        <div className="ml-3.5 mt-0.5 flex flex-col gap-0.5 border-l border-theme-text-strong/10 pl-2">
            {links.map((link) => (
                <SupportLinkRow key={link.href} {...link} />
            ))}
        </div>
    </div>
);

const SupportLinkRow: FC<SupportLink> = ({ label, href, icon }) => (
    <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-center justify-between gap-2 rounded-full px-3 py-1.5 text-left text-xs font-medium text-ink-700 transition-colors hover:bg-surface-opaque/60 hover:text-ink-950"
    >
        <span className="flex items-center gap-2">
            {icon}
            {label}
        </span>
        <ExternalLinkIcon className="h-3.5 w-3.5 shrink-0 text-theme-text-muted transition-colors group-hover:text-theme-text-base" />
    </a>
);

const DashboardFooter: FC<{
    links: readonly FooterLink[];
    note?: ReactNode;
}> = ({ links, note }) => (
    <>
        <div className="flex flex-wrap gap-x-2 gap-y-1 px-3 text-xs leading-snug text-theme-text-muted">
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
        <div className="flex items-center justify-between gap-2 pl-3 text-xs leading-none text-theme-text-muted">
            <span>{note}</span>
            {/* accent on the toggle's active icon, over the neutral rail */}
            <span data-theme="accent">
                <ColorModeToggle />
            </span>
        </div>
    </>
);

type AccountMenuButtonProps = {
    username: string;
    avatarUrl: string;
    onSignOut?: () => void;
    links?: readonly AccountMenuLink[];
    className?: string;
};

const AccountMenuButton: FC<AccountMenuButtonProps> = ({
    username,
    avatarUrl,
    onSignOut,
    links = [],
    className,
}) => (
    <Dropdown
        align="end"
        className="w-[var(--reference-width)] min-w-0 p-1"
        trigger={(open) => (
            <button
                type="button"
                data-theme="accent"
                className={cn(
                    "flex min-w-0 flex-row items-center gap-2 self-center whitespace-nowrap rounded-full bg-theme-bg-active p-1 pr-3 transition-colors hover:bg-theme-bg-hover",
                    className,
                )}
            >
                <img
                    src={avatarUrl}
                    alt={`${username} avatar`}
                    className="h-8 shrink-0 rounded-full"
                />
                <span className="min-w-0 flex-1 truncate text-left font-medium text-theme-text-strong">
                    {username}
                </span>
                <ChevronIcon
                    expanded={open}
                    className="ml-auto h-4 w-4 shrink-0 text-theme-text-strong transition-transform duration-200 ease-out"
                />
            </button>
        )}
    >
        {(close) => (
            <>
                {links.map((link) => (
                    <AccountMenuLinkRow key={link.href} {...link} />
                ))}
                {links.length > 0 && (
                    <div className="my-1 border-t border-divider" />
                )}
                <button
                    type="button"
                    onClick={() => {
                        close();
                        onSignOut?.();
                    }}
                    className="flex w-full cursor-pointer items-center rounded-lg px-3 py-2 text-left text-sm text-theme-text-strong hover:bg-theme-bg-hover focus:outline-none focus-visible:bg-theme-bg-hover"
                >
                    Sign Out
                </button>
            </>
        )}
    </Dropdown>
);

const AccountMenuLinkRow: FC<AccountMenuLink> = ({
    href,
    label,
    icon,
    ariaLabel,
}) => (
    <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={ariaLabel ?? label}
        className="flex items-center justify-start gap-2 rounded-lg px-3 py-2 text-sm font-medium text-theme-text-strong transition-colors hover:bg-theme-bg-hover focus:outline-none focus-visible:bg-theme-bg-hover"
    >
        <span className="h-4 w-4 shrink-0" aria-hidden="true">
            {icon}
        </span>
        <span>{label}</span>
    </a>
);
