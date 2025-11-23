import { LLMThemeResponse, processTheme } from "../theme/engine";

export const CustomTheme: LLMThemeResponse = {
    "slots": {
        "slot_0": {
            "hex": "#1D3B2A",
            "ids": [
                "text.primary",
                "button.primary.border",
                "border.strong"
            ]
        },
        "slot_1": {
            "hex": "#267C6A",
            "ids": [
                "text.secondary",
                "indicator.text",
                "border.main",
                "logo.main"
            ]
        },
        "slot_2": {
            "hex": "#5DBF82",
            "ids": [
                "text.tertiary",
                "input.placeholder",
                "indicator.image"
            ]
        },
        "slot_3": {
            "hex": "#209FA1",
            "ids": [
                "text.caption",
                "text.brand",
                "button.primary.bg",
                "button.secondary.border",
                "border.brand"
            ]
        },
        "slot_4": {
            "hex": "#FFFFFF",
            "ids": [
                "text.inverse",
                "input.bg"
            ]
        },
        "slot_5": {
            "hex": "#FFA851",
            "ids": [
                "text.highlight",
                "button.secondary.bg",
                "button.focus.ring",
                "indicator.audio",
                "border.highlight",
                "logo.accent"
            ]
        },
        "slot_6": {
            "hex": "#F6FFED",
            "ids": [
                "surface.page"
            ]
        },
        "slot_7": {
            "hex": "#EAF9D5",
            "ids": [
                "surface.card",
                "border.faint"
            ]
        },
        "slot_8": {
            "hex": "#B2E4DD",
            "ids": [
                "surface.base",
                "button.disabled.bg"
            ]
        },
        "slot_9": {
            "hex": "#90D8C7",
            "ids": [
                "input.border",
                "border.subtle"
            ]
        },
        "slot_10": {
            "hex": "#209FA188",
            "ids": [
                "button.hover.overlay",
                "shadow.brand.lg"
            ]
        },
        "slot_11": {
            "hex": "#209FA1CC",
            "ids": [
                "button.active.overlay"
            ]
        },
        "slot_12": {
            "hex": "#209FA122",
            "ids": [
                "shadow.brand.sm"
            ]
        },
        "slot_13": {
            "hex": "#209FA14D",
            "ids": [
                "shadow.brand.md"
            ]
        },
        "slot_14": {
            "hex": "#1D3B2A1A",
            "ids": [
                "shadow.dark.sm"
            ]
        },
        "slot_15": {
            "hex": "#1D3B2A33",
            "ids": [
                "shadow.dark.md"
            ]
        },
        "slot_16": {
            "hex": "#1D3B2A55",
            "ids": [
                "shadow.dark.lg"
            ]
        },
        "slot_17": {
            "hex": "#1D3B2A88",
            "ids": [
                "shadow.dark.xl"
            ]
        },
        "slot_18": {
            "hex": "#FFA85133",
            "ids": [
                "shadow.highlight.sm"
            ]
        },
        "slot_19": {
            "hex": "#FFA85166",
            "ids": [
                "shadow.highlight.md"
            ]
        }
    },
    "borderRadius": {
        "radius.button": "12px",
        "radius.input": "12px",
        "radius.card": "16px"
    },
    "fonts": {
        "font.title": "Pacifico",
        "font.headline": "Montserrat",
        "font.body": "Nunito"
    }
};

export const CustomCssVariables = processTheme(CustomTheme).cssVariables;
