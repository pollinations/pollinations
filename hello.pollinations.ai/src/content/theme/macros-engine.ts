import type { LLMThemeResponse, ThemeSlot } from "./engine";
import type { MacroConfig } from "./macros";
import { type SemanticTokenId } from "./semantic";

export function macrosToTheme(config: MacroConfig): LLMThemeResponse {
    const colorMap: Record<string, string[]> = {};
    const borderRadius: Record<string, string> = {};
    const fonts: Record<string, string> = {};

    // Helper to add semantic token to color map
    const addColor = (semanticId: SemanticTokenId, hex: string) => {
        if (!colorMap[hex]) {
            colorMap[hex] = [];
        }
        colorMap[hex].push(semanticId);
    };

    // Helper to add radius
    const addRadius = (semanticId: SemanticTokenId, value: string) => {
        borderRadius[semanticId] = value;
    };

    // Helper to add font
    const addFont = (semanticId: SemanticTokenId, value: string) => {
        fonts[semanticId] = value;
    };

    // 1. Map Colors
    // Text
    addColor("text.primary", config.text.primary);
    addColor("text.secondary", config.text.secondary);
    addColor("text.tertiary", config.text.tertiary);
    addColor("text.caption", config.text.caption);
    addColor("text.inverse", config.text.inverse);
    addColor("text.brand", config.text.brand);
    addColor("text.highlight", config.text.highlight);

    // Surfaces
    addColor("surface.page", config.surfaces.page);
    addColor("surface.card", config.surfaces.card);
    addColor("surface.base", config.surfaces.base);

    // Inputs
    addColor("input.bg", config.inputs.bg);
    // input.text is usually text.primary, but we don't have a token for it in t0xx
    // so we skip it for now as per semantic.ts comments

    // Buttons
    addColor("button.primary.bg", config.buttons.primary.bg);
    addColor("button.secondary.bg", config.buttons.secondary.bg);
    addColor("button.disabled.bg", config.buttons.ghost.disabledBg); // Using ghost.disabledBg as general disabled
    addColor("button.hover.overlay", config.buttons.ghost.hoverOverlay);
    addColor("button.active.overlay", config.buttons.ghost.activeOverlay);
    addColor("button.focus.ring", config.buttons.ghost.focusRing);

    // Indicators
    addColor("indicator.image", config.brandSpecial.indicatorImage);
    addColor("indicator.text", config.brandSpecial.indicatorText);
    addColor("indicator.audio", config.brandSpecial.indicatorAudio);

    // Borders
    addColor("border.brand", config.borders.brand);
    addColor("border.highlight", config.borders.highlight);
    addColor("border.main", config.borders.main);
    addColor("border.strong", config.borders.strong);
    addColor("border.subtle", config.borders.subtle);
    addColor("border.faint", config.borders.faint);

    // Shadows
    addColor("shadow.brand.sm", config.shadows.brand.sm);
    addColor("shadow.brand.md", config.shadows.brand.md);
    addColor("shadow.brand.lg", config.shadows.brand.lg);
    addColor("shadow.dark.sm", config.shadows.dark.sm);
    addColor("shadow.dark.md", config.shadows.dark.md);
    addColor("shadow.dark.lg", config.shadows.dark.lg);
    addColor("shadow.dark.xl", config.shadows.dark.xl);
    addColor("shadow.highlight.sm", config.shadows.highlight.sm);
    addColor("shadow.highlight.md", config.shadows.highlight.md);

    // Logos
    addColor("logo.main", config.brandSpecial.logoMain);
    addColor("logo.accent", config.brandSpecial.logoAccent);

    // 2. Map Radius
    addRadius("radius.button", config.radius.button);
    addRadius("radius.card", config.radius.card);
    addRadius("radius.input", config.radius.input);
    addRadius("radius.subcard", config.radius.subcard);

    // 3. Map Fonts
    addFont("font.title", config.typography.title);
    addFont("font.headline", config.typography.headline);
    addFont("font.body", config.typography.body);

    // 4. Construct LLMThemeResponse
    const slots: Record<string, ThemeSlot> = {};
    Object.entries(colorMap).forEach(([hex, ids], index) => {
        slots[`slot_${index}`] = { hex, ids };
    });

    return {
        slots,
        borderRadius,
        fonts,
    };
}
