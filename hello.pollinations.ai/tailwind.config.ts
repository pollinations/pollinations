/** @type {import('tailwindcss').Config} */
/**
 * THEME GUIDE:
 * - To change theme: Edit src/config/colors.js
 * - All colors imported from centralized colors.js
 * - Opacity: Add /90, /80, /50 etc. (e.g., bg-primary/90)
 * - CSS variables available: var(--color-primary), var(--color-background), etc.
 */
import { Fonts, DefaultCssVariables } from "./src/config/colors";
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
                "text-body-main": "var(--t001)",
                "text-body-secondary": "var(--t002)",
                "text-body-tertiary": "var(--t003)",
                "text-caption": "var(--t004)",
                "text-on-color": "var(--t005)",
                "text-brand": "var(--t006)",
                "text-highlight": "var(--t007)",

                // Surfaces
                "surface-page": "var(--t008)",
                "surface-card": "var(--t009)",
                "surface-base": "var(--t010)",
                "input-background": "var(--t011)",

                // Buttons
                "button-primary-bg": "var(--t012)",
                "button-secondary-bg": "var(--t013)",
                "button-disabled-bg": "var(--t014)",
                "button-hover-overlay": "var(--t015)",
                "button-active-overlay": "var(--t016)",
                "button-focus-ring": "var(--t017)",

                // Indicators
                "indicator-image": "var(--t018)",
                "indicator-text": "var(--t019)",
                "indicator-audio": "var(--t020)",

                // Borders
                "border-brand": "var(--t021)",
                "border-highlight": "var(--t022)",
                "border-main": "var(--t023)",
                "border-strong": "var(--t024)",
                "border-subtle": "var(--t025)",
                "border-faint": "var(--t026)",

                // Logo
                "logo-main": "var(--t036)",
                "logo-shade": "var(--t037)",
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
                "shadow-brand-sm": "2px 2px 0px 0px var(--t027)",
                "shadow-brand-md": "4px 4px 0px 0px var(--t028)",
                "shadow-brand-lg": "6px 6px 0px 0px var(--t029)",

                // Dark shadows
                "shadow-dark-sm": "2px 2px 0px 0px var(--t030)",
                "shadow-dark-md": "4px 4px 0px 0px var(--t031)",
                "shadow-dark-lg": "6px 6px 0px 0px var(--t032)",
                "shadow-dark-xl": "12px 12px 0px 0px var(--t033)",

                // Highlight shadows
                "shadow-highlight-sm": "2px 2px 0px 0px var(--t034)",
                "shadow-highlight-md": "4px 4px 0px 0px var(--t035)",
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
                    ...DefaultCssVariables,
                },
            });
        }),
    ],
};
