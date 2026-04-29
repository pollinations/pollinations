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
    theme: DashboardTheme;
}[] = [
    { id: "updates", label: "News & FAQ", theme: "violet" },
    { id: "pollen", label: "Pollen", theme: "amber" },
    { id: "usage", label: "Usage", theme: "pink" },
    { id: "keys", label: "Keys", theme: "blue" },
    { id: "models", label: "Models", theme: "teal" },
];

export const DASHBOARD_PAGES: DashboardPage[] = [
    "updates",
    "pollen",
    "usage",
    "keys",
    "models",
];

// ─── Color palette (single source of truth) ──────────────────
// `Panel`, `Card`, and `Button` import their slice from here.
// `dashboardThemeClasses` (below) rolls these up for the 7 nav themes.

export const panelColors = {
    amber: "border-amber-300 bg-amber-50/70",
    blue: "border-blue-300 bg-blue-50/70",
    gray: "border-gray-300 bg-gray-50/70",
    green: "border-green-300 bg-green-50/70",
    orange: "border-orange-300 bg-orange-50/70",
    pink: "border-pink-300 bg-pink-50/70",
    purple: "border-purple-300 bg-purple-50/70",
    teal: "border-teal-200 bg-teal-50/70",
    violet: "border-violet-300 bg-violet-50/70",
} as const;

export const cardColors = {
    amber: "border-amber-300",
    blue: "border-blue-300",
    gray: "border-gray-200",
    green: "border-green-300",
    orange: "border-orange-300",
    pink: "border-pink-300",
    purple: "border-purple-300",
    red: "border-red-300",
    teal: "border-teal-200",
    violet: "border-violet-200",
    yellow: "border-yellow-200",
} as const;

export const buttonColors = {
    amber: {
        light: "bg-amber-200 text-amber-900 hover:bg-amber-300",
        strong: "bg-amber-500 text-white hover:bg-amber-400",
        outline:
            "border-2 border-amber-500 text-amber-900 hover:bg-amber-500 hover:text-white transition-colors",
    },
    blue: {
        light: "bg-blue-200 text-blue-900",
        strong: "bg-blue-900 text-blue-50",
        outline: "border-2 border-blue-900 text-blue-900",
    },
    dark: {
        light: "bg-gray-200 text-gray-900 hover:bg-gray-300",
        strong: "bg-gray-900 text-white hover:bg-gray-700",
        outline:
            "border-2 border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white transition-colors",
    },
    gray: {
        light: "bg-gray-200 text-gray-900 hover:bg-gray-300",
        strong: "bg-gray-700 text-white hover:bg-gray-600",
        outline:
            "border-2 border-gray-700 text-gray-900 hover:bg-gray-700 hover:text-white transition-colors",
    },
    green: {
        light: "bg-green-200 text-green-900 hover:bg-green-300",
        strong: "bg-green-950 text-green-100 hover:bg-green-800",
        outline:
            "border-2 border-green-950 text-green-950 hover:bg-green-950 hover:text-green-100 transition-colors",
    },
    pink: {
        light: "bg-pink-200 text-pink-900 hover:bg-pink-300",
        strong: "bg-pink-700 text-pink-50 hover:bg-pink-600",
        outline:
            "border-2 border-pink-500 text-pink-900 hover:bg-pink-500 hover:text-white transition-colors",
    },
    purple: {
        light: "bg-indigo-200 text-indigo-900",
        strong: "bg-indigo-900 text-indigo-50",
        outline: "border-2 border-indigo-900 text-indigo-900",
    },
    red: {
        light: "bg-red-200 text-red-900 hover:bg-red-300",
        strong: "bg-red-900 text-red-50 hover:bg-red-700",
        outline:
            "border-2 border-red-700 text-red-700 hover:bg-red-700 hover:text-white transition-colors",
    },
    teal: {
        light: "bg-teal-200 text-teal-900 hover:bg-teal-300",
        strong: "bg-teal-600 text-white hover:bg-teal-500",
        outline:
            "border-2 border-teal-600 text-teal-900 hover:bg-teal-600 hover:text-white transition-colors",
    },
    violet: {
        light: "bg-violet-200 text-violet-900",
        strong: "bg-violet-600 text-white",
        outline: "border-2 border-violet-600 text-violet-900",
    },
} as const;

