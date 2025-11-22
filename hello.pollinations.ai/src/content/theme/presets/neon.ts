import { LLMThemeResponse, processTheme } from "../engine";

export const NeonTheme: LLMThemeResponse = {
    slots: {
        slot_0: {
            hex: "#0a0e27",
            ids: [
                "text.primary",
                "border.strong",
                "shadow.dark.sm",
                "shadow.dark.md",
                "shadow.dark.lg",
                "shadow.dark.xl",
            ],
        },
        slot_1: {
            hex: "#1a1f3a",
            ids: ["text.secondary", "text.tertiary"],
        },
        slot_2: {
            hex: "#2a2f4a",
            ids: ["text.caption", "surface.page"],
        },
        slot_3: {
            hex: "#3a3f5a",
            ids: ["surface.card", "surface.base", "border.main"],
        },
        slot_4: {
            hex: "#ffffff",
            ids: ["text.inverse"],
        },
        slot_5: {
            hex: "#00ffff",
            ids: [
                "text.brand",
                "indicator.image",
                "shadow.highlight.sm",
                "shadow.highlight.md",
            ],
        },
        slot_6: {
            hex: "#ff00ff",
            ids: ["text.highlight", "indicator.text", "logo.main"],
        },
        slot_7: {
            hex: "#ff0080",
            ids: [
                "button.primary.bg",
                "border.brand",
                "shadow.brand.sm",
                "shadow.brand.md",
                "shadow.brand.lg",
            ],
        },
        slot_8: {
            hex: "#00ff80",
            ids: ["button.secondary.bg", "border.highlight", "logo.accent"],
        },
        slot_9: {
            hex: "#4a4f6a",
            ids: ["input.bg", "button.ghost.disabledBg"],
        },
        slot_10: {
            hex: "rgba(255,0,255,0.2)",
            ids: ["button.ghost.hoverOverlay"],
        },
        slot_11: {
            hex: "rgba(255,0,255,0.4)",
            ids: ["button.ghost.activeOverlay"],
        },
        slot_12: {
            hex: "#00ffff",
            ids: ["button.ghost.focusRing"],
        },
        slot_13: {
            hex: "#ffff00",
            ids: ["indicator.audio"],
        },
        slot_14: {
            hex: "#0080ff",
            ids: ["border.subtle", "border.faint"],
        },
    },
    borderRadius: {
        "radius.button": "24px",
        "radius.card": "16px",
        "radius.input": "16px",
        "radius.subcard": "12px",
    },
    fonts: {
        "font.title": "Orbitron",
        "font.headline": "Rajdhani",
        "font.body": "Exo 2",
    },
};

export const NeonCssVariables = processTheme(NeonTheme).cssVariables;
