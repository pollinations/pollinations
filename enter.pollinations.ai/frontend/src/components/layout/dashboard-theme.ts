// Intent maps live per-primitive now: Button/Surface/IconButton support
// `danger`; Chip supports generic label intents (news/alpha/neutral).
// See each component's file for its own ChipIntent / SurfaceIntent / etc.
import {
    AccountIcon,
    AppIcon,
    BeakerIcon,
    BotIcon,
    LockIcon,
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
        id: "my-models",
        to: "/my-models",
        label: "My Models",
        icon: BeakerIcon,
        group: "yours",
    },
    {
        id: "my-agents",
        to: "/my-agents",
        label: "My Agents",
        icon: RobotIcon,
        group: "yours",
    },
    {
        id: "my-apps",
        to: "/my-apps",
        label: "My Apps",
        icon: AppIcon,
        group: "yours",
    },
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
        label: "Agents & MCP",
        icon: BotIcon,
        group: "resources",
    },
] as const satisfies readonly {
    id: string;
    to: string;
    label: string;
    icon: ComponentType<{ className?: string }>;
    group: DashboardNavGroup;
}[];

export type DashboardPage = (typeof DASHBOARD_NAV_ITEMS)[number]["id"];
export type DashboardPath = (typeof DASHBOARD_NAV_ITEMS)[number]["to"];

export function isDashboardPath(path: string): path is DashboardPath {
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
