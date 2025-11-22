import { LLMThemeResponse, processTheme } from "../engine";

export const NeonTheme: LLMThemeResponse = {
    slots: {
        "slot_0": {
            hex: "#0a0e27",
            ids: ["t001", "t024", "t030", "t031", "t032", "t033"],
        },
        "slot_1": {
            hex: "#1a1f3a",
            ids: ["t002", "t003"],
        },
        "slot_2": {
            hex: "#2a2f4a",
            ids: ["t004", "t008"],
        },
        "slot_3": {
            hex: "#3a3f5a",
            ids: ["t009", "t010", "t023"],
        },
        "slot_4": {
            hex: "#ffffff",
            ids: ["t005"],
        },
        "slot_5": {
            hex: "#00ffff",
            ids: ["t006", "t018", "t034", "t035"],
        },
        "slot_6": {
            hex: "#ff00ff",
            ids: ["t007", "t019", "t036"],
        },
        "slot_7": {
            hex: "#ff0080",
            ids: ["t012", "t021", "t027", "t028", "t029"],
        },
        "slot_8": {
            hex: "#00ff80",
            ids: ["t013", "t022", "t037"],
        },
        "slot_9": {
            hex: "#4a4f6a",
            ids: ["t011", "t014"],
        },
        "slot_10": {
            hex: "rgba(255,0,255,0.2)",
            ids: ["t015"],
        },
        "slot_11": {
            hex: "rgba(255,0,255,0.4)",
            ids: ["t016"],
        },
        "slot_12": {
            hex: "#00ffff",
            ids: ["t017"],
        },
        "slot_13": {
            hex: "#ffff00",
            ids: ["t020"],
        },
        "slot_14": {
            hex: "#0080ff",
            ids: ["t025", "t026"],
        },
    },
    borderRadius: {
        "t038": "24px",
        "t039": "16px",
        "t040": "24px",
    },
};

export const NeonCssVariables = processTheme(NeonTheme).cssVariables;
