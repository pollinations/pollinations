// Intent maps live per-primitive now: Button/Surface/IconButton support
// `danger`; Chip supports generic label intents (news/alpha/neutral).
// See each component's file for its own ChipIntent / SurfaceIntent / etc.
import {
    BeakerIcon,
    LockIcon,
    NewspaperIcon,
    SparkleIcon,
    TrendUpIcon,
    WalletIcon,
} from "@pollinations/ui";
import type { ComponentType } from "react";

export const DASHBOARD_NAV_ITEMS = [
    {
        id: "news-faq",
        to: "/news",
        label: "News & FAQ",
        icon: NewspaperIcon,
    },
    { id: "models", to: "/models", label: "Models", icon: BeakerIcon },
    { id: "keys", to: "/keys", label: "Keys", icon: LockIcon },
    { id: "pollen", to: "/pollen", label: "Pollen", icon: WalletIcon },
    {
        id: "activity",
        to: "/activity",
        label: "Activity",
        icon: TrendUpIcon,
    },
    { id: "quests", to: "/quests", label: "Quests", icon: SparkleIcon },
] as const satisfies readonly {
    id: string;
    to: string;
    label: string;
    icon: ComponentType<{ className?: string }>;
}[];

export type DashboardPage = (typeof DASHBOARD_NAV_ITEMS)[number]["id"];
export type DashboardPath = (typeof DASHBOARD_NAV_ITEMS)[number]["to"];

export function isDashboardPath(path: string): path is DashboardPath {
    return DASHBOARD_NAV_ITEMS.some((item) => item.to === path);
}

const SIGNED_OUT_PAGES: ReadonlySet<DashboardPage> = new Set([
    "news-faq",
    "models",
    "quests",
]);

export const SIGNED_OUT_NAV_ITEMS = DASHBOARD_NAV_ITEMS.filter((item) =>
    SIGNED_OUT_PAGES.has(item.id),
);
