/**
 * Styling Guidelines for GEN STYLE Pipeline
 * Pure content - prompt templates and guidelines for theme generation
 * 
 * Logic functions are in helpers/styling-helpers.ts
 */

import { TOKENS } from "../theme/tokens";

// ==============================================
// PROMPT CONSTRUCTION HELPERS
// ==============================================

/**
 * Group tokens by category for clearer prompt structure
 */
const tokensByCategory = TOKENS.reduce(
    (acc, token) => {
        if (!acc[token.category]) acc[token.category] = [];
        acc[token.category].push(token);
        return acc;
    },
    {} as Record<string, typeof TOKENS>,
);

/**
 * Generate formatted token list for prompts
 */
const TOKEN_LIST = Object.entries(tokensByCategory)
    .map(([category, tokens]) => {
        const header = `### ${category.toUpperCase()}`;
        const items = tokens
            .map((t) => {
                const line = `- ${t.id}: ${t.description}`;
                return line;
            })
            .join("\n");
        return `${header}\n${items}`;
    })
    .join("\n\n");

/**
 * Generate dynamic contrast rules for prompts
 */
const CONTRAST_RULES = TOKENS.filter((t) => t.contrastWith)
    .map((t) => `- ${t.id} vs ${t.contrastWith}`)
    .join("\n");

// ==============================================
// MAIN STYLING GUIDELINES
// ==============================================

export const STYLING_GUIDELINES = `You are a Design Token Generator.

INPUT:
- A short theme description called "VIBE" (e.g. "blue sky and calm").

GOAL:
Create a cohesive design token set that matches the VIBE and returns ONLY a single JSON object with the exact schema below.

--------------------------------
1. VIBE CLASSIFICATION
--------------------------------
From the VIBE, infer:
- mood: one of ["playful", "serious", "futuristic", "brutalist", "elegant", "soft", "friendly"] (pick the closest)
- density: one of ["compact", "comfortable", "spacious"]

Use these choices consistently for colors, radii, fonts, and spacing. Do NOT include mood or density in the JSON.

--------------------------------
2. DESIGN TOKENS
--------------------------------

2.1 COLOR TOKENS

You must assign EVERY color-related token ID to EXACTLY ONE slot in colors.slots[*].ids.

COLOR TOKEN IDS:
${TOKEN_LIST}

IMPORTANT COLOR RULES:
- Each color token ID t001–t037 MUST appear in EXACTLY ONE slot in colors.slots[*].ids.
- Do NOT use t038, t039, t040 in any colors.slots ids (they are reserved for borderRadius).
- "hex" field may be any valid CSS color string (e.g. "#RRGGBB", "#RRGGBBAA", or "rgba(...)") but MUST be valid JSON string.

CONTRAST REQUIREMENTS (WCAG AA intent):
Ensure these pairs have sufficient contrast:
${CONTRAST_RULES}

CRITICAL - You cannot compute WCAG ratios, but you MUST ensure OBVIOUS high contrast:
- Light text on dark backgrounds OR dark text on light backgrounds
- NEVER use similar shades (e.g., #4A5A6A text on #3B4B5B background)
- Input fields (t011) are ESPECIALLY prone to contrast failures - ensure PRIMARY BODY TEXT (t001) is HIGHLY visible against INPUT BACKGROUND (t011)
- If t008 (page background) is dark, then t001, t002, t003, t004, t006, t007 must be light (or vice versa)
- NAVIGATION/BUTTON ACTIVE STATES: t007 (Highlighted Text) is used for active/selected navigation items with t013 (Secondary Button Background) - these MUST have STRONG contrast (e.g., dark text on light button OR light text on dark button)

2.2 RADIUS TOKENS

RADIUS IDS:
- t038: Button Radius
- t039: Card Radius
- t040: Input Radius

RULES:
- Each of t038, t039, t040 MUST be present as a key in "borderRadius".
- Do NOT include t038, t039, t040 in colors.slots[*].ids.
- Choose values based on inferred mood:
  - Playful/Friendly: 12–24px
  - Elegant/Soft: 8–12px
  - Serious/Corporate: 4–6px
  - Brutalist/Strict: 0px
  - Futuristic: mix of 2–8px (e.g. sharper buttons, softer cards)

2.3 TYPOGRAPHY

TOKENS:
- t041: Title Font (Display/Branding)
- t042: Headline Font (Strong/Readable)
- t043: Body Font (Highly Legible)

AVAILABLE FONT LIBRARY (Examples - Choose based on vibe):

CLASSIC / NEUTRAL:
- Maven Pro, Mako, Duru Sans, Lato, Open Sans, PT Sans, Merriweather, Playfair Display

MINIMAL / CLEAN:
- Inter, Roboto, Quicksand, Poppins, Montserrat, Nunito, Raleway, Work Sans, Outfit

TECH / FUTURISTIC:
- Orbitron, Rajdhani, Exo 2, Teko, Chakra Petch, Michroma, Audiowide, Share Tech Mono

CREATIVE / DISPLAY:
- Lora, Fredoka, Abril Fatface, Righteous, Comfortaa, Bangers, Lobster, Pacifico, Cinzel

RULES:
- Assign one font name to each token (t041, t042, t043).
- CRITICAL: Choose fonts that strongly match the requested vibe/theme.
- You MAY choose any Google Font from the categories above (or similar high-quality Google Fonts).

2.4 SPACING

Set spacing density from inferred "density":
- "compact": smaller values
- "comfortable": medium
- "spacious": larger

All values must be px strings.

--------------------------------
3. OUTPUT FORMAT (REQUIRED)
--------------------------------

You MUST return ONLY a single JSON object, with no extra text, comments, or explanations:

{
  "colors": {
    "slots": {
      "slot_0": {
        "hex": "#...",
        "ids": ["t001", "t002"]
      },
      "slot_1": {
        "hex": "#...",
        "ids": ["t003", "t004"]
      }
      // additional slots as needed, until all color tokens t001–t037 are assigned exactly once
    }
  },
  "borderRadius": {
    "t038": "8px",
    "t039": "12px",
    "t040": "4px"
  },
  "fonts": {
    "t041": "Orbitron",
    "t042": "Rajdhani",
    "t043": "Exo 2"
  },
  "spacing": {
    "xs": "4px",
    "sm": "8px",
    "md": "12px",
    "lg": "16px",
    "xl": "24px",
    "2xl": "32px"
  }
}

HARD CONSTRAINTS:
- Every token ID t001–t040 MUST be used exactly once:
  - t001–t037: only in colors.slots[*].ids
  - t038–t040: only as keys in borderRadius
- Output MUST be valid JSON.
- Do NOT add any fields beyond this schema.
- Do NOT add prose, comments, or explanations.`;
