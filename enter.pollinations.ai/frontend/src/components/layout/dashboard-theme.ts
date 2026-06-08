// Intent maps live per-primitive now: Button/Surface/IconButton support
// `danger`; Chip supports generic label intents (news/alpha/neutral).
// See each component's file for its own ChipIntent / SurfaceIntent / etc.

export const DASHBOARD_NAV_ITEMS = [
    { id: "news-faq", label: "News & FAQ" },
    { id: "models", label: "Models" },
    { id: "keys", label: "Keys" },
    { id: "pollen", label: "Pollen" },
    { id: "activity", label: "Activity" },
] as const satisfies readonly {
    id: string;
    label: string;
}[];

export type DashboardPage = (typeof DASHBOARD_NAV_ITEMS)[number]["id"];

export const DASHBOARD_PAGES = DASHBOARD_NAV_ITEMS.map(({ id }) => id);

export function isDashboardPage(page: string): page is DashboardPage {
    return DASHBOARD_PAGES.includes(page as DashboardPage);
}
