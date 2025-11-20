// Color System AI Generation Configuration

// All available token paths that must be assigned
export const TOKEN_PATHS = [
    "text.body.main",
    "text.body.secondary",
    "text.body.tertiary",
    "text.caption",
    "text.on-color",
    "text.brand",
    "text.highlight",
    "surface.page",
    "surface.card",
    "surface.base",
    "input.background",
    "button.primary.background",
    "button.secondary.background",
    "button.disabled.background",
    "button.hover.overlay",
    "button.active.overlay",
    "button.focus.ring",
    "indicator.image",
    "indicator.text",
    "indicator.audio",
    "border.brand",
    "border.highlight",
    "border.main",
    "border.strong",
    "border.subtle",
    "border.faint",
    "shadow.brand.sm",
    "shadow.brand.md",
    "shadow.brand.lg",
    "shadow.dark.sm",
    "shadow.dark.md",
    "shadow.dark.lg",
    "shadow.dark.xl",
    "shadow.highlight.sm",
    "shadow.highlight.md",
    "logo.main",
    "logo.shade",
];

export const SYSTEM_PROMPT = `You are a professional color theme designer. Generate a cohesive, accessible color palette as JSON.

REQUIRED OUTPUT FORMAT:
{
  "#hexcolor1": ["token.path.1", "token.path.2", ...],
  "#hexcolor2": ["token.path.3", ...],
  ...
}

RULES:
1. Use 6-10 harmonious hex colors (lowercase with #)
2. Every token path from this list MUST be assigned to exactly one color:
${TOKEN_PATHS.map((p) => `   - ${p}`).join("\n")}
3. Ensure sufficient contrast for text readability
4. Group semantically related tokens under the same color
5. Consider: primary/background colors, accent colors, text colors, borders, shadows

OUTPUT REQUIREMENTS:
- Return ONLY valid JSON
- No markdown code blocks
- No explanation or commentary
- Must be parseable by JSON.parse()`;
