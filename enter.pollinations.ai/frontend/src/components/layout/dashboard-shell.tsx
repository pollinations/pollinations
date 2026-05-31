import {
    BookIcon,
    CheckIcon,
    ClipboardIcon,
    DiscordIcon,
    GenApiIcon,
    GitHubIcon,
    McpIcon,
    TerminalIcon,
    WalletIcon,
} from "@pollinations_ai/ui";
import {
    AccountMenuButton,
    type AccountMenuLink,
    AppShell,
    type AppShellBrand,
    type AppShellBrandLink,
    type AppShellFooterLink,
    type AppShellSupportLink,
} from "@pollinations_ai/ui/shell";
import {
    type FC,
    type PropsWithChildren,
    type ReactNode,
    useCallback,
    useState,
} from "react";
import { genDocsUrl } from "../../config.ts";
import { DASHBOARD_NAV_ITEMS, type DashboardPage } from "./dashboard-theme.ts";

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

const dashboardBrand: AppShellBrand = {
    href: "https://pollinations.ai",
    label: "Pollinations",
    imageSrc: "/logo_text_black.svg",
    imageAlt: "pollinations.ai",
};

const brandLinks: readonly AppShellBrandLink[] = [
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

const footerLinks: readonly AppShellFooterLink[] = [
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
    const [docsCopied, setDocsCopied] = useState(false);

    const handleCopyDocs = useCallback(async () => {
        const res = await fetch(`${genDocsUrl()}/llm.txt`);
        const text = await res.text();
        await navigator.clipboard.writeText(text);
        setDocsCopied(true);
        setTimeout(() => setDocsCopied(false), 1200);
    }, []);

    const getScrollTargetId = useCallback((page: DashboardPage) => {
        if (
            page === "pollen" &&
            typeof window !== "undefined" &&
            window.location.hash === "#buy-pollen"
        ) {
            return "buy-pollen";
        }
        return null;
    }, []);

    const supportLinks: readonly AppShellSupportLink[] = [
        {
            label: "API",
            href: `${genDocsUrl()}`,
            icon: <GenApiIcon className="h-3.5 w-3.5 shrink-0 text-gray-500" />,
        },
        {
            label: "BYOP",
            href: `${genDocsUrl()}#tag/byop`,
            icon: <WalletIcon className="h-3.5 w-3.5 shrink-0 text-gray-500" />,
        },
        {
            label: "CLI",
            href: `${genDocsUrl()}#tag/cli`,
            icon: (
                <TerminalIcon className="h-3.5 w-3.5 shrink-0 text-gray-500" />
            ),
        },
        {
            label: "MCP Server",
            href: `${genDocsUrl()}#tag/mcp-server`,
            icon: <McpIcon className="h-3.5 w-3.5 shrink-0 text-gray-500" />,
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

    return (
        <AppShell
            activeItem={activePage}
            navItems={navItems}
            onItemChange={onPageChange}
            brand={dashboardBrand}
            brandLinks={brandLinks}
            supportAction={{
                label: "Docs",
                title: "Copy full docs for LLMs",
                icon: <BookIcon className="h-4 w-4 shrink-0 text-gray-500" />,
                idleIcon: (
                    <ClipboardIcon className="h-4 w-4 shrink-0 text-gray-400 transition-colors polli:group-hover:text-gray-600" />
                ),
                successIcon: (
                    <CheckIcon className="h-4 w-4 shrink-0 text-green-700" />
                ),
                active: docsCopied,
                onClick: handleCopyDocs,
            }}
            supportLinks={supportLinks}
            footerLinks={footerLinks}
            footerNote="© 2026 Myceli.AI"
            accountArea={effectiveAccountArea}
            walletArea={walletArea}
            getScrollTargetId={getScrollTargetId}
        >
            {children}
        </AppShell>
    );
};
