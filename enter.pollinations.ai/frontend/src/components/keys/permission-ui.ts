export type PermissionUiTheme = "amber" | "blue";

type PermissionUiFrameConfig = {
    selectedClasses: string;
    selectedHoverClasses: string;
    rowHoverClasses: string;
    focusRingClasses: string;
};

type PermissionUiAccentConfig = {
    actionTextClasses: string;
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
                selectedClasses: "border-accent-amber-400 bg-accent-amber-100",
                selectedHoverClasses:
                    "hover:bg-accent-amber-200 hover:border-accent-amber-500",
                rowHoverClasses:
                    "hover:bg-accent-amber-50 hover:border-accent-amber-300",
                focusRingClasses:
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-amber-500/60",
            },
            accent: {
                actionTextClasses:
                    "text-accent-amber-800 hover:text-accent-amber-950",
            },
            input: {
                classes:
                    "bg-accent-amber-100 border-accent-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-amber-500/60 focus-visible:border-accent-amber-500",
            },
        },
        blue: {
            row: {
                selectedClasses: "border-accent-blue-300 bg-accent-blue-100",
                selectedHoverClasses:
                    "hover:bg-accent-blue-200 hover:border-accent-blue-400",
                rowHoverClasses:
                    "hover:bg-accent-blue-50 hover:border-accent-blue-300",
                focusRingClasses:
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-blue-500/60",
            },
            accent: {
                actionTextClasses:
                    "text-accent-blue-800 hover:text-accent-blue-950",
            },
            input: {
                classes:
                    "bg-accent-blue-50 border-accent-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue-500/60 focus-visible:border-accent-blue-300",
            },
        },
    };

export function getPermissionUiTheme(
    theme: PermissionUiTheme = "blue",
): PermissionUiThemeConfig {
    return PERMISSION_UI_THEMES[theme];
}
