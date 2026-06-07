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

// Themed, mode-aware classes. The hue is no longer baked into the class names —
// each consumer sets `data-theme={theme}` on its root so these tokens resolve to
// the right accent (blue/amber/…) AND flip correctly in dark mode. Both theme
// keys therefore share one config.
const FRAME: PermissionUiThemeConfig = {
    row: {
        selectedClasses: "border-theme-border bg-theme-bg-active",
        selectedHoverClasses:
            "hover:bg-theme-bg-hover hover:border-theme-border",
        rowHoverClasses: "hover:bg-theme-bg-pale hover:border-theme-border",
        focusRingClasses:
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-theme-border",
    },
    accent: {
        actionTextClasses: "text-theme-text-soft hover:text-theme-text-strong",
    },
    input: {
        classes:
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-border focus-visible:border-theme-border",
    },
};

const PERMISSION_UI_THEMES: Record<PermissionUiTheme, PermissionUiThemeConfig> =
    {
        amber: FRAME,
        blue: FRAME,
    };

export function getPermissionUiTheme(
    theme: PermissionUiTheme = "blue",
): PermissionUiThemeConfig {
    return PERMISSION_UI_THEMES[theme];
}
