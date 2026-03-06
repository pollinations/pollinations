import { type LLMThemeResponse, processTheme } from "../style/theme-processor";

// === PIXEL BRAND PALETTE ===
//
// COLOR HIERARCHY:
//   1. Black (#110518) — text, borders, shadows, ALL UI chrome
//   2. White (#ffffff) — inverse text, inner containers, CTAs
//   3. Cream (#f5f0e8) / Tan (#e8e2d8) — page and card surfaces
//   4. Yellow (#ecf874) — highlight marker only, very sparingly
//   5. Four model colors (image/text/audio/video) — ONLY for model indicators on Play page
//
// UI rule: buttons, nav, borders, badges all use black/white/cream. NO model colors in chrome.
// Model colors are ONLY for indicator.image/text/audio/video on the Play page.

export const COZY_COLORS = {
    // === Text hierarchy ===
    textPrimary: "#110518", // main body text — dark purple-black
    textSecondary: "#4a3f5c", // supporting text — muted purple
    textTertiary: "#6b5f80", // captions, placeholders
    textInverse: "#ffffff", // white text on colored/dark backgrounds

    // === Surfaces ===
    pageBg: "#f5f0e8", // warm cream page background
    cardBg: "#e8e2d8", // warm tan — darker than cream, cards have depth
    baseBg: "#f5f0e8", // base fallback

    // === Yellow highlight (use VERY sparingly) ===
    highlight: "#ecf874", // highlighter pen — only for key callouts

    // === Four MODEL colors — ONLY for Play page model indicators ===
    image: "#d94f8a", // hot pink
    text: "#5b8fd9", // sky blue
    audio: "#43b59a", // mint
    video: "#e67635", // tangerine

    // === Input ===
    inputBg: "#ffffff",
    inputBorder: "#cfc8b8",

    // === Buttons ===
    buttonPrimaryBg: "#110518", // dark bg
    buttonSecondaryBg: "#ffffff", // white bg
    buttonDisabledBg: "#e8e0d4",

    // === Borders ===
    borderMain: "#cfc8b8", // subtle dividers
    borderStrong: "#110518", // dark borders (cards, buttons)
    borderSubtle: "#e0d8c8", // very light
    borderFaint: "#ede8dc", // barely visible

    // === Shadows ===
    shadowDark: "#110518",
} as const;

const C = COZY_COLORS;

export const CozyTheme: LLMThemeResponse = {
    slots: {
        // ── Text hierarchy ──
        text_primary: { hex: C.textPrimary, ids: ["text.primary"] },
        text_secondary: { hex: C.textSecondary, ids: ["text.secondary"] },
        text_tertiary: { hex: C.textTertiary, ids: ["text.tertiary"] },
        text_caption: {
            hex: C.textTertiary,
            ids: ["text.caption", "input.placeholder"],
        },
        text_inverse: { hex: C.textInverse, ids: ["text.inverse"] },

        // ── Text accents — ALL use black/dark, not model colors ──
        text_brand: { hex: C.textPrimary, ids: ["text.brand"] }, // dark — links, labels, brand emphasis
        text_highlight: { hex: C.textPrimary, ids: ["text.highlight"] }, // dark — badges, callouts
        text_accent: { hex: C.textSecondary, ids: ["text.accent"] }, // muted — secondary accent

        // ── Surfaces ──
        surface_page: { hex: C.pageBg, ids: ["surface.page", "background.base"] },
        surface_card: { hex: C.cardBg, ids: ["surface.card"] },
        surface_base: { hex: C.baseBg, ids: ["surface.base"] },

        // ── Yellow highlight (very sparingly) ──
        highlight_marker: {
            hex: C.highlight,
            ids: [
                "shadow.brand.sm",
                "shadow.brand.md",
                "shadow.brand.lg",
            ],
        },

        // ── Logo — black fill with dark offset shadow ──
        logo_main: { hex: C.textPrimary, ids: ["logo.main"] },
        logo_accent: { hex: C.borderMain, ids: ["logo.accent"] }, // subtle tan shadow

        // ── Borders — ALL use black/neutral, not model colors ──
        border_brand: { hex: C.borderStrong, ids: ["border.brand"] }, // dark — main brand border
        border_highlight: { hex: C.borderStrong, ids: ["border.highlight"] }, // dark — highlight borders
        border_accent: { hex: C.borderStrong, ids: ["border.accent"] }, // dark — accent borders

        // ── Highlight backgrounds — subtle dark at low opacity ──
        highlight_bg: {
            hex: C.textPrimary,
            ids: [
                "button.focus.ring",
                "background.particle",
                "shadow.highlight.sm",
                "shadow.highlight.md",
            ],
        },

        // ── Background elements ──
        bg_element1: { hex: C.borderMain, ids: ["background.element1"] },
        bg_element2: { hex: C.borderSubtle, ids: ["background.element2"] },

        // ── 4 model indicators — the ONLY place model colors appear ──
        indicator_image: { hex: C.image, ids: ["indicator.image"] },
        indicator_text: { hex: C.text, ids: ["indicator.text"] },
        indicator_audio: { hex: C.audio, ids: ["indicator.audio"] },
        indicator_video: { hex: C.video, ids: ["indicator.video"] },

        // ── Buttons — black/white only ──
        btn_primary_bg: { hex: C.buttonPrimaryBg, ids: ["button.primary.bg"] },
        btn_primary_border: { hex: C.borderStrong, ids: ["button.primary.border"] },
        btn_secondary_bg: { hex: C.buttonSecondaryBg, ids: ["button.secondary.bg"] },
        btn_secondary_border: { hex: C.borderStrong, ids: ["button.secondary.border"] },
        btn_disabled: { hex: C.buttonDisabledBg, ids: ["button.disabled.bg"] },
        btn_hover: { hex: C.textPrimary, ids: ["button.hover.overlay"] },
        btn_active: { hex: C.textSecondary, ids: ["button.active.overlay"] },

        // ── Input ──
        input_text: { hex: C.textPrimary, ids: ["input.text"] },
        input_bg: { hex: C.inputBg, ids: ["input.bg"] },
        input_border: { hex: C.inputBorder, ids: ["input.border"] },

        // ── Borders ──
        border_main: { hex: C.borderMain, ids: ["border.main"] },
        border_strong: { hex: C.borderStrong, ids: ["border.strong"] },
        border_subtle: { hex: C.borderSubtle, ids: ["border.subtle"] },
        border_faint: { hex: C.borderFaint, ids: ["border.faint"] },

        // ── Shadows ──
        shadow_dark: {
            hex: C.shadowDark,
            ids: [
                "shadow.dark.sm",
                "shadow.dark.md",
                "shadow.dark.lg",
                "shadow.dark.xl",
            ],
        },
    },
    borderRadius: {
        "radius.button": "0px",
        "radius.card": "0px",
        "radius.input": "0px",
        "radius.subcard": "0px",
        "radius.tag": "0px",
    },
    fonts: {
        "font.title": "Press Start 2P",
        "font.headline": "Press Start 2P",
        "font.body": "IBM Plex Mono",
    },
    opacity: {
        "opacity.card": "0.85",
        "opacity.overlay": "1.0",
        "opacity.glass": "1.0",
    },
};

export const CozyCssVariables = processTheme(CozyTheme).cssVariables;
