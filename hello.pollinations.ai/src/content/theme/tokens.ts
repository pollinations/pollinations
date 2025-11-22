export type TokenId = `t${number}`;

export interface DesignToken {
    id: TokenId;
    description: string; // The main human-readable name/description
    category:
        | "text"
        | "surface"
        | "input"
        | "button"
        | "indicator"
        | "border"
        | "shadow"
        | "logo"
        | "radius"
        | "font";
    type: "color" | "radius" | "font";
    contrastWith?: TokenId; // ID of the token this must contrast with
}

export const TOKENS: DesignToken[] = [
    // Text
    {
        id: "t001",
        description: "Primary Body Text",
        category: "text",
        type: "color",
        contrastWith: "t008", // surface.page
    },
    {
        id: "t002",
        description: "Secondary Body Text",
        category: "text",
        type: "color",
        contrastWith: "t008", // surface.page
    },
    {
        id: "t003",
        description: "Tertiary Body Text",
        category: "text",
        type: "color",
        contrastWith: "t008", // surface.page
    },
    {
        id: "t004",
        description: "Caption Text",
        category: "text",
        type: "color",
        contrastWith: "t008", // surface.page
    },
    {
        id: "t005",
        description: "Text on Primary Color",
        category: "text",
        type: "color",
        contrastWith: "t012", // button.primary.background
    },
    {
        id: "t006",
        description: "Brand Colored Text",
        category: "text",
        type: "color",
        contrastWith: "t008", // surface.page
    },
    {
        id: "t007",
        description: "Highlighted Text",
        category: "text",
        type: "color",
        contrastWith: "t013", // Must be readable on secondary/nav buttons when active
    },

    // Surfaces
    {
        id: "t008",
        description: "Page Background",
        category: "surface",
        type: "color",
    },
    {
        id: "t009",
        description: "Card Background",
        category: "surface",
        type: "color",
        contrastWith: "t008", // Should distinguish from page
    },
    {
        id: "t010",
        description: "Base Surface",
        category: "surface",
        type: "color",
    },

    // Input
    {
        id: "t011",
        description: "Input Field Background",
        category: "input",
        type: "color",
        contrastWith: "t001", // Text should be readable in it
    },

    // Buttons
    {
        id: "t012",
        description: "Primary Button Background",
        category: "button",
        type: "color",
        contrastWith: "t008", // Should pop from page
    },
    {
        id: "t013",
        description: "Secondary Button Background",
        category: "button",
        type: "color",
        contrastWith: "t008",
    },
    {
        id: "t014",
        description: "Disabled Button Background",
        category: "button",
        type: "color",
    },
    {
        id: "t015",
        description: "Button Hover Overlay",
        category: "button",
        type: "color",
    },
    {
        id: "t016",
        description: "Button Active Overlay",
        category: "button",
        type: "color",
    },
    {
        id: "t017",
        description: "Button Focus Ring",
        category: "button",
        type: "color",
    },

    // Indicators
    {
        id: "t018",
        description: "Image Generation Indicator",
        category: "indicator",
        type: "color",
    },
    {
        id: "t019",
        description: "Text Generation Indicator",
        category: "indicator",
        type: "color",
    },
    {
        id: "t020",
        description: "Audio Generation Indicator",
        category: "indicator",
        type: "color",
    },

    // Borders
    {
        id: "t021",
        description: "Brand Border",
        category: "border",
        type: "color",
    },
    {
        id: "t022",
        description: "Highlight Border",
        category: "border",
        type: "color",
    },
    {
        id: "t023",
        description: "Main Border",
        category: "border",
        type: "color",
    },
    {
        id: "t024",
        description: "Strong Border",
        category: "border",
        type: "color",
    },
    {
        id: "t025",
        description: "Subtle Border",
        category: "border",
        type: "color",
    },
    {
        id: "t026",
        description: "Faint Border",
        category: "border",
        type: "color",
    },

    // Shadows
    {
        id: "t027",
        description: "Small Brand Shadow",
        category: "shadow",
        type: "color",
    },
    {
        id: "t028",
        description: "Medium Brand Shadow",
        category: "shadow",
        type: "color",
    },
    {
        id: "t029",
        description: "Large Brand Shadow",
        category: "shadow",
        type: "color",
    },
    {
        id: "t030",
        description: "Small Dark Shadow",
        category: "shadow",
        type: "color",
    },
    {
        id: "t031",
        description: "Medium Dark Shadow",
        category: "shadow",
        type: "color",
    },
    {
        id: "t032",
        description: "Large Dark Shadow",
        category: "shadow",
        type: "color",
    },
    {
        id: "t033",
        description: "Extra Large Dark Shadow",
        category: "shadow",
        type: "color",
    },
    {
        id: "t034",
        description: "Small Highlight Shadow",
        category: "shadow",
        type: "color",
    },
    {
        id: "t035",
        description: "Medium Highlight Shadow",
        category: "shadow",
        type: "color",
    },

    // Logos
    {
        id: "t036",
        description: "Main Logo Color",
        category: "logo",
        type: "color",
    },
    {
        id: "t037",
        description: "Logo Shade Color",
        category: "logo",
        type: "color",
    },

    // Radius
    {
        id: "t038",
        description: "Button Radius",
        category: "radius",
        type: "radius",
    },
    {
        id: "t039",
        description: "Card Radius",
        category: "radius",
        type: "radius",
    },
    {
        id: "t040",
        description: "Input Radius",
        category: "radius",
        type: "radius",
    },

    // Typography
    {
        id: "t041",
        description: "Title Font",
        category: "font",
        type: "font",
    },
    {
        id: "t042",
        description: "Headline Font",
        category: "font",
        type: "font",
    },
    {
        id: "t043",
        description: "Body Font",
        category: "font",
        type: "font",
    },
];
