/** @type {import('tailwindcss').Config} */
/**
 * THEME GUIDE:
 * - To change theme: Edit src/config/colors.js
 * - All colors imported from centralized colors.js
 * - Opacity: Add /90, /80, /50 etc. (e.g., bg-primary/90)
 * - CSS variables available: var(--color-primary), var(--color-background), etc.
 */
import { Theme, Palette, Fonts, Shadows } from "./src/config/colors.js";
import plugin from "tailwindcss/plugin";

export default {
    content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
    theme: {
        extend: {
            colors: {
                // Semantic tokens (Use these!)
                primary: "var(--color-primary)",
                secondary: "var(--color-secondary)",
                tertiary: "var(--color-tertiary)",
                background: "var(--color-background)",
                surface: "var(--color-surface)",
                foreground: "var(--color-foreground)",
                
                // Raw Palette (Avoid using directly if possible, use semantic tokens)
                lime: Palette.lime,
                rose: Palette.rose,
                cyan: Palette.cyan,
                offwhite: Palette.offwhite,
                offblack: Palette.offblack,
                black: Palette.black,
                white: Palette.white,
            },
            fontFamily: {
                title: [Fonts.title, "sans-serif"],
                headline: [Fonts.headline, "sans-serif"],
                body: [Fonts.body, "sans-serif"],
            },
            boxShadow: {
                // Semantic Shadows
                "primary-sm": Shadows.limeSm,
                "primary-md": Shadows.limeMd,
                "secondary-sm": Shadows.roseSm,
                "secondary-md": Shadows.roseMd,
                
                // From colors.js Shadows
                "rose-sm": Shadows.roseSm,
                "rose-3": Shadows.rose3,
                "rose-md": Shadows.roseMd,
                "rose-lg": Shadows.roseLg,
                "black-sm": Shadows.blackSm,
                "black-md": Shadows.blackMd,
                "black-lg": Shadows.blackLg,
                "black-xl": Shadows.blackXl,
                "lime-sm": Shadows.limeSm,
                "lime-3": Shadows.lime3,
                "lime-md": Shadows.limeMd,
                "offblack-muted": Shadows.offblackMuted,

                // Legacy names for backwards compatibility
                "brutal": Shadows.blackLg,
                "brutal-lime": `8px 8px 0px 0px ${Palette.limeShadow}`,
                "brutal-lg": `16px 16px 0px 0px ${Palette.black}`,
            },
        },
    },
    plugins: [
        // Generate CSS custom properties for use in raw CSS
        plugin(({ addBase }) => {
            addBase({
                ":root": {
                    // Semantic Variables
                    "--color-primary": Theme.primary,
                    "--color-secondary": Theme.secondary,
                    "--color-tertiary": Theme.tertiary,
                    "--color-background": Theme.background,
                    "--color-surface": Theme.surface,
                    "--color-foreground": Theme.foreground,
                    
                    // Raw Colors (for utility access if needed)
                    "--color-lime": Palette.lime,
                    "--color-rose": Palette.rose,
                    "--color-cyan": Palette.cyan,
                    "--color-offwhite": Palette.offwhite,
                    "--color-offblack": Palette.offblack,
                    "--color-black": Palette.black,
                },
            });
        }),
    ],
};
