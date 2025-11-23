import type { LLMThemeResponse } from "../engine";
import { processTheme } from "../engine";

export const SnowTheme: LLMThemeResponse = {
    slots: {
        slot_0: {
            hex: "#223344",
            ids: ["text.primary", "text.secondary", "logo.main"],
        },
        slot_1: {
            hex: "#405066",
            ids: [
                "text.tertiary",
                "text.caption",
                "input.placeholder",
                "border.strong",
            ],
        },
        slot_2: {
            hex: "#FFFFFF",
            ids: ["text.inverse"],
        },
        slot_3: {
            hex: "#1E76B8",
            ids: ["text.brand"],
        },
        slot_4: {
            hex: "#82CEE8",
            ids: ["text.highlight", "border.highlight", "logo.accent"],
        },
        slot_5: {
            hex: "#F6FAFD",
            ids: ["surface.page"],
        },
        slot_6: {
            hex: "#E5EFF6",
            ids: ["surface.card", "border.subtle"],
        },
        slot_7: {
            hex: "#D9E3ED",
            ids: ["surface.base"],
        },
        slot_8: {
            hex: "#F0F3F7",
            ids: ["input.bg", "input.border", "border.faint"],
        },
        slot_9: {
            hex: "#2494D1",
            ids: ["button.primary.bg", "button.primary.border", "border.brand"],
        },
        slot_10: {
            hex: "#D6E6F4",
            ids: ["button.secondary.bg", "button.secondary.border"],
        },
        slot_11: {
            hex: "#BCCEDB",
            ids: ["button.disabled.bg"],
        },
        slot_12: {
            hex: "rgba(58,120,168,0.12)",
            ids: ["button.hover.overlay"],
        },
        slot_13: {
            hex: "rgba(37,117,183,0.14)",
            ids: ["button.active.overlay"],
        },
        slot_14: {
            hex: "#A2CAE3",
            ids: ["button.focus.ring"],
        },
        slot_15: {
            hex: "#B4F3F2",
            ids: ["indicator.image"],
        },
        slot_16: {
            hex: "#DFF3C9",
            ids: ["indicator.text"],
        },
        slot_17: {
            hex: "#BEBBFB",
            ids: ["indicator.audio"],
        },
        slot_18: {
            hex: "#B3C4D6",
            ids: ["border.main"],
        },
        slot_19: {
            hex: "rgba(36,148,209,0.08)",
            ids: ["shadow.brand.sm"],
        },
        slot_20: {
            hex: "rgba(36,148,209,0.14)",
            ids: ["shadow.brand.md"],
        },
        slot_21: {
            hex: "rgba(36,148,209,0.20)",
            ids: ["shadow.brand.lg"],
        },
        slot_22: {
            hex: "rgba(34,51,68,0.10)",
            ids: ["shadow.dark.sm"],
        },
        slot_23: {
            hex: "rgba(34,51,68,0.20)",
            ids: ["shadow.dark.md"],
        },
        slot_24: {
            hex: "rgba(34,51,68,0.30)",
            ids: ["shadow.dark.lg"],
        },
        slot_25: {
            hex: "rgba(34,51,68,0.42)",
            ids: ["shadow.dark.xl"],
        },
        slot_26: {
            hex: "rgba(130,206,232,0.10)",
            ids: ["shadow.highlight.sm"],
        },
        slot_27: {
            hex: "rgba(130,206,232,0.20)",
            ids: ["shadow.highlight.md"],
        },
    },
    borderRadius: {
        "radius.button": "10px",
        "radius.card": "12px",
        "radius.input": "10px",
        "radius.subcard": "12px",
    },
    fonts: {
        "font.title": "Playfair Display",
        "font.headline": "Maven Pro",
        "font.body": "Open Sans",
    },
};

export const SnowCssVariables = processTheme(SnowTheme).cssVariables;
