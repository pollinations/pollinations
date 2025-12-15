import type { SemanticTokenId } from "./semantic-ids.types";

export interface DesignToken {
    id: SemanticTokenId;
    description: string; // The main human-readable name/description
    type: "color" | "radius" | "font" | "opacity";
}

export const TOKENS: DesignToken[] = [
    // TEXT
    {
        id: "text.primary",
        description: "Primary body text (high contrast)",
        type: "color",
    },
    {
        id: "text.secondary",
        description: "Secondary text (lower contrast)",
        type: "color",
    },
    {
        id: "text.tertiary",
        description: "Tertiary text (lowest contrast)",
        type: "color",
    },
    {
        id: "text.caption",
        description: "Caption / Label text",
        type: "color",
    },
    {
        id: "text.inverse",
        description: "Text on inverted backgrounds (e.g. buttons)",
        type: "color",
    },
    {
        id: "text.brand",
        description: "Brand colored text",
        type: "color",
    },
    {
        id: "text.highlight",
        description: "Highlighted text",
        type: "color",
    },

    // SURFACES
    {
        id: "surface.page",
        description: "Main page background",
        type: "color",
    },
    {
        id: "surface.card",
        description: "Card / Container background",
        type: "color",
    },
    {
        id: "surface.base",
        description: "Secondary background / Sidebar",
        type: "color",
    },

    // INPUTS
    {
        id: "input.bg",
        description: "Input field background",
        type: "color",
    },
    {
        id: "input.border",
        description: "Input field border",
        type: "color",
    },
    {
        id: "input.placeholder",
        description: "Input placeholder text",
        type: "color",
    },
    {
        id: "input.text",
        description: "Input field text (user typed content)",
        type: "color",
    },

    // BUTTONS
    {
        id: "button.primary.bg",
        description: "Primary button background",
        type: "color",
    },
    {
        id: "button.primary.border",
        description: "Primary button border",
        type: "color",
    },
    {
        id: "button.secondary.bg",
        description: "Secondary button background",
        type: "color",
    },
    {
        id: "button.secondary.border",
        description: "Secondary button border",
        type: "color",
    },
    {
        id: "button.disabled.bg",
        description: "Disabled button background",
        type: "color",
    },
    {
        id: "button.hover.overlay",
        description: "Hover state overlay",
        type: "color",
    },
    {
        id: "button.active.overlay",
        description: "Active state overlay",
        type: "color",
    },
    {
        id: "button.focus.ring",
        description: "Focus ring color",
        type: "color",
    },

    // INDICATORS
    {
        id: "indicator.image",
        description: "Image generation indicator",
        type: "color",
    },
    {
        id: "indicator.text",
        description: "Text generation indicator",
        type: "color",
    },
    {
        id: "indicator.audio",
        description: "Audio generation indicator",
        type: "color",
    },

    // BORDERS
    {
        id: "border.brand",
        description: "Brand colored border",
        type: "color",
    },
    {
        id: "border.highlight",
        description: "Highlighted border",
        type: "color",
    },
    {
        id: "border.main",
        description: "Main border color",
        type: "color",
    },
    {
        id: "border.strong",
        description: "Strong border color",
        type: "color",
    },
    {
        id: "border.subtle",
        description: "Subtle border color",
        type: "color",
    },
    {
        id: "border.faint",
        description: "Faint border color",
        type: "color",
    },

    // SHADOWS
    {
        id: "shadow.brand.sm",
        description: "Brand shadow small",
        type: "color",
    },
    {
        id: "shadow.brand.md",
        description: "Brand shadow medium",
        type: "color",
    },
    {
        id: "shadow.brand.lg",
        description: "Brand shadow large",
        type: "color",
    },
    {
        id: "shadow.dark.sm",
        description: "Dark shadow small",
        type: "color",
    },
    {
        id: "shadow.dark.md",
        description: "Dark shadow medium",
        type: "color",
    },
    {
        id: "shadow.dark.lg",
        description: "Dark shadow large",
        type: "color",
    },
    {
        id: "shadow.dark.xl",
        description: "Dark shadow extra large",
        type: "color",
    },
    {
        id: "shadow.highlight.sm",
        description: "Highlight shadow small",
        type: "color",
    },
    {
        id: "shadow.highlight.md",
        description: "Highlight shadow medium",
        type: "color",
    },

    // LOGOS
    {
        id: "logo.main",
        description: "Main logo color",
        type: "color",
    },
    {
        id: "logo.accent",
        description: "Logo accent color",
        type: "color",
    },

    // BACKGROUND (WebGL animation)
    {
        id: "background.base",
        description: "WebGL scene background color",
        type: "color",
    },
    {
        id: "background.element1",
        description: "Primary organic elements (filaments/branches)",
        type: "color",
    },
    {
        id: "background.element2",
        description: "Secondary elements (nodes/junctions)",
        type: "color",
    },
    {
        id: "background.particle",
        description: "Floating particles/spores",
        type: "color",
    },

    // RADIUS
    {
        id: "radius.button",
        description: "Button border radius",
        type: "radius",
    },
    {
        id: "radius.card",
        description: "Card border radius",
        type: "radius",
    },
    {
        id: "radius.input",
        description: "Input border radius",
        type: "radius",
    },
    {
        id: "radius.subcard",
        description: "Sub-card border radius",
        type: "radius",
    },

    // FONTS
    {
        id: "font.title",
        description: "Title font",
        type: "font",
    },
    {
        id: "font.headline",
        description: "Headline font",
        type: "font",
    },
    {
        id: "font.body",
        description: "Body font",
        type: "font",
    },

    // OPACITY
    {
        id: "opacity.card",
        description: "Card/surface transparency (0.9-1.0 solid, 0.7-0.9 glass)",
        type: "opacity",
    },
    {
        id: "opacity.overlay",
        description: "Overlay/modal transparency (0.8-0.95)",
        type: "opacity",
    },
    {
        id: "opacity.glass",
        description: "Glass effect transparency (0.6-0.8)",
        type: "opacity",
    },
];
