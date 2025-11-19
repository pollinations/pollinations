/** @type {import('tailwindcss').Config} */
/**
 * THEME GUIDE:
 * - To change theme: Edit src/config/colors.js
 * - All colors imported from centralized colors.js
 * - Opacity: Add /90, /80, /50 etc. (e.g., bg-primary/90)
 * - CSS variables available: var(--color-primary), var(--color-background), etc.
 */
import { Palette, Fonts, Shadows } from "./src/config/colors";
import plugin from "tailwindcss/plugin";

export default {
    content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
    theme: {
        extend: {
            colors: {
                // Raw Palette (Avoid using directly if possible, use semantic tokens)
                yellow: Palette.yellow,
                lime: Palette.lime,
                pink: Palette.pink,
                cyan: Palette.cyan,
                
                // Monochrome Scale
                charcoal: Palette.charcoal,
                "gray-dark": Palette.grayDark,
                gray: Palette.gray,
                "gray-medium": Palette.grayMedium,
                "gray-light": Palette.grayLight,
                "gray-ultra-light": Palette.grayUltraLight,
            },
            fontFamily: {
                title: [Fonts.title, "sans-serif"],
                headline: [Fonts.headline, "sans-serif"],
                body: [Fonts.body, "sans-serif"],
            },
            boxShadow: {
                // From colors.js Shadows
                "pink-sm": Shadows.pinkSm,
                "pink-3": Shadows.pink3,
                "pink-md": Shadows.pinkMd,
                "pink-lg": Shadows.pinkLg,
                "black-sm": Shadows.blackSm,
                "black-md": Shadows.blackMd,
                "black-lg": Shadows.blackLg,
                "black-xl": Shadows.blackXl,
                "lime-sm": Shadows.limeSm,
                "lime-3": Shadows.lime3,
                "lime-md": Shadows.limeMd,
                "charcoal-muted": Shadows.charcoalMuted,

                // Legacy names for backwards compatibility
                "brutal": Shadows.blackLg,
                "brutal-lime": `8px 8px 0px 0px ${Palette.lime}`,
                "brutal-lg": `16px 16px 0px 0px ${Palette.black}`,
            },
        },
    },
    plugins: [
        // Generate CSS custom properties for use in raw CSS
        plugin(({ addBase }) => {
            addBase({
                ":root": {
                    // Raw Colors (for utility access if needed)
                    "--color-yellow": Palette.yellow,
                    "--color-pink": Palette.pink,
                    "--color-cyan": Palette.cyan,
                    "--color-light-gray": Palette.lightGray,
                    "--color-charcoal": Palette.charcoal,
                    "--color-black": Palette.black,
                },
            });
        }),
    ],
};
