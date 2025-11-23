import type { LLMThemeResponse } from "../engine";
import { processTheme } from "../engine";

export const MinimalTheme: LLMThemeResponse = {
    slots: {
        slot_0: {
            hex: "#000000",
            ids: [
                "text.primary",
                "text.secondary",
                "text.tertiary",
                "text.caption",
                "text.brand",
                "text.highlight",
                "button.primary.bg",
                "button.primary.border",
                "border.strong",
                "shadow.dark.sm",
                "shadow.dark.md",
                "shadow.dark.lg",
                "shadow.dark.xl",
                "logo.main",
            ],
        },
        slot_1: {
            hex: "#ffffff",
            ids: [
                "text.inverse",
                "surface.page",
                "surface.card",
                "surface.base",
                "input.bg",
                "input.border",
            ],
        },
        slot_2: {
            hex: "#e0e0e0",
            ids: [
                "button.secondary.bg",
                "button.secondary.border",
                "button.disabled.bg",
            ],
        },
        slot_3: {
            hex: "#000000",
            ids: ["border.brand", "border.main"],
        },
        slot_4: {
            hex: "#f5f5f5",
            ids: ["border.subtle", "border.faint"],
        },
        slot_5: {
            hex: "rgba(0,0,0,0.05)",
            ids: [
                "button.hover.overlay",
                "shadow.brand.sm",
                "shadow.highlight.sm",
            ],
        },
        slot_6: {
            hex: "rgba(0,0,0,0.1)",
            ids: [
                "button.active.overlay",
                "shadow.brand.md",
                "shadow.highlight.md",
            ],
        },
        slot_7: {
            hex: "rgba(0,0,0,0.15)",
            ids: ["shadow.brand.lg"],
        },
        slot_8: {
            hex: "#000000",
            ids: ["button.focus.ring", "border.highlight"],
        },
        slot_9: {
            hex: "#808080",
            ids: [
                "input.placeholder",
                "indicator.image",
                "indicator.text",
                "indicator.audio",
                "logo.accent",
            ],
        },
    },
    borderRadius: {
        "radius.button": "0px",
        "radius.card": "0px",
        "radius.input": "0px",
        "radius.subcard": "0px",
    },
    fonts: {
        "font.title": "Inter",
        "font.headline": "Inter",
        "font.body": "Roboto",
    },
};

export const MinimalCssVariables = processTheme(MinimalTheme).cssVariables;
