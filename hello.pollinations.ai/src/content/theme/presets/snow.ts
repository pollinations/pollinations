import { LLMThemeResponse, processTheme } from "../engine";

export const SnowTheme: LLMThemeResponse = {
    "slots": {
        "slot_0": {
            "hex": "#223344",
            "ids": ["t001", "t002", "t036"],
        },
        "slot_1": {
            "hex": "#405066",
            "ids": ["t003", "t004", "t024"],
        },
        "slot_2": {
            "hex": "#FFFFFF",
            "ids": ["t005"],
        },
        "slot_3": {
            "hex": "#1E76B8",
            "ids": ["t006"],
        },
        "slot_4": {
            "hex": "#82CEE8",
            "ids": ["t007", "t022", "t037"],
        },
        "slot_5": {
            "hex": "#F6FAFD",
            "ids": ["t008"],
        },
        "slot_6": {
            "hex": "#E5EFF6",
            "ids": ["t009", "t025"],
        },
        "slot_7": {
            "hex": "#D9E3ED",
            "ids": ["t010"],
        },
        "slot_8": {
            "hex": "#F0F3F7",
            "ids": ["t011", "t026"],
        },
        "slot_9": {
            "hex": "#2494D1",
            "ids": ["t012", "t021"],
        },
        "slot_10": {
            "hex": "#D6E6F4",
            "ids": ["t013"],
        },
        "slot_11": {
            "hex": "#BCCEDB",
            "ids": ["t014"],
        },
        "slot_12": {
            "hex": "rgba(58,120,168,0.12)",
            "ids": ["t015"],
        },
        "slot_13": {
            "hex": "rgba(37,117,183,0.14)",
            "ids": ["t016"],
        },
        "slot_14": {
            "hex": "#A2CAE3",
            "ids": ["t017"],
        },
        "slot_15": {
            "hex": "#B4F3F2",
            "ids": ["t018"],
        },
        "slot_16": {
            "hex": "#DFF3C9",
            "ids": ["t019"],
        },
        "slot_17": {
            "hex": "#BEBBFB",
            "ids": ["t020"],
        },
        "slot_18": {
            "hex": "#B3C4D6",
            "ids": ["t023"],
        },
        "slot_19": {
            "hex": "rgba(36,148,209,0.08)",
            "ids": ["t027"],
        },
        "slot_20": {
            "hex": "rgba(36,148,209,0.14)",
            "ids": ["t028"],
        },
        "slot_21": {
            "hex": "rgba(36,148,209,0.20)",
            "ids": ["t029"],
        },
        "slot_22": {
            "hex": "rgba(34,51,68,0.10)",
            "ids": ["t030"],
        },
        "slot_23": {
            "hex": "rgba(34,51,68,0.20)",
            "ids": ["t031"],
        },
        "slot_24": {
            "hex": "rgba(34,51,68,0.30)",
            "ids": ["t032"],
        },
        "slot_25": {
            "hex": "rgba(34,51,68,0.42)",
            "ids": ["t033"],
        },
        "slot_26": {
            "hex": "rgba(130,206,232,0.10)",
            "ids": ["t034"],
        },
        "slot_27": {
            "hex": "rgba(130,206,232,0.20)",
            "ids": ["t035"],
        },
    },
    "borderRadius": {
        "t038": "10px",
        "t039": "12px",
        "t040": "10px",
        "t044": "12px",
    },
    "fonts": {
        "t041": "Playfair Display",
        "t042": "Maven Pro",
        "t043": "Open Sans",
    },
};

export const SnowCssVariables = processTheme(SnowTheme).cssVariables;
