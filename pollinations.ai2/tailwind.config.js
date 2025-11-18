/** @type {import('tailwindcss').Config} */
/**
 * THEME GUIDE:
 * - To change theme: Edit src/config/colors.js
 * - All colors imported from centralized colors.js
 * - Opacity: Add /90, /80, /50 etc. (e.g., bg-lime/90)
 */
import { Colors, Fonts, Shadows } from "./src/config/colors.js";

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

                // Additional shades
                "offblack-2": Colors.offblack2,
                gray1: Colors.gray1,
                gray2: Colors.gray2,
            },
            fontFamily: {
                title: [Fonts.title, "sans-serif"],
                headline: [Fonts.headline, "sans-serif"],
                body: [Fonts.body, "sans-serif"],
            },
            boxShadow: {
                // From colors.js Shadows
                "rose-sm": Shadows.roseSm,
                "rose-md": Shadows.roseMd,
                "rose-lg": Shadows.roseLg,
                "black-sm": Shadows.blackSm,
                "black-md": Shadows.blackMd,
                "black-lg": Shadows.blackLg,
                "lime-sm": Shadows.limeSm,
                "lime-md": Shadows.limeMd,
                "offblack-muted": Shadows.offblackMuted,

                // Legacy names for backwards compatibility
                "brutal": Shadows.blackLg,
                "brutal-lime": `8px 8px 0px 0px ${Colors.limeShadow}`,
                "brutal-lg": `16px 16px 0px 0px ${Colors.black}`,
            },
        },
    },
    plugins: [],
};
