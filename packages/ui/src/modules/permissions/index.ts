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
                selectedClasses: "polli:border-amber-400 polli:bg-amber-100",
                selectedHoverClasses:
                    "polli:hover:bg-amber-200 polli:hover:border-amber-500",
                rowHoverClasses:
                    "polli:hover:bg-amber-50 polli:hover:border-amber-300",
                focusRingClasses:
                    "polli:focus-visible:outline-none polli:focus-visible:ring-1 polli:focus-visible:ring-amber-500/60",
            },
            accent: {
                actionTextClasses:
                    "polli:text-amber-800 polli:hover:text-amber-950",
                tipTone: "amber",
            },
            input: {
                classes:
                    "polli:bg-amber-100 polli:border-amber-400 polli:focus-visible:outline-none polli:focus-visible:ring-2 polli:focus-visible:ring-amber-500/60 polli:focus-visible:border-amber-500",
            },
        },
        blue: {
            row: {
                selectedClasses: "polli:border-blue-300 polli:bg-blue-100",
                selectedHoverClasses:
                    "polli:hover:bg-blue-200 polli:hover:border-blue-400",
                rowHoverClasses:
                    "polli:hover:bg-blue-50 polli:hover:border-blue-300",
                focusRingClasses:
                    "polli:focus-visible:outline-none polli:focus-visible:ring-1 polli:focus-visible:ring-blue-500/60",
            },
            accent: {
                actionTextClasses:
                    "polli:text-blue-800 polli:hover:text-blue-950",
                tipTone: "blue",
            },
            input: {
                classes:
                    "polli:bg-blue-50 polli:border-blue-200 polli:focus-visible:outline-none polli:focus-visible:ring-2 polli:focus-visible:ring-blue-500/60 polli:focus-visible:border-blue-300",
            },
        },
    };

export function getPermissionUiTheme(
    theme: PermissionUiTheme = "blue",
): PermissionUiThemeConfig {
    return PERMISSION_UI_THEMES[theme];
}
