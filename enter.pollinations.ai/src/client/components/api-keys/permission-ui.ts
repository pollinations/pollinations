export type PermissionUiTheme = "green" | "amber" | "blue" | "violet";
export type PermissionInfoTone = "pink" | "amber" | "blue" | "violet";

type PermissionUiFrameConfig = {
    selectedClasses: string;
    selectedHoverClasses: string;
    rowHoverClasses: string;
    focusRingClasses: string;
    modelHoverClasses: string;
};

type PermissionUiAccentConfig = {
    actionTextClasses: string;
    badgeColor: "green" | "amber" | "blue" | "violet";
    tipTone: PermissionInfoTone;
};

type PermissionUiInputConfig = {
    classes: string;
};

type PermissionUiThemeConfig = {
    row: PermissionUiFrameConfig;
    accent: PermissionUiAccentConfig;
    input: PermissionUiInputConfig;
};

const PERMISSION_UI_THEMES: Record<PermissionUiTheme, PermissionUiThemeConfig> =
    {
        green: {
            row: {
                selectedClasses: "border-green-400 bg-green-50",
                selectedHoverClasses:
                    "hover:bg-green-100 hover:border-green-500",
                rowHoverClasses: "hover:bg-green-50 hover:border-green-300",
                focusRingClasses:
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-green-500/60",
                modelHoverClasses:
                    "hover:bg-green-50 hover:text-gray-800 hover:border-green-300",
            },
            accent: {
                actionTextClasses: "text-green-800 hover:text-green-950",
                badgeColor: "green",
                tipTone: "pink",
            },
            input: {
                classes: "",
            },
        },
        amber: {
            row: {
                selectedClasses: "border-amber-400 bg-amber-100",
                selectedHoverClasses:
                    "hover:bg-amber-200 hover:border-amber-500",
                rowHoverClasses: "hover:bg-amber-50 hover:border-amber-300",
                focusRingClasses:
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500/60",
                modelHoverClasses:
                    "hover:bg-amber-50 hover:text-gray-800 hover:border-amber-300",
            },
            accent: {
                actionTextClasses: "text-amber-800 hover:text-amber-950",
                badgeColor: "amber",
                tipTone: "amber",
            },
            input: {
                classes:
                    "bg-amber-100 border-amber-400 focus-visible:border-amber-400 focus-visible:ring-amber-500/60",
            },
        },
        blue: {
            row: {
                selectedClasses: "border-blue-300 bg-blue-100",
                selectedHoverClasses: "hover:bg-blue-200 hover:border-blue-400",
                rowHoverClasses: "hover:bg-blue-50 hover:border-blue-300",
                focusRingClasses:
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500/60",
                modelHoverClasses:
                    "hover:bg-blue-50 hover:text-gray-800 hover:border-blue-300",
            },
            accent: {
                actionTextClasses: "text-blue-800 hover:text-blue-950",
                badgeColor: "blue",
                tipTone: "blue",
            },
            input: {
                classes:
                    "bg-blue-50 border-blue-300 focus-visible:border-blue-400 focus-visible:ring-blue-500/60",
            },
        },
        violet: {
            row: {
                selectedClasses: "border-violet-300 bg-violet-100",
                selectedHoverClasses:
                    "hover:bg-violet-200 hover:border-violet-400",
                rowHoverClasses: "hover:bg-violet-50 hover:border-violet-300",
                focusRingClasses:
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-500/60",
                modelHoverClasses:
                    "hover:bg-violet-50 hover:text-gray-800 hover:border-violet-300",
            },
            accent: {
                actionTextClasses: "text-violet-800 hover:text-violet-950",
                badgeColor: "violet",
                tipTone: "violet",
            },
            input: {
                classes:
                    "bg-violet-50 border-violet-300 focus-visible:border-violet-400 focus-visible:ring-violet-500/60",
            },
        },
    };

const PERMISSION_CATEGORY_PILLS = {
    text: "bg-blue-200 text-blue-900 border-blue-400",
    image: "bg-pink-200 text-pink-900 border-pink-400",
    video: "bg-teal-200 text-teal-900 border-teal-400",
    audio: "bg-violet-200 text-violet-900 border-violet-400",
    embedding: "bg-indigo-200 text-indigo-900 border-indigo-400",
} as const;

export function getPermissionUiTheme(
    theme: PermissionUiTheme,
): PermissionUiThemeConfig {
    return PERMISSION_UI_THEMES[theme];
}

export function getPermissionPillClasses(category: string): string {
    const normalized =
        category.toLowerCase() === "images"
            ? "image"
            : category.toLowerCase() === "embeddings"
              ? "embedding"
              : category;
    return (
        PERMISSION_CATEGORY_PILLS[
            normalized.toLowerCase() as keyof typeof PERMISSION_CATEGORY_PILLS
        ] ?? ""
    );
}
