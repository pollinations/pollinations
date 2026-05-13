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
    theme: DashboardTheme;
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
// TODO(phase-5): narrow value type from DashboardTheme to ThemeName once legacy
// themeTokens/dashboardThemeClasses are deleted. `gray` is reserved utility, not a page theme.
export const dashboardThemeByPage = Object.fromEntries(
    DASHBOARD_NAV_ITEMS.map(({ id, theme }) => [id, theme]),
) as Record<DashboardPage, DashboardTheme>;

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
} as const;

export const buttonColors = {
    amber: {
        light: "bg-amber-200 text-amber-900 hover:bg-amber-300",
        strong: "bg-amber-500 text-white hover:bg-amber-400",
        outline:
            "border-2 border-amber-500 text-amber-900 hover:bg-amber-500 hover:text-white transition-colors",
    },
    blue: {
        light: "bg-blue-200 text-blue-900 hover:bg-blue-300 transition-colors",
        strong: "bg-blue-200 text-blue-900 hover:bg-blue-300 transition-colors",
        outline:
            "border-2 border-blue-300 text-blue-900 hover:bg-blue-100 hover:border-blue-400 transition-colors",
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

// Per-theme token bundle for page chrome — literal class strings so Tailwind's JIT picks them up.
// Covers per-page-themed surfaces only: text, borders, backgrounds, dividers, ring accents,
// and scrollbar thumb. Out of scope: neutral grays/reds (loading/error/disabled), tier/modality
// semantic colors, and Tag badge styling (`tagColors` in `ui/tag.tsx`).
export const themeTokens = {
    amber: {
        text: {
            label: "text-amber-600",
            base: "text-amber-900",
            strong: "text-amber-950",
            muted: "text-amber-800/75",
            soft: "text-amber-700",
            softer: "text-amber-700/60",
        },
        border: {
            idle: "border-amber-300",
            soft: "border-amber-300/70",
            subtle: "border-amber-200",
        },
        bg: {
            idle: "bg-amber-50/80",
            subtle: "bg-amber-50/50",
            hover: "hover:bg-amber-100",
            active: "bg-amber-200",
            soft: "hover:bg-amber-50",
        },
        divide: "divide-amber-300/70",
        ring: "ring-amber-400/70",
        scrollbar: "scrollbar-theme-amber",
    },
    blue: {
        text: {
            label: "text-blue-600",
            base: "text-blue-900",
            strong: "text-blue-950",
            muted: "text-blue-800/75",
            soft: "text-blue-700",
            softer: "text-blue-700/60",
        },
        border: {
            idle: "border-blue-300",
            soft: "border-blue-300/70",
            subtle: "border-blue-200",
        },
        bg: {
            idle: "bg-blue-50/80",
            subtle: "bg-blue-50/50",
            hover: "hover:bg-blue-100",
            active: "bg-blue-200",
            soft: "hover:bg-blue-50",
        },
        divide: "divide-blue-300/70",
        ring: "ring-blue-400/70",
        scrollbar: "scrollbar-theme-blue",
    },
    gray: {
        text: {
            label: "text-gray-600",
            base: "text-gray-900",
            strong: "text-gray-950",
            muted: "text-gray-800/75",
            soft: "text-gray-700",
            softer: "text-gray-700/60",
        },
        border: {
            idle: "border-gray-300",
            soft: "border-gray-300/70",
            subtle: "border-gray-200",
        },
        bg: {
            idle: "bg-gray-50/80",
            subtle: "bg-gray-50/50",
            hover: "hover:bg-gray-100",
            active: "bg-gray-200",
            soft: "hover:bg-gray-50",
        },
        divide: "divide-gray-300/70",
        ring: "ring-gray-400/70",
        scrollbar: "scrollbar-theme-gray",
    },
    green: {
        text: {
            label: "text-green-600",
            base: "text-green-900",
            strong: "text-green-950",
            muted: "text-green-800/75",
            soft: "text-green-700",
            softer: "text-green-700/60",
        },
        border: {
            idle: "border-green-300",
            soft: "border-green-300/70",
            subtle: "border-green-200",
        },
        bg: {
            idle: "bg-green-50/80",
            subtle: "bg-green-50/50",
            hover: "hover:bg-green-100",
            active: "bg-green-200",
            soft: "hover:bg-green-50",
        },
        divide: "divide-green-300/70",
        ring: "ring-green-400/70",
        scrollbar: "scrollbar-theme-green",
    },
    pink: {
        text: {
            label: "text-pink-600",
            base: "text-pink-900",
            strong: "text-pink-950",
            muted: "text-pink-800/75",
            soft: "text-pink-700",
            softer: "text-pink-700/60",
        },
        border: {
            idle: "border-pink-300",
            soft: "border-pink-300/70",
            subtle: "border-pink-200",
        },
        bg: {
            idle: "bg-pink-50/80",
            subtle: "bg-pink-50/50",
            hover: "hover:bg-pink-100",
            active: "bg-pink-200",
            soft: "hover:bg-pink-50",
        },
        divide: "divide-pink-300/70",
        ring: "ring-pink-400/70",
        scrollbar: "scrollbar-theme-pink",
    },
    teal: {
        text: {
            label: "text-teal-600",
            base: "text-teal-900",
            strong: "text-teal-950",
            muted: "text-teal-800/75",
            soft: "text-teal-700",
            softer: "text-teal-700/60",
        },
        border: {
            idle: "border-teal-300",
            soft: "border-teal-300/70",
            subtle: "border-teal-200",
        },
        bg: {
            idle: "bg-teal-50/80",
            subtle: "bg-teal-50/50",
            hover: "hover:bg-teal-100",
            active: "bg-teal-200",
            soft: "hover:bg-teal-50",
        },
        divide: "divide-teal-300/70",
        ring: "ring-teal-400/70",
        scrollbar: "scrollbar-theme-teal",
    },
    violet: {
        text: {
            label: "text-violet-600",
            base: "text-violet-900",
            strong: "text-violet-950",
            muted: "text-violet-800/75",
            soft: "text-violet-700",
            softer: "text-violet-700/60",
        },
        border: {
            idle: "border-violet-300",
            soft: "border-violet-300/70",
            subtle: "border-violet-200",
        },
        bg: {
            idle: "bg-violet-50/80",
            subtle: "bg-violet-50/50",
            hover: "hover:bg-violet-100",
            active: "bg-violet-200",
            soft: "hover:bg-violet-50",
        },
        divide: "divide-violet-300/70",
        ring: "ring-violet-400/70",
        scrollbar: "scrollbar-theme-violet",
    },
} as const satisfies Record<DashboardTheme, ThemeTokens>;

export type ThemeTokens = {
    text: {
        label: string;
        base: string;
        strong: string;
        muted: string;
        soft: string;
        softer: string;
    };
    border: { idle: string; soft: string; subtle: string };
    bg: {
        idle: string;
        subtle: string;
        hover: string;
        active: string;
        soft: string;
    };
    divide: string;
    ring: string;
    scrollbar: string;
};

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
        pill: (typeof pillColors)[keyof typeof pillColors];
        tokens: ThemeTokens;
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
        pill: pillColors.amber,
        tokens: themeTokens.amber,
    },
    blue: {
        title: "text-blue-950",
        dot: "bg-blue-500",
        active: "bg-blue-200 text-green-950",
        panel: panelColors.blue,
        card: cardColors.blue,
        button: buttonColors.blue,
        tab: tabColors.blue,
        pill: pillColors.blue,
        tokens: themeTokens.blue,
    },
    gray: {
        title: "text-gray-950",
        dot: "bg-gray-500",
        active: "bg-gray-200 text-green-950",
        panel: panelColors.gray,
        card: cardColors.gray,
        button: buttonColors.gray,
        tab: tabColors.gray,
        pill: pillColors.gray,
        tokens: themeTokens.gray,
    },
    green: {
        title: "text-green-950",
        dot: "bg-green-500",
        active: "bg-green-200 text-green-950",
        panel: panelColors.green,
        card: cardColors.green,
        button: buttonColors.green,
        tab: tabColors.green,
        pill: pillColors.green,
        tokens: themeTokens.green,
    },
    pink: {
        title: "text-pink-950",
        dot: "bg-pink-500",
        active: "bg-pink-200 text-green-950",
        panel: panelColors.pink,
        card: cardColors.pink,
        button: buttonColors.pink,
        tab: tabColors.pink,
        pill: pillColors.pink,
        tokens: themeTokens.pink,
    },
    teal: {
        title: "text-teal-950",
        dot: "bg-teal-500",
        active: "bg-teal-200 text-green-950",
        panel: panelColors.teal,
        card: cardColors.teal,
        button: buttonColors.teal,
        tab: tabColors.teal,
        pill: pillColors.teal,
        tokens: themeTokens.teal,
    },
    violet: {
        title: "text-violet-950",
        dot: "bg-violet-500",
        active: "bg-violet-200 text-green-950",
        panel: panelColors.violet,
        card: cardColors.violet,
        button: buttonColors.violet,
        tab: tabColors.violet,
        pill: pillColors.violet,
        tokens: themeTokens.violet,
    },
};

export function isDashboardPage(page: string): page is DashboardPage {
    return DASHBOARD_PAGES.includes(page as DashboardPage);
}
