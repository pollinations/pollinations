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
                selectedHoverClasses: "hover:bg-green-100",
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
                selectedHoverClasses: "hover:bg-amber-200",
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
                selectedHoverClasses: "hover:bg-blue-200",
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
                selectedHoverClasses: "hover:bg-violet-200",
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
    text: "bg-blue-100 text-blue-800 border-blue-300",
    image: "bg-pink-100 text-pink-800 border-pink-300",
    video: "bg-teal-100 text-teal-800 border-teal-300",
    audio: "bg-violet-100 text-violet-800 border-violet-300",
} as const;

export function getPermissionUiTheme(
    theme: PermissionUiTheme,
): PermissionUiThemeConfig {
    return PERMISSION_UI_THEMES[theme];
}

export function getPermissionPillClasses(category: string): string {
    const normalized = category.toLowerCase() === "images" ? "image" : category;
    return (
        PERMISSION_CATEGORY_PILLS[
            normalized.toLowerCase() as keyof typeof PERMISSION_CATEGORY_PILLS
        ] ?? ""
    );
}
