import { LLMThemeResponse, processTheme } from "../engine";

export const MinimalTheme: LLMThemeResponse = {
    slots: {
        "slot_0": {
            hex: "#000000",
            ids: [
                "t001",
                "t002",
                "t003",
                "t004",
                "t006",
                "t007",
                "t012",
                "t024",
                "t030",
                "t031",
                "t032",
                "t033",
                "t036",
            ],
        },
        "slot_1": {
            hex: "#ffffff",
            ids: ["t005", "t008", "t009", "t010", "t011"],
        },
        "slot_2": {
            hex: "#e0e0e0",
            ids: ["t013", "t014"],
        },
        "slot_3": {
            hex: "#000000",
            ids: ["t021", "t023"],
        },
        "slot_4": {
            hex: "#f5f5f5",
            ids: ["t025", "t026"],
        },
        "slot_5": {
            hex: "rgba(0,0,0,0.05)",
            ids: ["t015", "t027", "t034"],
        },
        "slot_6": {
            hex: "rgba(0,0,0,0.1)",
            ids: ["t016", "t028", "t035"],
        },
        "slot_7": {
            hex: "rgba(0,0,0,0.15)",
            ids: ["t029"],
        },
        "slot_8": {
            hex: "#000000",
            ids: ["t017", "t022"],
        },
        "slot_9": {
            hex: "#808080",
            ids: ["t018", "t019", "t020", "t037"],
        },
    },
    borderRadius: {
        "t038": "0px", // Button
        "t039": "0px", // Card
        "t040": "0px", // Input
    },
    fonts: {
        "t041": "Inter", // Title (Clean/Modern)
        "t042": "Inter", // Headline (Clean/Modern)
        "t043": "Roboto", // Body (Neutral/Readable)
    },
};

export const MinimalCssVariables = processTheme(MinimalTheme).cssVariables;
