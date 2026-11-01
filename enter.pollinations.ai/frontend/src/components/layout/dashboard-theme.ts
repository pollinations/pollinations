// Intent maps live per-primitive now: Button/Surface/IconButton support
// `danger`; Chip supports generic label intents (news/alpha/neutral).
// See each component's file for its own ChipIntent / SurfaceIntent / etc.
import {
    AccountIcon,
    BeakerIcon,
    BotIcon,
    CloudUploadIcon,
    LockIcon,
    McpIcon,
    NewspaperIcon,
    SparkleIcon,
    TerminalIcon,
    TrendUpIcon,
    WalletIcon,
} from "@pollinations/ui";
import type { ComponentType } from "react";

/**
 * Groups of drawer rows: Pollinations' resources, then your pages (what you
 * your balances, then what you build). "account" is Settings, reached from
 * your name under them.
 */
export type DashboardNavGroup = "account" | "yours" | "resources";

export const DASHBOARD_NAV_ITEMS = [
    {
        id: "pollen",
        to: "/pollen",
        label: "Credit",
        icon: WalletIcon,
        group: "yours",
    },
    {
        id: "quests",
        to: "/quests",
        label: "Quest",
        icon: SparkleIcon,
        group: "yours",
    },
    {
        id: "my-models",
        to: "/my-models",
        label: "My Listings",
        icon: CloudUploadIcon,
        group: "yours",
    },
    { id: "keys", to: "/keys", label: "Keys", icon: LockIcon, group: "yours" },
    {
        id: "sandboxes",
        to: "/sandboxes",
        label: "Sandboxes",
        icon: TerminalIcon,
        group: "yours",
    },
    {
        id: "activity",
        to: "/activity",
        label: "Activity",
        icon: TrendUpIcon,
        group: "yours",
    },
    {
        id: "account",
        to: "/account",
        label: "Settings",
        icon: AccountIcon,
        group: "account",
    },
    {
        id: "models",
        to: "/models",
        label: "Models",
        icon: BeakerIcon,
        group: "resources",
    },
    {
        id: "agents",
        to: "/agents",
        search: { view: undefined },
        label: "Agents",
        icon: BotIcon,
        group: "resources",
    },
    {
        id: "mcp",
        to: "/agents",
        search: { view: "mcp" },
        label: "MCP",
        icon: McpIcon,
        group: "resources",
    },
    {
        id: "news-faq",
        to: "/news",
        label: "News & FAQ",
        icon: NewspaperIcon,
        group: "resources",
    },
] as const satisfies readonly {
    id: string;
    to: string;
    search?: { view?: string };
    label: string;
    icon: ComponentType<{ className?: string }>;
    group: DashboardNavGroup;
}[];

export type DashboardPage = (typeof DASHBOARD_NAV_ITEMS)[number]["id"];
export type DashboardPath = (typeof DASHBOARD_NAV_ITEMS)[number]["to"];

/**
 * The drawer row for a page. Agents and MCP share /agents; its `view` search
 * param tells them apart.
 */
export function navItemFor(path: string, view?: unknown) {
    const rows = DASHBOARD_NAV_ITEMS.filter((item) => item.to === path);
    if (rows.length < 2) return rows[0];
    return rows.find(
        (item) => ("search" in item ? item.search.view : undefined) === view,
    );
}

export function isDashboardPath(path: string): boolean {
    return DASHBOARD_NAV_ITEMS.some((item) => item.to === path);
}

const RESOURCE_ITEMS = DASHBOARD_NAV_ITEMS.filter(
    (item) => item.group === "resources",
);
const QUESTS_ITEM = DASHBOARD_NAV_ITEMS.filter((item) => item.id === "quests");

// Signed out there is no card of your own; Quests, the way to earn free
// pollen, joins the resources.
export const SIGNED_OUT_NAV_ITEMS = [
    ...RESOURCE_ITEMS,
    ...QUESTS_ITEM.map((item) => ({ ...item, group: "resources" as const })),
];
