export type TokenId = `t${number}`;

export interface DesignToken {
    id: TokenId;
    label: string;
    description: string;
    category:
        | "text"
        | "surface"
        | "input"
        | "button"
        | "indicator"
        | "border"
        | "shadow"
        | "logo";
    type: "color";
}

export const TOKENS: DesignToken[] = [
    // Text
    {
        id: "t001",
        label: "text.body.main",
        description: "Primary body text color",
        category: "text",
        type: "color",
    },
    {
        id: "t002",
        label: "text.body.secondary",
        description: "Secondary text color for less emphasis",
        category: "text",
        type: "color",
    },
    {
        id: "t003",
        label: "text.body.tertiary",
        description: "Tertiary text color for subtle details",
        category: "text",
        type: "color",
    },
    {
        id: "t004",
        label: "text.caption",
        description: "Caption text color",
        category: "text",
        type: "color",
    },
    {
        id: "t005",
        label: "text.on-color",
        description: "Text color on colored backgrounds (e.g. primary buttons)",
        category: "text",
        type: "color",
    },
    {
        id: "t006",
        label: "text.brand",
        description: "Brand-colored text",
        category: "text",
        type: "color",
    },
    {
        id: "t007",
        label: "text.highlight",
        description: "Highlighted text color",
        category: "text",
        type: "color",
    },

    // Surfaces
    {
        id: "t008",
        label: "surface.page",
        description: "Main page background",
        category: "surface",
        type: "color",
    },
    {
        id: "t009",
        label: "surface.card",
        description: "Card background",
        category: "surface",
        type: "color",
    },
    {
        id: "t010",
        label: "surface.base",
        description: "Base surface background",
        category: "surface",
        type: "color",
    },

    // Input
    {
        id: "t011",
        label: "input.background",
        description: "Input field background",
        category: "input",
        type: "color",
    },

    // Buttons
    {
        id: "t012",
        label: "button.primary.background",
        description: "Primary button background",
        category: "button",
        type: "color",
    },
    {
        id: "t013",
        label: "button.secondary.background",
        description: "Secondary button background",
        category: "button",
        type: "color",
    },
    {
        id: "t014",
        label: "button.disabled.background",
        description: "Disabled button background",
        category: "button",
        type: "color",
    },
    {
        id: "t015",
        label: "button.hover.overlay",
        description: "Overlay color for button hover state",
        category: "button",
        type: "color",
    },
    {
        id: "t016",
        label: "button.active.overlay",
        description: "Overlay color for button active state",
        category: "button",
        type: "color",
    },
    {
        id: "t017",
        label: "button.focus.ring",
        description: "Focus ring color for buttons",
        category: "button",
        type: "color",
    },

    // Indicators
    {
        id: "t018",
        label: "indicator.image",
        description: "Indicator color for image generation",
        category: "indicator",
        type: "color",
    },
    {
        id: "t019",
        label: "indicator.text",
        description: "Indicator color for text generation",
        category: "indicator",
        type: "color",
    },
    {
        id: "t020",
        label: "indicator.audio",
        description: "Indicator color for audio generation",
        category: "indicator",
        type: "color",
    },

    // Borders
    {
        id: "t021",
        label: "border.brand",
        description: "Brand-colored border",
        category: "border",
        type: "color",
    },
    {
        id: "t022",
        label: "border.highlight",
        description: "Highlighted border",
        category: "border",
        type: "color",
    },
    {
        id: "t023",
        label: "border.main",
        description: "Main border color",
        category: "border",
        type: "color",
    },
    {
        id: "t024",
        label: "border.strong",
        description: "Strong border color",
        category: "border",
        type: "color",
    },
    {
        id: "t025",
        label: "border.subtle",
        description: "Subtle border color",
        category: "border",
        type: "color",
    },
    {
        id: "t026",
        label: "border.faint",
        description: "Faint border color",
        category: "border",
        type: "color",
    },

    // Shadows
    {
        id: "t027",
        label: "shadow.brand.sm",
        description: "Small brand shadow",
        category: "shadow",
        type: "color",
    },
    {
        id: "t028",
        label: "shadow.brand.md",
        description: "Medium brand shadow",
        category: "shadow",
        type: "color",
    },
    {
        id: "t029",
        label: "shadow.brand.lg",
        description: "Large brand shadow",
        category: "shadow",
        type: "color",
    },
    {
        id: "t030",
        label: "shadow.dark.sm",
        description: "Small dark shadow",
        category: "shadow",
        type: "color",
    },
    {
        id: "t031",
        label: "shadow.dark.md",
        description: "Medium dark shadow",
        category: "shadow",
        type: "color",
    },
    {
        id: "t032",
        label: "shadow.dark.lg",
        description: "Large dark shadow",
        category: "shadow",
        type: "color",
    },
    {
        id: "t033",
        label: "shadow.dark.xl",
        description: "Extra large dark shadow",
        category: "shadow",
        type: "color",
    },
    {
        id: "t034",
        label: "shadow.highlight.sm",
        description: "Small highlight shadow",
        category: "shadow",
        type: "color",
    },
    {
        id: "t035",
        label: "shadow.highlight.md",
        description: "Medium highlight shadow",
        category: "shadow",
        type: "color",
    },

    // Logos
    {
        id: "t036",
        label: "logo.main",
        description: "Main logo color",
        category: "logo",
        type: "color",
    },
    {
        id: "t037",
        label: "logo.shade",
        description: "Logo shade color",
        category: "logo",
        type: "color",
    },
];