export const pillColors = {
    amber: { bg: "bg-amber-200", text: "text-amber-900" },
    blue: { bg: "bg-blue-200", text: "text-blue-900" },
    gray: { bg: "bg-gray-300", text: "text-gray-900" },
    green: { bg: "bg-green-200", text: "text-green-900" },
    orange: { bg: "bg-orange-300", text: "text-orange-950" },
    pink: { bg: "bg-pink-200", text: "text-pink-900" },
    teal: { bg: "bg-teal-200", text: "text-teal-900" },
    violet: { bg: "bg-violet-200", text: "text-violet-950" },
} as const;

export const tabColors = {
    amber: {
        active: "border-amber-300 bg-amber-200 text-amber-950 hover:bg-amber-200",
        inactive:
            "border-amber-300 bg-amber-50/80 text-amber-900 hover:bg-amber-100",
    },
    blue: {
        active: "border-blue-300 bg-blue-200 text-blue-950 hover:bg-blue-200",
        inactive:
            "border-blue-300 bg-blue-50/80 text-blue-900 hover:bg-blue-100",
    },
    gray: {
        active: "border-gray-300 bg-gray-200 text-gray-950 hover:bg-gray-200",
        inactive:
            "border-gray-300 bg-gray-50/80 text-gray-900 hover:bg-gray-100",
    },
    green: {
        active: "border-green-300 bg-green-200 text-green-950 hover:bg-green-200",
        inactive:
            "border-green-300 bg-green-50/80 text-green-900 hover:bg-green-100",
    },
    pink: {
        active: "border-pink-300 bg-pink-200 text-pink-950 hover:bg-pink-200",
        inactive:
            "border-pink-300 bg-pink-50/80 text-pink-900 hover:bg-pink-100",
    },
    teal: {
        active: "border-teal-300 bg-teal-200 text-teal-950 hover:bg-teal-200",
        inactive:
            "border-teal-300 bg-teal-50/80 text-teal-900 hover:bg-teal-100",
    },
    violet: {
        active: "border-violet-300 bg-violet-200 text-violet-950 hover:bg-violet-200",
        inactive:
            "border-violet-300 bg-violet-50/80 text-violet-900 hover:bg-violet-100",
    },
} as const satisfies Record<
    DashboardTheme,
    { active: string; inactive: string }
>;

export const dashboardThemeClasses: Record<
    DashboardTheme,
    {
        title: string;
        dot: string;
        active: string;
        panel: string;
        card: string;
        button: (typeof buttonColors)[keyof typeof buttonColors];
        tab: (typeof tabColors)[keyof typeof tabColors];
    }
> = {
    amber: {
        title: "text-amber-950",
        dot: "bg-amber-500",
        active: "bg-amber-200 text-green-950",
        panel: panelColors.amber,
        card: cardColors.amber,
        button: buttonColors.amber,
        tab: tabColors.amber,
    },
    blue: {
        title: "text-blue-950",
        dot: "bg-blue-500",
        active: "bg-blue-200 text-green-950",
        panel: panelColors.blue,
        card: cardColors.blue,
        button: buttonColors.blue,
        tab: tabColors.blue,
    },
    gray: {
        title: "text-gray-950",
        dot: "bg-gray-500",
        active: "bg-gray-200 text-green-950",
        panel: panelColors.gray,
        card: cardColors.gray,
        button: buttonColors.gray,
        tab: tabColors.gray,
    },
    green: {
        title: "text-green-950",
        dot: "bg-green-500",
        active: "bg-green-200 text-green-950",
        panel: panelColors.green,
        card: cardColors.green,
        button: buttonColors.green,
        tab: tabColors.green,
    },
    pink: {
        title: "text-pink-950",
        dot: "bg-pink-500",
        active: "bg-pink-200 text-green-950",
        panel: panelColors.pink,
        card: cardColors.pink,
        button: buttonColors.pink,
        tab: tabColors.pink,
    },
    teal: {
        title: "text-teal-950",
        dot: "bg-teal-500",
        active: "bg-teal-200 text-green-950",
        panel: panelColors.teal,
        card: cardColors.teal,
        button: buttonColors.teal,
        tab: tabColors.teal,
    },
    violet: {
        title: "text-violet-950",
        dot: "bg-violet-500",
        active: "bg-violet-200 text-green-950",
        panel: panelColors.violet,
        card: cardColors.violet,
        button: buttonColors.violet,
        tab: tabColors.violet,
    },
};

export function isDashboardPage(page: string): page is DashboardPage {
    return DASHBOARD_PAGES.includes(page as DashboardPage);
}
