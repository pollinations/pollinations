import { LLMThemeResponse, processTheme } from "../theme/engine";

export const CustomTheme: LLMThemeResponse = {
    "slots": {
        "slot_0": {
            "hex": "#F9FAFB",
            "ids": [
                "text.primary",
                "logo.main"
            ]
        },
        "slot_1": {
            "hex": "#D1D5DB",
            "ids": [
                "text.secondary"
            ]
        },
        "slot_2": {
            "hex": "#7B809A",
            "ids": [
                "text.tertiary"
            ]
        },
        "slot_3": {
            "hex": "#5B5F73",
            "ids": [
                "text.caption"
            ]
        },
        "slot_4": {
            "hex": "#16192A",
            "ids": [
                "text.inverse",
                "surface.page"
            ]
        },
        "slot_5": {
            "hex": "#AA2A3D",
            "ids": [
                "text.brand",
                "text.highlight",
                "button.primary.bg",
                "button.active.overlay",
                "button.focus.ring",
                "indicator.text",
                "border.brand",
                "border.highlight",
                "border.strong",
                "shadow.brand.sm",
                "shadow.highlight.sm",
                "logo.accent"
            ]
        },
        "slot_6": {
            "hex": "#22253A",
            "ids": [
                "surface.card",
                "input.bg",
                "shadow.dark.md"
            ]
        },
        "slot_7": {
            "hex": "#1B1E33",
            "ids": [
                "surface.base"
            ]
        },
        "slot_8": {
            "hex": "#363956",
            "ids": [
                "input.border",
                "border.main"
            ]
        },
        "slot_9": {
            "hex": "#7C7F9B",
            "ids": [
                "input.placeholder"
            ]
        },
        "slot_10": {
            "hex": "#C14C6A",
            "ids": [
                "button.primary.border",
                "indicator.audio",
                "shadow.highlight.md"
            ]
        },
        "slot_11": {
            "hex": "#282B46",
            "ids": [
                "button.secondary.bg",
                "border.faint"
            ]
        },
        "slot_12": {
            "hex": "#40436A",
            "ids": [
                "button.secondary.border"
            ]
        },
        "slot_13": {
            "hex": "#2E3047",
            "ids": [
                "button.disabled.bg"
            ]
        },
        "slot_14": {
            "hex": "#3B4062",
            "ids": [
                "button.hover.overlay"
            ]
        },
        "slot_15": {
            "hex": "#633145",
            "ids": [
                "indicator.image",
                "shadow.brand.md"
            ]
        },
        "slot_16": {
            "hex": "#525676",
            "ids": [
                "border.subtle"
            ]
        },
        "slot_17": {
            "hex": "#300E1C",
            "ids": [
                "shadow.brand.lg"
            ]
        },
        "slot_18": {
            "hex": "#1A1C2C",
            "ids": [
                "shadow.dark.sm"
            ]
        },
        "slot_19": {
            "hex": "#262849",
            "ids": [
                "shadow.dark.lg"
            ]
        },
        "slot_20": {
            "hex": "#0D0E18",
            "ids": [
                "shadow.dark.xl"
            ]
        }
    },
    "borderRadius": {
        "radius.button": "4px",
        "radius.card": "4px",
        "radius.input": "4px",
        "radius.subcard": "4px"
    },
    "fonts": {
        "font.title": "Cinzel",
        "font.headline": "Lora",
        "font.body": "Roboto"
    }
};

export const CustomCssVariables = processTheme(CustomTheme).cssVariables;
