import { type ThemeName, themes } from "@pollinations_ai/ui";

export { themes };
export type { ThemeName };

// Intent maps live per-primitive now: Button/Surface/IconButton support
// `danger`; Chip supports the four label intents (news/alpha/paid/tier).
// See each component's file for its own ChipIntent / SurfaceIntent / etc.

export type DashboardPage =
    | "news-faq"
    | "pollen"
    | "activity"
    | "keys"
    | "models";

/** Alias kept for backwards-compat at call sites; identical to ThemeName. */
export type DashboardTheme = ThemeName;

export const DASHBOARD_NAV_ITEMS: {
    id: DashboardPage;
    label: string;
    theme: ThemeName;
}[] = [
    { id: "news-faq", label: "News & FAQ", theme: "violet" },
    { id: "models", label: "Models", theme: "teal" },
    { id: "keys", label: "Keys", theme: "blue" },
    { id: "pollen", label: "Pollen", theme: "amber" },
    { id: "activity", label: "Activity", theme: "pink" },
];

export const DASHBOARD_PAGES: DashboardPage[] = [
    "news-faq",
    "models",
    "keys",
    "pollen",
    "activity",
];

// Page → theme lookup, derived from DASHBOARD_NAV_ITEMS.
// Pages should read their theme from here so flipping a nav item's `theme`
// retheme the corresponding page in one edit.
export const dashboardThemeByPage = Object.fromEntries(
    DASHBOARD_NAV_ITEMS.map(({ id, theme }) => [id, theme]),
) as Record<DashboardPage, ThemeName>;

// Page chrome colors are driven by @pollinations_ai/ui CSS variables.
// Components scope their subtree with `data-theme="..."` and read the
// Tailwind bridge utilities from @pollinations_ai/ui/enter.css.

export function isDashboardPage(page: string): page is DashboardPage {
    return DASHBOARD_PAGES.includes(page as DashboardPage);
}
