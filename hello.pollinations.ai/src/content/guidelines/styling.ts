/**
 * Global Styling Guidelines for Theme Generation
 * Used by the GEN STYLE pipeline - combines token system + full theme styling
 */

import { TOKENS } from "../theme/tokens";

const TOKEN_LIST = TOKENS.map(
    (t) => `- ${t.id}: ${t.label} (${t.description})`,
).join("\n");

export const STYLING_GUIDELINES = `You are a professional theme designer creating a complete design system.

## TASK
Generate a comprehensive theme with colors, fonts, and spacing.

## COLOR SYSTEM (Token-Based)
We use a semantic token system. Each token has a unique ID (e.g. t001).

Generate colors as "slots" - each slot contains:
1. A hex color value
2. An array of token IDs that should use that color

### Available Tokens:
${TOKEN_LIST}

### Color Output Format:
{
  "colors": {
    "slots": {
      "slot_0": {
        "hex": "#110518",
        "ids": ["t001", "t012", "t024"]
      },
      "slot_1": {
        "hex": "#ffffff",
        "ids": ["t005", "t036"]
      }
    }
  }
}

### Color Design Rules:
- Create 6-12 harmonious color slots
- Every token ID MUST be assigned exactly once
- Maintain accessibility (WCAG AA minimum)
- Group related UI elements (e.g., button states together)

## TYPOGRAPHY
Choose fonts that match the theme's personality:
- **Title**: Display font for hero sections (bold, impactful)
- **Headline**: Section headers (clear, readable)
- **Body**: Main content (comfortable for long reading)

### Font Output Format:
{
  "fonts": {
    "title": "Font Family Name",
    "headline": "Font Family Name",
    "body": "Font Family Name"
  }
}

## SPACING SCALE
Create a consistent spacing scale following a ratio (1.5x or golden ratio):

### Spacing Output Format:
{
  "spacing": {
    "xs": "4px",
    "sm": "8px",
    "md": "12px",
    "lg": "18px",
    "xl": "27px",
    "2xl": "40px"
  }
}

## COMPLETE OUTPUT FORMAT
Return ONLY valid JSON (no markdown, no comments):
{
  "colors": { "slots": { ... } },
  "fonts": { ... },
  "spacing": { ... }
}

## CRITICAL RULES
- All token IDs must be used exactly once
- Hex colors must be lowercase with #
- Use real, common font family names
- Spacing values must include unit (px, rem, etc.)
- Return ONLY the JSON object`;

// ==============================================
// TYPE DEFINITIONS
// ==============================================

import { TokenId } from "../theme/tokens";
import { assembleStylePrompt } from "../buildPrompts";
import { generateText } from "../../services/pollinationsAPI";

// Legacy format for colors (backwards compatibility)
export type ThemeDefinition = Record<string, TokenId[]>;

// New full theme format
export interface FullThemeStyle {
    colors: ThemeDefinition;
    fonts?: {
        title: string;
        headline: string;
        body: string;
    };
    spacing?: {
        xs: string;
        sm: string;
        md: string;
        lg: string;
        xl: string;
        "2xl": string;
    };
}

// ==============================================
// JSON PARSING HELPERS
// ==============================================

/**
 * Parse and validate LLM response into ThemeDefinition (legacy colors)
 */
export function parseThemeResponse(text: string): ThemeDefinition {
    let jsonText = text.trim();
    jsonText = jsonText.replace(/^```json?\n?/i, "");
    jsonText = jsonText.replace(/\n?```$/, "");
    jsonText = jsonText.trim();

    const parsed = JSON.parse(jsonText);

    if (typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Invalid theme structure: expected object");
    }

    // Convert new format (with slots) to dictionary format
    let convertedTheme: ThemeDefinition = {};

    // Handle new full theme format with colors.slots
    const slots = parsed.colors?.slots || parsed.slots;

    if (slots) {
        Object.values(slots).forEach((slot: any) => {
            const hex = slot.hex;
            const ids = slot.ids || slot.paths || [];
            if (!convertedTheme[hex]) {
                convertedTheme[hex] = [];
            }
            // Ensure ids is an array before spreading
            const idsArray = Array.isArray(ids) ? ids : [ids];
            convertedTheme[hex].push(...idsArray);
        });
    } else {
        convertedTheme = parsed as ThemeDefinition;
    }

    return convertedTheme;
}

/**
 * Parse full theme response (colors + fonts + spacing)
 */
export function parseFullThemeResponse(text: string): FullThemeStyle {
    let jsonText = text.trim();
    jsonText = jsonText.replace(/^```json?\n?/i, "");
    jsonText = jsonText.replace(/\n?```$/, "");
    jsonText = jsonText.trim();

    const parsed = JSON.parse(jsonText);

    // If it's the old color-only format, wrap it
    if (!parsed.colors && !parsed.fonts && !parsed.spacing) {
        return {
            colors: parseThemeResponse(text),
        };
    }

    return parsed as FullThemeStyle;
}

// ==============================================
// THEME GENERATION HELPERS
// ==============================================

/**
 * Generate theme (legacy - colors only)
 */
export async function generateTheme(
    userPrompt: string,
    signal?: AbortSignal,
): Promise<ThemeDefinition> {
    const fullPrompt = `${STYLING_GUIDELINES}

USER REQUEST:
${userPrompt}

Generate the theme JSON now:`;

    const text = await generateText(fullPrompt, 42, "openai-large", signal);
    return parseThemeResponse(text);
}

/**
 * Generate full theme style (colors + fonts + spacing)
 * Uses the GEN STYLE pipeline with styling guidelines
 */
export async function generateFullTheme(
    themeDescription: string,
    signal?: AbortSignal,
): Promise<FullThemeStyle> {
    const fullPrompt = assembleStylePrompt(themeDescription);
    const text = await generateText(fullPrompt, 42, "openai-large", signal);
    return parseFullThemeResponse(text);
}
