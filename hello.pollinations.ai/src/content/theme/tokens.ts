import type { SemanticTokenId } from "./semantic";

export interface DesignToken {
    id: SemanticTokenId;
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
    contrastWith?: SemanticTokenId; // ID of the token this must contrast with
}

export const TOKENS: DesignToken[] = [
    // TEXT
    {
        id: "text.primary",
        description: "Primary body text (high contrast)",
        category: "text",
        type: "color",
        contrastWith: "surface.page",
    },
    {
        id: "text.secondary",
        description: "Secondary text (lower contrast)",
        category: "text",
        type: "color",
        contrastWith: "surface.page",
    },
    {
        id: "text.tertiary",
        description: "Tertiary text (lowest contrast)",
        category: "text",
        type: "color",
        contrastWith: "surface.page",
    },
    {
        id: "text.caption",
        description: "Caption / Label text",
        category: "text",
        type: "color",
        contrastWith: "surface.page",
    },
    {
        id: "text.inverse",
        description: "Text on inverted backgrounds (e.g. buttons)",
        category: "text",
        type: "color",
        contrastWith: "button.primary.bg",
    },
    {
        id: "text.brand",
        description: "Brand colored text",
        category: "text",
        type: "color",
        contrastWith: "surface.page",
    },
    {
        id: "text.highlight",
        description: "Highlighted text",
        category: "text",
        type: "color",
        contrastWith: "surface.page",
    },

    // SURFACES
    {
        id: "surface.page",
        description: "Main page background",
        category: "surface",
        type: "color",
    },
    {
        id: "surface.card",
        description: "Card / Container background",
        category: "surface",
        type: "color",
        contrastWith: "text.primary",
    },
    {
        id: "surface.base",
        description: "Secondary background / Sidebar",
        category: "surface",
        type: "color",
    },

    // INPUTS
    {
        id: "input.bg",
        description: "Input field background",
        category: "input",
        type: "color",
        contrastWith: "text.primary",
    },

    // BUTTONS
    {
        id: "button.primary.bg",
        description: "Primary button background",
        category: "button",
        type: "color",
        contrastWith: "text.inverse",
    },
    {
        id: "button.secondary.bg",
        description: "Secondary button background",
        category: "button",
        type: "color",
    },
    {
        id: "button.disabled.bg",
        description: "Disabled button background",
        category: "button",
        type: "color",
    },
    {
        id: "button.hover.overlay",
        description: "Hover state overlay",
        category: "button",
        type: "color",
    },
    {
        id: "button.active.overlay",
        description: "Active state overlay",
        category: "button",
        type: "color",
    },
    {
        id: "button.focus.ring",
        description: "Focus ring color",
        category: "button",
        type: "color",
    },

    // INDICATORS
    {
        id: "indicator.image",
        description: "Image generation indicator",
        category: "indicator",
        type: "color",
    },
    {
        id: "indicator.text",
        description: "Text generation indicator",
        category: "indicator",
        type: "color",
    },
    {
        id: "indicator.audio",
        description: "Audio generation indicator",
        category: "indicator",
        type: "color",
    },

    // BORDERS
    {
        id: "border.brand",
        description: "Brand colored border",
        category: "border",
        type: "color",
    },
    {
        id: "border.highlight",
        description: "Highlighted border",
        category: "border",
        type: "color",
    },
    {
        id: "border.main",
        description: "Main border color",
        category: "border",
        type: "color",
    },
    {
        id: "border.strong",
        description: "Strong border color",
        category: "border",
        type: "color",
    },
    {
        id: "border.subtle",
        description: "Subtle border color",
        category: "border",
        type: "color",
    },
    {
        id: "border.faint",
        description: "Faint border color",
        category: "border",
        type: "color",
    },

    // SHADOWS
    {
        id: "shadow.brand.sm",
        description: "Brand shadow small",
        category: "shadow",
        type: "color",
    },
    {
        id: "shadow.brand.md",
        description: "Brand shadow medium",
        category: "shadow",
        type: "color",
    },
    {
        id: "shadow.brand.lg",
        description: "Brand shadow large",
        category: "shadow",
        type: "color",
    },
    {
        id: "shadow.dark.sm",
        description: "Dark shadow small",
        category: "shadow",
        type: "color",
    },
    {
        id: "shadow.dark.md",
        description: "Dark shadow medium",
        category: "shadow",
        type: "color",
    },
    {
        id: "shadow.dark.lg",
        description: "Dark shadow large",
        category: "shadow",
        type: "color",
    },
    {
        id: "shadow.dark.xl",
        description: "Dark shadow extra large",
        category: "shadow",
        type: "color",
    },
    {
        id: "shadow.highlight.sm",
        description: "Highlight shadow small",
        category: "shadow",
        type: "color",
    },
    {
        id: "shadow.highlight.md",
        description: "Highlight shadow medium",
        category: "shadow",
        type: "color",
    },

    // LOGOS
    {
        id: "logo.main",
        description: "Main logo color",
        category: "logo",
        type: "color",
    },
    {
        id: "logo.accent",
        description: "Logo accent color",
        category: "logo",
        type: "color",
    },

    // RADIUS
    {
        id: "radius.button",
        description: "Button border radius",
        category: "radius",
        type: "radius",
    },
    {
        id: "radius.card",
        description: "Card border radius",
        category: "radius",
        type: "radius",
    },
    {
        id: "radius.input",
        description: "Input border radius",
        category: "radius",
        type: "radius",
    },
    {
        id: "radius.subcard",
        description: "Sub-card border radius",
        category: "radius",
        type: "radius",
    },

    // FONTS
    {
        id: "font.title",
        description: "Title font",
        category: "font",
        type: "font",
    },
    {
        id: "font.headline",
        description: "Headline font",
        category: "font",
        type: "font",
    },
    {
        id: "font.body",
        description: "Body font",
        category: "font",
        type: "font",
    },
];
