type PermissionUiFrameConfig = {
    selectedClasses: string;
    selectedHoverClasses: string;
    rowHoverClasses: string;
    focusRingClasses: string;
};

type PermissionUiThemeConfig = {
    row: PermissionUiFrameConfig;
};

// Mode-aware classes. The hue is no longer baked into the class names — the
// surrounding dialog scopes its subtree with the ambient accent, so these
// `theme-*` tokens resolve to it AND flip correctly in dark mode.
export const PERMISSION_UI_THEME: PermissionUiThemeConfig = {
    row: {
        selectedClasses: "border-theme-border bg-theme-bg-active",
        selectedHoverClasses:
            "hover:bg-theme-bg-hover hover:border-theme-border",
        rowHoverClasses: "hover:bg-theme-bg-pale hover:border-theme-border",
        focusRingClasses:
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-theme-border",
    },
};
