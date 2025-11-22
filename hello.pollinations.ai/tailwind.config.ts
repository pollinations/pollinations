/** @type {import('tailwindcss').Config} */
/**
 * THEME GUIDE:
 * - To change theme: Edit src/config/colors.js
 * - All colors imported from centralized colors.js
 * - Opacity: Add /90, /80, /50 etc. (e.g., bg-primary/90)
 * - CSS variables available: var(--color-primary), var(--color-background), etc.
 */
import type { Config } from "tailwindcss";
import {
    ClassicTheme,
    themeToDictionary,
    ClassicCssVariables,
} from "./src/content/theme";
import plugin from "tailwindcss/plugin";

// Font family names
// Font family names
const Fonts = {
    title: "var(--font-title, 'Maven Pro')",
    headline: "var(--font-headline, 'Mako')",
    body: "var(--font-body, 'Duru Sans')",
};

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
                "text-body-main": "var(--text-primary)",
                "text-body-secondary": "var(--text-secondary)",
                "text-body-tertiary": "var(--text-tertiary)",
                "text-caption": "var(--text-caption)",
                "text-on-color": "var(--text-inverse)",
                "text-brand": "var(--text-brand)",
                "text-highlight": "var(--text-highlight)",

                // Surfaces
                "surface-page": "var(--surface-page)",
                "surface-card": "var(--surface-card)",
                "surface-base": "var(--surface-base)",
                "input-background": "var(--input-bg)",

                // Buttons
                "button-primary-bg": "var(--button-primary-bg)",
                "button-secondary-bg": "var(--button-secondary-bg)",
                "button-disabled-bg": "var(--button-disabled-bg)",
                "button-hover-overlay": "var(--button-hover-overlay)",
                "button-active-overlay": "var(--button-active-overlay)",
                "button-focus-ring": "var(--button-focus-ring)",

                // Indicators
                "indicator-image": "var(--indicator-image)",
                "indicator-text": "var(--indicator-text)",
                "indicator-audio": "var(--indicator-audio)",

                // Borders
                "border-brand": "var(--border-brand)",
                "border-highlight": "var(--border-highlight)",
                "border-main": "var(--border-main)",
                "border-strong": "var(--border-strong)",
                "border-subtle": "var(--border-subtle)",
                "border-faint": "var(--border-faint)",

                // Logo
                "logo-main": "var(--logo-main)",
                "logo-shade": "var(--logo-accent)",
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
                "shadow-brand-sm": "2px 2px 0px 0px var(--shadow-brand-sm)",
                "shadow-brand-md": "4px 4px 0px 0px var(--shadow-brand-md)",
                "shadow-brand-lg": "6px 6px 0px 0px var(--shadow-brand-lg)",

                // Dark shadows
                "shadow-dark-sm": "2px 2px 0px 0px var(--shadow-dark-sm)",
                "shadow-dark-md": "4px 4px 0px 0px var(--shadow-dark-md)",
                "shadow-dark-lg": "6px 6px 0px 0px var(--shadow-dark-lg)",
                "shadow-dark-xl": "12px 12px 0px 0px var(--shadow-dark-xl)",

                // Highlight shadows
                "shadow-highlight-sm":
                    "2px 2px 0px 0px var(--shadow-highlight-sm)",
                "shadow-highlight-md":
                    "4px 4px 0px 0px var(--shadow-highlight-md)",
            },
            borderRadius: {
                button: "var(--radius-button)",
                card: "var(--radius-card)",
                input: "var(--radius-input)",
                "sub-card": "var(--radius-subcard)",
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

                    // Inject Default Theme Variables
                    ...ClassicCssVariables,
                },
            });
        }),
    ],
};
