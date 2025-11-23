import { type LLMThemeResponse, processTheme } from "../engine";
import type { MacroConfig } from "../macros";
import { macrosToTheme } from "../macros-engine";

const PALETTE = {
    charcoal: "#110518",
    grayDark: "#4a5557",
    gray: "#6e7a7c",
    grayMedium: "#BFCACC",
    grayLight: "#c7d4d6",
    grayUltraLight: "#dce4e6",
    pink: "#ff69b4",
    yellow: "#ecf874",
    cyan: "#74f8ec",
    lime: "#bef264",
};

export const ClassicMacroConfig: MacroConfig = {
    text: {
        primary: PALETTE.charcoal,
        secondary: PALETTE.grayDark,
        tertiary: PALETTE.gray,
        caption: PALETTE.gray,
        inverse: PALETTE.grayUltraLight,
        highlight: PALETTE.yellow,
    },
    surfaces: {
        page: PALETTE.grayLight,
        card: PALETTE.grayMedium,
        base: PALETTE.grayLight,
    },
    inputs: {
        bg: PALETTE.grayUltraLight,
        border: PALETTE.grayMedium,
        placeholder: PALETTE.gray,
    },
    buttons: {
        primary: {
            bg: PALETTE.charcoal,
            border: PALETTE.charcoal,
        },
        secondary: {
            bg: PALETTE.yellow,
            border: PALETTE.yellow,
        },
        ghost: {
            disabledBg: PALETTE.grayUltraLight,
            hoverOverlay: PALETTE.yellow,
            activeOverlay: PALETTE.yellow,
            focusRing: PALETTE.pink,
        },
    },
    borders: {
        highlight: PALETTE.yellow,
        main: PALETTE.gray,
        strong: PALETTE.charcoal,
        subtle: PALETTE.grayMedium,
        faint: PALETTE.grayMedium,
    },
    shadows: {
        brand: {
            sm: PALETTE.pink,
            md: PALETTE.pink,
            lg: PALETTE.pink,
        },
        dark: {
            sm: PALETTE.charcoal,
            md: PALETTE.charcoal,
            lg: PALETTE.charcoal,
            xl: PALETTE.charcoal,
        },
        highlight: {
            sm: PALETTE.lime,
            md: PALETTE.lime,
        },
    },
    brandSpecial: {
        brandMain: PALETTE.pink,
        logoMain: PALETTE.pink,
        logoAccent: PALETTE.yellow,
        indicatorImage: PALETTE.pink,
        indicatorText: PALETTE.yellow,
        indicatorAudio: PALETTE.cyan,
    },
    typography: {
        title: "Maven Pro",
        headline: "Mako",
        body: "Duru Sans",
    },
    radius: {
        button: "0px",
        card: "0px",
        input: "0px",
        subcard: "0px",
    },
};

export const ClassicTheme: LLMThemeResponse = macrosToTheme(ClassicMacroConfig);

export const ClassicCssVariables = processTheme(ClassicTheme).cssVariables;
