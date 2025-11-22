import { LLMThemeResponse, processTheme } from "../engine";

export const ClassicTheme: LLMThemeResponse = {
    slots: {
        "slot_0": {
            hex: "#110518",
            ids: [
                "t001", // text.body.main
                "t012", // button.primary.background
                "t024", // border.strong
                "t030", // shadow.dark.sm
                "t031", // shadow.dark.md
                "t032", // shadow.dark.lg
                "t033", // shadow.dark.xl
            ],
        },
        "slot_1": {
            hex: "#4a5557",
            ids: [
                "t002", // text.body.secondary
            ],
        },
        "slot_2": {
            hex: "#6e7a7c",
            ids: [
                "t004", // text.caption
                "t003", // text.body.tertiary
                "t023", // border.main
            ],
        },
        "slot_3": {
            hex: "#BFCACC",
            ids: [
                "t009", // surface.card
                "t025", // border.subtle
                "t026", // border.faint
            ],
        },
        "slot_4": {
            hex: "#c7d4d6",
            ids: [
                "t008", // surface.page
                "t010", // surface.base
            ],
        },
        "slot_5": {
            hex: "#dce4e6",
            ids: [
                "t005", // text.on-color
                "t011", // input.background
                "t014", // button.disabled.background
            ],
        },
        "slot_6": {
            hex: "#ff69b4",
            ids: [
                "t006", // text.brand
                "t018", // indicator.image
                "t021", // border.brand
                "t027", // shadow.brand.sm
                "t028", // shadow.brand.md
                "t029", // shadow.brand.lg
                "t017", // button.focus.ring
                "t036", // logo.main
            ],
        },
        "slot_7": {
            hex: "#ecf874",
            ids: [
                "t007", // text.highlight
                "t013", // button.secondary.background
                "t019", // indicator.text
                "t022", // border.highlight
                "t015", // button.hover.overlay
                "t016", // button.active.overlay
                "t037", // logo.shade
            ],
        },
        "slot_8": {
            hex: "#74f8ec",
            ids: [
                "t020", // indicator.audio
            ],
        },
        "slot_9": {
            hex: "#bef264",
            ids: [
                "t034", // shadow.highlight.sm
                "t035", // shadow.highlight.md
            ],
        },
    },
    borderRadius: {
        "t038": "0px", // button.radius
        "t039": "0px", // card.radius
        "t040": "0px", // input.radius
        "t044": "0px", // sub-card.radius
    },
    fonts: {
        t041: "Maven Pro", // Title
        t042: "Mako", // Headline
        t043: "Duru Sans", // Body
    },
};

// Export default CSS variables for use in tailwind.config.ts
export const ClassicCssVariables = processTheme(ClassicTheme).cssVariables;
