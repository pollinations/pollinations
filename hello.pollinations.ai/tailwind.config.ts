/** @type {import('tailwindcss').Config} */
/**
 * THEME GUIDE:
 * - To change theme: Edit src/config/colors.js
 * - All colors imported from centralized colors.js
 * - Opacity: Add /90, /80, /50 etc. (e.g., bg-primary/90)
 * - CSS variables available: var(--color-primary), var(--color-background), etc.
 */
import { Tokens, Fonts } from "./src/config/colors";
import plugin from "tailwindcss/plugin";

export default {
    content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
    theme: {
        extend: {
            colors: {
                // Legacy Palette Support (using raw values for now, should migrate to tokens)
                yellow: "var(--color-yellow, #ecf874)",
                lime: "var(--color-lime, #bef264)",
                pink: "var(--color-pink, #ff69b4)",
                cyan: "var(--color-cyan, #74f8ec)",

                // Monochrome Scale
                charcoal: "var(--color-charcoal, #110518)",
                "gray-dark": "var(--color-grayDark, #4a5557)",
                gray: "var(--color-gray, #6e7a7c)",
                "gray-medium": "var(--color-grayMedium, #BFCACC)",
                "gray-light": "var(--color-grayLight, #c7d4d6)",
                "gray-ultra-light": "var(--color-grayUltraLight, #dce4e6)",

                // ============================================
                // SEMANTIC TOKENS
                // ============================================
                
                // Typography
                "text-body-main": `var(--token-text-body-main, ${Tokens.text.body.main})`,
                "text-body-secondary": `var(--token-text-body-secondary, ${Tokens.text.body.secondary})`,
                "text-body-tertiary": `var(--token-text-body-tertiary, ${Tokens.text.body.tertiary})`,
                "text-caption": `var(--token-text-caption, ${Tokens.text.caption})`,
                "text-on-color": `var(--token-text-on-color, ${Tokens.text["on-color"]})`,
                "text-brand": `var(--token-text-brand, ${Tokens.text.brand})`,
                "text-highlight": `var(--token-text-highlight, ${Tokens.text.highlight})`,

                // Surfaces
                "surface-page": `var(--token-surface-page, ${Tokens.surface.page})`,
                "surface-card": `var(--token-surface-card, ${Tokens.surface.card})`,
                "surface-base": `var(--token-surface-base, ${Tokens.surface.base})`,
                "input-background": `var(--token-input-background, ${Tokens.input.background})`,

                // Buttons
                "button-primary-bg": `var(--token-button-primary-background, ${Tokens.button.primary.background})`,
                "button-secondary-bg": `var(--token-button-secondary-background, ${Tokens.button.secondary.background})`,
                "button-disabled-bg": `var(--token-button-disabled-background, ${Tokens.button.disabled.background})`,
                "button-hover-overlay": `var(--token-button-hover-overlay, ${Tokens.button.hover.overlay})`,
                "button-active-overlay": `var(--token-button-active-overlay, ${Tokens.button.active.overlay})`,
                "button-focus-ring": `var(--token-button-focus-ring, ${Tokens.button.focus.ring})`,

                // Indicators
                "indicator-image": `var(--token-indicator-image, ${Tokens.indicator.image})`,
                "indicator-text": `var(--token-indicator-text, ${Tokens.indicator.text})`,
                "indicator-audio": `var(--token-indicator-audio, ${Tokens.indicator.audio})`,

                // Borders
                "border-brand": `var(--token-border-brand, ${Tokens.border.brand})`,
                "border-highlight": `var(--token-border-highlight, ${Tokens.border.highlight})`,
                "border-main": `var(--token-border-main, ${Tokens.border.main})`,
                "border-strong": `var(--token-border-strong, ${Tokens.border.strong})`,
                "border-subtle": `var(--token-border-subtle, ${Tokens.border.subtle})`,
                "border-faint": `var(--token-border-faint, ${Tokens.border.faint})`,

                // Logo
                "logo-main": `var(--token-logo-main, ${Tokens.logo.main})`,
                "logo-shade": `var(--token-logo-shade, ${Tokens.logo.shade})`,
            },
            stroke: {
                // SVG stroke colors using CSS variables
                pink: "var(--color-pink, #ff69b4)",
                yellow: "var(--color-yellow, #ecf874)",
                charcoal: "var(--color-charcoal, #110518)",
            },
            fontFamily: {
                title: [Fonts.title, "sans-serif"],
                headline: [Fonts.headline, "sans-serif"],
                body: [Fonts.body, "sans-serif"],
            },
            boxShadow: {
                // Shadows use CSS variables for colors
                "pink-sm": "2px 2px 0px 0px var(--color-pink, #ff69b4)",
                "pink-3": "3px 3px 0px 0px var(--color-pink, #ff69b4)",
                "pink-md": "4px 4px 0px 0px var(--color-pink, #ff69b4)",
                "pink-lg": "6px 6px 0px 0px var(--color-pink, #ff69b4)",

                "charcoal-sm": "2px 2px 0px 0px var(--color-charcoal, #110518)",
                "charcoal-md": "4px 4px 0px 0px var(--color-charcoal, #110518)",
                "charcoal-lg": "6px 6px 0px 0px var(--color-charcoal, #110518)",
                "charcoal-xl":
                    "12px 12px 0px 0px var(--color-charcoal, #110518)",

                "lime-sm": "2px 2px 0px 0px var(--color-lime, #bef264)",
                "lime-3": "3px 3px 0px 0px var(--color-lime, #bef264)",
                "lime-md": "4px 4px 0px 0px var(--color-lime, #bef264)",

                // ============================================
                // SEMANTIC TOKEN SHADOWS
                // ============================================
                // Brand shadows
                "shadow-brand-sm": `2px 2px 0px 0px var(--token-shadow-brand-sm, ${Tokens.shadow.brand.sm})`,
                "shadow-brand-md": `4px 4px 0px 0px var(--token-shadow-brand-md, ${Tokens.shadow.brand.md})`,
                "shadow-brand-lg": `6px 6px 0px 0px var(--token-shadow-brand-lg, ${Tokens.shadow.brand.lg})`,

                // Dark shadows
                "shadow-dark-sm": `2px 2px 0px 0px var(--token-shadow-dark-sm, ${Tokens.shadow.dark.sm})`,
                "shadow-dark-md": `4px 4px 0px 0px var(--token-shadow-dark-md, ${Tokens.shadow.dark.md})`,
                "shadow-dark-lg": `6px 6px 0px 0px var(--token-shadow-dark-lg, ${Tokens.shadow.dark.lg})`,
                "shadow-dark-xl": `12px 12px 0px 0px var(--token-shadow-dark-xl, ${Tokens.shadow.dark.xl})`,

                // Highlight shadows
                "shadow-highlight-sm": `2px 2px 0px 0px var(--token-shadow-highlight-sm, ${Tokens.shadow.highlight.sm})`,
                "shadow-highlight-md": `4px 4px 0px 0px var(--token-shadow-highlight-md, ${Tokens.shadow.highlight.md})`,
            },
        },
    },
    plugins: [
        // Generate CSS custom properties for use in raw CSS
        plugin(({ addBase }) => {
            addBase({
                ":root": {
                    // CSS variables for Tailwind colors
                    "--color-yellow": "#ecf874",
                    "--color-pink": "#ff69b4",
                    "--color-cyan": "#74f8ec",
                    "--color-charcoal": "#110518",

                    // Semantic Token Variables
                    "--token-text-body-main": Tokens.text.body.main,
                    "--token-text-body-secondary": Tokens.text.body.secondary,
                    "--token-text-body-tertiary": Tokens.text.body.tertiary,
                    "--token-text-caption": Tokens.text.caption,
                    "--token-text-on-color": Tokens.text["on-color"],
                    "--token-text-brand": Tokens.text.brand,
                    "--token-text-highlight": Tokens.text.highlight,

                    "--token-surface-page": Tokens.surface.page,
                    "--token-surface-card": Tokens.surface.card,
                    "--token-surface-base": Tokens.surface.base,
                    "--token-input-background": Tokens.input.background,

                    "--token-button-primary-background": Tokens.button.primary.background,
                    "--token-button-secondary-background": Tokens.button.secondary.background,
                    "--token-button-disabled-background": Tokens.button.disabled.background,
                    "--token-button-hover-overlay": Tokens.button.hover.overlay,
                    "--token-button-active-overlay": Tokens.button.active.overlay,
                    "--token-button-focus-ring": Tokens.button.focus.ring,

                    "--token-indicator-image": Tokens.indicator.image,
                    "--token-indicator-text": Tokens.indicator.text,
                    "--token-indicator-audio": Tokens.indicator.audio,

                    "--token-border-brand": Tokens.border.brand,
                    "--token-border-highlight": Tokens.border.highlight,
                    "--token-border-main": Tokens.border.main,
                    "--token-border-strong": Tokens.border.strong,
                    "--token-border-subtle": Tokens.border.subtle,
                    "--token-border-faint": Tokens.border.faint,

                    "--token-shadow-brand-sm": Tokens.shadow.brand.sm,
                    "--token-shadow-brand-md": Tokens.shadow.brand.md,
                    "--token-shadow-brand-lg": Tokens.shadow.brand.lg,
                    "--token-shadow-dark-sm": Tokens.shadow.dark.sm,
                    "--token-shadow-dark-md": Tokens.shadow.dark.md,
                    "--token-shadow-dark-lg": Tokens.shadow.dark.lg,
                    "--token-shadow-dark-xl": Tokens.shadow.dark.xl,
                    "--token-shadow-highlight-sm": Tokens.shadow.highlight.sm,
                    "--token-shadow-highlight-md": Tokens.shadow.highlight.md,

                    "--token-logo-main": Tokens.logo.main,
                    "--token-logo-shade": Tokens.logo.shade,
                },
            });
        }),
    ],
};
