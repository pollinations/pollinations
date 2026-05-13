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

// ─── Color palette (single source of truth) ──────────────────
// Button colors moved to the cascade in Phase 4 (read `bg-theme-button-*`).
// Panel/Card are cascade-driven via `<Surface>` since Phase 3.

// Per-theme token bundle for page chrome — literal class strings so Tailwind's JIT picks them up.
// Covers per-page-themed surfaces only: text, borders, backgrounds, dividers, ring accents,
// and scrollbar thumb. Out of scope: neutral grays/reds (loading/error/disabled), tier/modality
// semantic colors, and Chip styling (cascade-driven via `bg-theme-chip-*`).
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
        tokens: ThemeTokens;
    }
> = {
    amber: {
        title: "text-amber-950",
        dot: "bg-amber-500",
        active: "bg-amber-200 text-green-950",
        tokens: themeTokens.amber,
    },
    blue: {
        title: "text-blue-950",
        dot: "bg-blue-500",
        active: "bg-blue-200 text-green-950",
        tokens: themeTokens.blue,
    },
    gray: {
        title: "text-gray-950",
        dot: "bg-gray-500",
        active: "bg-gray-200 text-green-950",
        tokens: themeTokens.gray,
    },
    green: {
        title: "text-green-950",
        dot: "bg-green-500",
        active: "bg-green-200 text-green-950",
        tokens: themeTokens.green,
    },
    pink: {
        title: "text-pink-950",
        dot: "bg-pink-500",
        active: "bg-pink-200 text-green-950",
        tokens: themeTokens.pink,
    },
    teal: {
        title: "text-teal-950",
        dot: "bg-teal-500",
        active: "bg-teal-200 text-green-950",
        tokens: themeTokens.teal,
    },
    violet: {
        title: "text-violet-950",
        dot: "bg-violet-500",
        active: "bg-violet-200 text-green-950",
        tokens: themeTokens.violet,
    },
};

export function isDashboardPage(page: string): page is DashboardPage {
    return DASHBOARD_PAGES.includes(page as DashboardPage);
}
