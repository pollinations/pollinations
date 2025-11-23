import { LLMThemeResponse, processTheme } from "../theme/engine";

export const CustomTheme: LLMThemeResponse = {
    "slots": {
        "slot_0": {
            "hex": "#573a1f",
            "ids": [
                "text.primary",
                "border.strong",
                "logo.main"
            ]
        },
        "slot_1": {
            "hex": "#a86d3c",
            "ids": [
                "text.secondary",
                "button.primary.border",
                "indicator.audio",
                "border.main"
            ]
        },
        "slot_2": {
            "hex": "#c79b82",
            "ids": [
                "text.tertiary",
                "input.placeholder",
                "indicator.image"
            ]
        },
        "slot_3": {
            "hex": "#b98764",
            "ids": [
                "text.caption"
            ]
        },
        "slot_4": {
            "hex": "#fff7e6",
            "ids": [
                "text.inverse",
                "surface.page"
            ]
        },
        "slot_5": {
            "hex": "#d4943c",
            "ids": [
                "text.brand",
                "text.highlight",
                "input.border",
                "button.primary.bg",
                "button.secondary.border",
                "indicator.text",
                "border.brand"
            ]
        },
        "slot_6": {
            "hex": "#fbe3b0",
            "ids": [
                "surface.card",
                "input.bg",
                "border.faint"
            ]
        },
        "slot_7": {
            "hex": "#f6c86a",
            "ids": [
                "surface.base",
                "button.secondary.bg"
            ]
        },
        "slot_8": {
            "hex": "#e5d3ba",
            "ids": [
                "button.disabled.bg"
            ]
        },
        "slot_9": {
            "hex": "#ffaa4477",
            "ids": [
                "button.hover.overlay"
            ]
        },
        "slot_10": {
            "hex": "#d4943cbb",
            "ids": [
                "button.active.overlay"
            ]
        },
        "slot_11": {
            "hex": "#ffae00",
            "ids": [
                "button.focus.ring",
                "border.highlight",
                "logo.accent"
            ]
        },
        "slot_12": {
            "hex": "#daa977",
            "ids": [
                "border.subtle"
            ]
        },
        "slot_13": {
            "hex": "#eca93944",
            "ids": [
                "shadow.brand.sm"
            ]
        },
        "slot_14": {
            "hex": "#d4943c66",
            "ids": [
                "shadow.brand.md"
            ]
        },
        "slot_15": {
            "hex": "#a86d3c99",
            "ids": [
                "shadow.brand.lg"
            ]
        },
        "slot_16": {
            "hex": "#573a1f22",
            "ids": [
                "shadow.dark.sm"
            ]
        },
        "slot_17": {
            "hex": "#573a1f44",
            "ids": [
                "shadow.dark.md"
            ]
        },
        "slot_18": {
            "hex": "#573a1f77",
            "ids": [
                "shadow.dark.lg"
            ]
        },
        "slot_19": {
            "hex": "#573a1fcc",
            "ids": [
                "shadow.dark.xl"
            ]
        },
        "slot_20": {
            "hex": "#ffae001c",
            "ids": [
                "shadow.highlight.sm"
            ]
        },
        "slot_21": {
            "hex": "#ffae003d",
            "ids": [
                "shadow.highlight.md"
            ]
        }
    },
    "borderRadius": {
        "radius.button": "12px",
        "radius.input": "12px",
        "radius.subcard": "12px",
        "radius.card": "16px"
    },
    "fonts": {
        "font.title": "Londrina Solid",
        "font.headline": "Bebas Neue",
        "font.body": "Montserrat"
    }
};

export const CustomCssVariables = processTheme(CustomTheme).cssVariables;
