export type PermissionUiTheme = "green" | "amber" | "blue" | "violet";
export type PermissionInfoTone = "pink" | "amber" | "blue" | "violet";

type PermissionUiThemeConfig = {
    selectedClasses: string;
    selectedHoverClasses: string;
    rowHoverClasses: string;
    actionTextClasses: string;
    focusRingClasses: string;
    modelHoverClasses: string;
    badgeColor: "green" | "amber" | "blue" | "violet";
    tipTone: PermissionInfoTone;
    inputClasses: string;
};

const PERMISSION_UI_THEMES: Record<PermissionUiTheme, PermissionUiThemeConfig> =
    {
        green: {
            selectedClasses: "border-green-400 bg-green-50",
            selectedHoverClasses: "hover:bg-green-100",
            rowHoverClasses: "hover:bg-green-50 hover:border-green-300",
            actionTextClasses: "text-green-800 hover:text-green-950",
            focusRingClasses:
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-green-500/60",
            modelHoverClasses:
                "hover:bg-green-50 hover:text-gray-800 hover:border-green-300",
            badgeColor: "green",
            tipTone: "pink",
            inputClasses: "",
        },
        amber: {
            selectedClasses: "border-amber-400 bg-amber-100",
            selectedHoverClasses: "hover:bg-amber-200",
            rowHoverClasses: "hover:bg-amber-50 hover:border-amber-300",
            actionTextClasses: "text-amber-800 hover:text-amber-950",
            focusRingClasses:
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500/60",
            modelHoverClasses:
                "hover:bg-amber-50 hover:text-gray-800 hover:border-amber-300",
            badgeColor: "amber",
            tipTone: "amber",
            inputClasses:
                "bg-amber-100 border-amber-400 focus-visible:border-amber-400 focus-visible:ring-amber-500/60",
        },
        blue: {
            selectedClasses: "border-blue-300 bg-blue-100",
            selectedHoverClasses: "hover:bg-blue-200",
            rowHoverClasses: "hover:bg-blue-50 hover:border-blue-300",
            actionTextClasses: "text-blue-800 hover:text-blue-950",
            focusRingClasses:
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500/60",
            modelHoverClasses:
                "hover:bg-blue-50 hover:text-gray-800 hover:border-blue-300",
            badgeColor: "blue",
            tipTone: "blue",
            inputClasses:
                "bg-blue-50 border-blue-300 focus-visible:border-blue-400 focus-visible:ring-blue-500/60",
        },
        violet: {
            selectedClasses: "border-violet-300 bg-violet-100",
            selectedHoverClasses: "hover:bg-violet-200",
            rowHoverClasses: "hover:bg-violet-50 hover:border-violet-300",
            actionTextClasses: "text-violet-800 hover:text-violet-950",
            focusRingClasses:
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-500/60",
            modelHoverClasses:
                "hover:bg-violet-50 hover:text-gray-800 hover:border-violet-300",
            badgeColor: "violet",
            tipTone: "violet",
            inputClasses:
                "bg-violet-50 border-violet-300 focus-visible:border-violet-400 focus-visible:ring-violet-500/60",
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
