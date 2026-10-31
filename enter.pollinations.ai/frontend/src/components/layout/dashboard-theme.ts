// Intent maps live per-primitive now: Button/Surface/IconButton support
// `danger`; Chip supports generic label intents (news/alpha/neutral).
// See each component's file for its own ChipIntent / SurfaceIntent / etc.
import {
    AccountIcon,
    AppIcon,
    BeakerIcon,
    BotIcon,
    CloudUploadIcon,
    LockIcon,
    McpIcon,
    NewspaperIcon,
    RobotIcon,
    SparkleIcon,
    TerminalIcon,
    ToolIcon,
    TrendUpIcon,
    WalletIcon,
} from "@pollinations/ui";
import type { ComponentType } from "react";

/**
 * Groups of drawer rows: Pollinations' resources and your pages. "account"
 * rows are pinned at the bottom as buttons: your balance and your name.
 */
export type DashboardNavGroup = "account" | "yours" | "resources";

// Rows with a `parent` sit indented under its label: Publish for what you
// put out (your apps, models and agents).
export const NAV_PARENTS = {
    publish: { label: "Publish", icon: CloudUploadIcon },
} as const;

export const DASHBOARD_NAV_ITEMS = [
    {
        id: "account",
        to: "/account",
        label: "Account",
        icon: AccountIcon,
        group: "account",
    },
    {
        id: "balance",
        to: "/balance",
        label: "Balance",
        icon: WalletIcon,
        group: "account",
    },
    {
        id: "quests",
        to: "/quests",
        label: "Quests",
        icon: SparkleIcon,
        group: "yours",
    },
    { id: "keys", to: "/keys", label: "Keys", icon: LockIcon, group: "yours" },
    {
        id: "connectors",
        to: "/connectors",
        label: "Connectors",
        icon: ToolIcon,
        group: "yours",
    },
    {
        id: "my-apps",
        to: "/my-apps",
        label: "Apps",
        icon: AppIcon,
        group: "yours",
        parent: "publish",
    },
    {
        id: "my-models",
        to: "/my-models",
        label: "Models",
        icon: BeakerIcon,
        group: "yours",
        parent: "publish",
    },
    {
        id: "my-agents",
        to: "/my-agents",
        label: "Agents",
        icon: RobotIcon,
        group: "yours",
        parent: "publish",
    },
    {
        id: "activity",
        to: "/activity",
        label: "Activity",
        icon: TrendUpIcon,
        group: "yours",
    },
    {
        id: "news-faq",
        to: "/news",
        label: "News & FAQ",
        icon: NewspaperIcon,
        group: "resources",
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
        id: "sandboxes",
        to: "/sandboxes",
        label: "Sandboxes",
        icon: TerminalIcon,
        group: "resources",
    },
] as const satisfies readonly {
    id: string;
    to: string;
    search?: { view?: string };
    label: string;
    icon: ComponentType<{ className?: string }>;
    group: DashboardNavGroup;
    parent?: keyof typeof NAV_PARENTS;
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
