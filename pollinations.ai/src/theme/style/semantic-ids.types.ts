export type SemanticTokenId =
    // Text
    | "text.primary"
    | "text.secondary"
    | "text.tertiary"
    | "text.caption"
    | "text.inverse"
    | "text.brand"
    | "text.highlight"

    // Surfaces
    | "surface.page"
    | "surface.card"
    | "surface.base"

    // Buttons
    | "button.primary.bg"
    | "button.primary.border"
    | "button.secondary.bg"
    | "button.secondary.border"
    | "button.disabled.bg"
    | "button.hover.overlay"
    | "button.active.overlay"
    | "button.focus.ring"

    // Inputs
    | "input.bg"
    | "input.border"
    | "input.placeholder"
    | "input.text"

    // Indicators
    | "indicator.image"
    | "indicator.text"
    | "indicator.audio"
    | "indicator.video"

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
    | "logo.accent"

    // Background (WebGL animation)
    | "background.base"
    | "background.element1"
    | "background.element2"
    | "background.particle"

    // Radius
    | "radius.button"
    | "radius.card"
    | "radius.input"
    | "radius.subcard"

    // Fonts
    | "font.title"
    | "font.headline"
    | "font.body"

    // Opacity
    | "opacity.card"
    | "opacity.overlay"
    | "opacity.glass";
