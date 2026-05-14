export type PermissionUiTheme = "amber" | "blue";
export type PermissionInfoTone = "amber" | "blue";

type PermissionUiFrameConfig = {
    selectedClasses: string;
    selectedHoverClasses: string;
    rowHoverClasses: string;
    focusRingClasses: string;
};

type PermissionUiAccentConfig = {
    actionTextClasses: string;
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
        amber: {
            row: {
                selectedClasses: "border-amber-400 bg-amber-100",
                selectedHoverClasses:
                    "hover:bg-amber-200 hover:border-amber-500",
                rowHoverClasses: "hover:bg-amber-50 hover:border-amber-300",
                focusRingClasses:
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500/60",
            },
            accent: {
                actionTextClasses: "text-amber-800 hover:text-amber-950",
                tipTone: "amber",
            },
            input: {
                classes:
                    "bg-amber-100 border-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 focus-visible:border-amber-500",
            },
        },
        blue: {
            row: {
                selectedClasses: "border-blue-300 bg-blue-100",
                selectedHoverClasses: "hover:bg-blue-200 hover:border-blue-400",
                rowHoverClasses: "hover:bg-blue-50 hover:border-blue-300",
                focusRingClasses:
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500/60",
            },
            accent: {
                actionTextClasses: "text-blue-800 hover:text-blue-950",
                tipTone: "blue",
            },
            input: {
                classes:
                    "bg-blue-50 border-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:border-blue-300",
            },
        },
    };

export function getPermissionUiTheme(
    theme: PermissionUiTheme = "blue",
): PermissionUiThemeConfig {
    return PERMISSION_UI_THEMES[theme];
}
