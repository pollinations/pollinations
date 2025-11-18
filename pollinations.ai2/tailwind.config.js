/** @type {import('tailwindcss').Config} */
/**
 * THEME GUIDE:
 * - To change theme: Edit src/config/colors.js
 * - All colors imported from centralized colors.js
 * - Opacity: Add /90, /80, /50 etc. (e.g., bg-lime/90)
 * - CSS variables available: var(--color-lime), var(--color-rose), etc.
 */
import { Colors, Fonts, Shadows } from "./src/config/colors.js";
import plugin from "tailwindcss/plugin";

export default {
    content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
    theme: {
        extend: {
            colors: {
                // Brand colors from colors.js
                lime: Colors.lime,
                rose: Colors.rose,
                offwhite: Colors.offwhite,
                offblack: Colors.offblack,
                black: Colors.black,

                // Semantic aliases (easier theming)
                primary: Colors.lime,
                accent: Colors.rose,
                background: Colors.offwhite,
                foreground: Colors.offblack,
            },
            fontFamily: {
                title: [Fonts.title, "sans-serif"],
                headline: [Fonts.headline, "sans-serif"],
                body: [Fonts.body, "sans-serif"],
            },
            boxShadow: {
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
                "brutal-lime": `8px 8px 0px 0px ${Colors.limeShadow}`,
                "brutal-lg": `16px 16px 0px 0px ${Colors.black}`,
            },
        },
    },
    plugins: [
        // Generate CSS custom properties for use in raw CSS
        plugin(({ addBase }) => {
            addBase({
                ":root": {
                    "--color-lime": Colors.lime,
                    "--color-rose": Colors.rose,
                    "--color-offwhite": Colors.offwhite,
                    "--color-offblack": Colors.offblack,
                    "--color-black": Colors.black,
                    "--color-lime-shadow": Colors.limeShadow,
                },
            });
        }),
    ],
};
