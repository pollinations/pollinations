// Intent maps live per-primitive now: Button/Surface/IconButton support
// `danger`; Chip supports generic label intents (news/alpha/neutral).
// See each component's file for its own ChipIntent / SurfaceIntent / etc.
import {
    AccountIcon,
    CloudUploadIcon,
    CubeIcon,
    LockIcon,
    NewspaperIcon,
    SparkleIcon,
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

// A row with `views` stands for several pages, which its pages' headings
// switch between (see title-switch.tsx); it stays highlighted on all of them.
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
        id: "publish",
        to: "/my-apps",
        label: "Publish",
        icon: CloudUploadIcon,
        group: "yours",
        views: ["/my-apps", "/my-models", "/my-agents"],
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
        id: "explore",
        to: "/models",
        label: "Explore",
        icon: CubeIcon,
        group: "resources",
        views: ["/models", "/agents", "/sandboxes"],
    },
] as const satisfies readonly {
    id: string;
    to: string;
    label: string;
    icon: ComponentType<{ className?: string }>;
    group: DashboardNavGroup;
    views?: readonly string[];
}[];

export type DashboardPage = (typeof DASHBOARD_NAV_ITEMS)[number]["id"];
export type DashboardPath = (typeof DASHBOARD_NAV_ITEMS)[number]["to"];

/** The drawer row a dashboard page belongs to. */
export function navItemFor(path: string) {
    return DASHBOARD_NAV_ITEMS.find((item) =>
        "views" in item
            ? (item.views as readonly string[]).includes(path)
            : item.to === path,
    );
}

export function isDashboardPath(path: string): boolean {
    return navItemFor(path) !== undefined;
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
