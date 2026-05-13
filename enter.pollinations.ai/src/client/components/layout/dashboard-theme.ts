// ─── Phase 0: slim cascade-aligned exports ───────────────────
// The 6 chrome themes the new CSS-var cascade exposes via [data-theme="…"].
// Keep in sync with the [data-theme="*"] blocks in style.css.
export const themes = [
    "amber",
    "blue",
    "pink",
    "teal",
    "violet",
    "green",
] as const;
export type ThemeName = (typeof themes)[number];

// Semantic intents — theme-independent. Mirrors the --intent-* vars in style.css.
export const intents = ["danger", "success", "paid", "alpha"] as const;
export type IntentName = (typeof intents)[number];

export type DashboardPage = "updates" | "pollen" | "usage" | "keys" | "models";

export type DashboardTheme =
    | "amber"
    | "blue"
    | "gray"
    | "green"
    | "pink"
    | "teal"
    | "violet";

export const DASHBOARD_NAV_ITEMS: {
    id: DashboardPage;
    label: string;
    theme: ThemeName;
}[] = [
    { id: "updates", label: "News & FAQ", theme: "violet" },
    { id: "models", label: "Models", theme: "teal" },
    { id: "keys", label: "Keys", theme: "blue" },
    { id: "pollen", label: "Pollen", theme: "amber" },
    { id: "usage", label: "Activity", theme: "pink" },
];

export const DASHBOARD_PAGES: DashboardPage[] = [
    "updates",
    "models",
    "keys",
    "pollen",
    "usage",
];

// Page → theme lookup, derived from DASHBOARD_NAV_ITEMS.
// Pages should read their theme from here so flipping a nav item's `theme`
// retheme the corresponding page in one edit.
export const dashboardThemeByPage = Object.fromEntries(
    DASHBOARD_NAV_ITEMS.map(({ id, theme }) => [id, theme]),
) as Record<DashboardPage, ThemeName>;

// Page chrome colors are now driven entirely by the CSS-var cascade in
// `style.css`. Components scope their subtree with `data-theme="…"` and
// read `text-theme-*` / `bg-theme-*` / `border-theme-*` utilities. Phase 5
// removed the legacy `themeTokens` and `dashboardThemeClasses` literal-class
// bundles (see PR description for migration notes).

export function isDashboardPage(page: string): page is DashboardPage {
    return DASHBOARD_PAGES.includes(page as DashboardPage);
}
