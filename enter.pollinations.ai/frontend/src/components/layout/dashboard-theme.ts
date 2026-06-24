// Intent maps live per-primitive now: Button/Surface/IconButton support
// `danger`; Chip supports generic label intents (news/alpha/neutral).
// See each component's file for its own ChipIntent / SurfaceIntent / etc.
import {
    BeakerIcon,
    LockIcon,
    NewspaperIcon,
    TargetIcon,
    TrendUpIcon,
    WalletIcon,
} from "@pollinations/ui";
import type { ComponentType } from "react";

export const DASHBOARD_NAV_ITEMS = [
    { id: "news-faq", label: "News & FAQ", icon: NewspaperIcon },
    { id: "models", label: "Models", icon: BeakerIcon },
    { id: "keys", label: "Keys", icon: LockIcon },
    { id: "pollen", label: "Pollen", icon: WalletIcon },
    { id: "activity", label: "Activity", icon: TrendUpIcon },
    { id: "quests", label: "Quests", icon: TargetIcon },
] as const satisfies readonly {
    id: string;
    label: string;
    icon: ComponentType<{ className?: string }>;
}[];

export type DashboardPage = (typeof DASHBOARD_NAV_ITEMS)[number]["id"];

export const DASHBOARD_PAGES = DASHBOARD_NAV_ITEMS.map(({ id }) => id);

export function isDashboardPage(page: string): page is DashboardPage {
    return DASHBOARD_PAGES.includes(page as DashboardPage);
}
