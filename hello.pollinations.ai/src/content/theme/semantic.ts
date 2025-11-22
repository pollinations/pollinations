export type SemanticTokenId =
    // Text
    | "text.primary"
    | "text.secondary"
    | "text.tertiary"
    | "text.caption"
    | "text.inverse" // text.on-color
    | "text.brand"
    | "text.highlight"

    // Surfaces
    | "surface.page"
    | "surface.card"
    | "surface.base"

    // Inputs
    | "input.bg"
    | "input.text" // implied by text.primary usually, but good to have if needed?
    // Actually looking at tokens.ts, t011 is Input Field Background.
    // We don't have a specific input text color token in tokens.ts, it relies on contrast.
    // But let's stick to what we have in tokens.ts for the mapping.

    // Buttons
    | "button.primary.bg"
    | "button.secondary.bg"
    | "button.disabled.bg"
    | "button.hover.overlay"
    | "button.active.overlay"
    | "button.focus.ring"

    // Indicators
    | "indicator.image"
    | "indicator.text"
    | "indicator.audio"

    // Borders
    | "border.brand"
    | "border.highlight"
    | "border.main"
    | "border.strong"
    | "border.subtle"
    | "border.faint"

    // Shadows
    | "shadow.brand.sm"
    | "shadow.brand.md"
    | "shadow.brand.lg"
    | "shadow.dark.sm"
    | "shadow.dark.md"
    | "shadow.dark.lg"
    | "shadow.dark.xl"
    | "shadow.highlight.sm"
    | "shadow.highlight.md"

    // Logos
    | "logo.main"
    | "logo.accent" // logo.shade

    // Radius
    // Wait, let's map strictly to tokens.ts first.
    | "radius.button"
    | "radius.card"
    | "radius.input"
    | "radius.subcard"

    // Fonts
    | "font.title"
    | "font.headline"
    | "font.body";
