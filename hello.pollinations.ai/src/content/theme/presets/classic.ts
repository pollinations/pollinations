import { type LLMThemeResponse } from "../engine";
import type { MacroConfig } from "../macros";
import { macrosToTheme } from "../macros-engine";

// Define the 10-color palette used in Classic Theme
const PALETTE = {
    charcoal: "#110518", // slot_0
    grayDark: "#4a5557", // slot_1
    gray: "#6e7a7c", // slot_2
    grayMedium: "#BFCACC", // slot_3
    grayLight: "#c7d4d6", // slot_4
    grayUltraLight: "#dce4e6", // slot_5
    pink: "#ff69b4", // slot_6
    yellow: "#ecf874", // slot_7
    cyan: "#74f8ec", // slot_8
    lime: "#bef264", // slot_9
};

export const ClassicMacroConfig: MacroConfig = {
    text: {
        primary: PALETTE.charcoal, // t001 -> slot_0
        secondary: PALETTE.grayDark, // t002 -> slot_1
        tertiary: PALETTE.gray, // t003 -> slot_2
        caption: PALETTE.gray, // t004 -> slot_2
        inverse: PALETTE.grayUltraLight, // t005 -> slot_5
        // brand removed in v1.1
        highlight: PALETTE.yellow, // t007 -> slot_7
    },
    surfaces: {
        page: PALETTE.grayLight, // t008 -> slot_4
        card: PALETTE.grayMedium, // t009 -> slot_3
        base: PALETTE.grayLight, // t010 -> slot_4
    },
    inputs: {
        bg: PALETTE.grayUltraLight, // t011 -> slot_5
        border: PALETTE.grayMedium, // new v1.1
        placeholder: PALETTE.gray, // new v1.1
    },
    buttons: {
        primary: {
            bg: PALETTE.charcoal, // t012 -> slot_0
            border: PALETTE.charcoal, // new v1.1
        },
        secondary: {
            bg: PALETTE.yellow, // t013 -> slot_7
            border: PALETTE.yellow, // new v1.1
        },
        ghost: {
            disabledBg: PALETTE.grayUltraLight, // t014 -> slot_5
            hoverOverlay: PALETTE.yellow, // t015 -> slot_7
            activeOverlay: PALETTE.yellow, // t016 -> slot_7
            focusRing: PALETTE.pink, // t017 -> slot_6
        },
    },
    borders: {
        // brand removed in v1.1
        highlight: PALETTE.yellow, // t022 -> slot_7
        main: PALETTE.gray, // t023 -> slot_2
        strong: PALETTE.charcoal, // t024 -> slot_0
        subtle: PALETTE.grayMedium, // t025 -> slot_3
        faint: PALETTE.grayMedium, // t026 -> slot_3
    },
    shadows: {
        brand: {
            sm: PALETTE.pink, // t027 -> slot_6
            md: PALETTE.pink, // t028 -> slot_6
            lg: PALETTE.pink, // t029 -> slot_6
        },
        dark: {
            sm: PALETTE.charcoal, // t030 -> slot_0
            md: PALETTE.charcoal, // t031 -> slot_0
            lg: PALETTE.charcoal, // t032 -> slot_0
            xl: PALETTE.charcoal, // t033 -> slot_0
        },
        highlight: {
            sm: PALETTE.lime, // t034 -> slot_9
            md: PALETTE.lime, // t035 -> slot_9
        },
    },
    brandSpecial: {
        brandMain: PALETTE.pink, // new v1.1 (was brand text/border)
        logoMain: PALETTE.pink, // t036 -> slot_6
        logoAccent: PALETTE.yellow, // t037 -> slot_7
        indicatorImage: PALETTE.pink, // t018 -> slot_6
        indicatorText: PALETTE.yellow, // t019 -> slot_7
        indicatorAudio: PALETTE.cyan, // t020 -> slot_8
    },
    typography: {
        title: "Maven Pro", // t041
        headline: "Mako", // t042
        body: "Duru Sans", // t043
    },
    radius: {
        button: "0px", // t038
        card: "0px", // t039
        input: "0px", // t040
        subcard: "0px", // t044
    },
};

export const ClassicTheme: LLMThemeResponse = macrosToTheme(ClassicMacroConfig);

// Export CSS variables for use in tailwind.config.ts and auto-discovery
export const ClassicCssVariables = {} as Record<string, string>; // This will be populated by processTheme when needed
