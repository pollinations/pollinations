/** @type {import('tailwindcss').Config} */
/**
 * Legacy theme for the old Apps, Community and Play pages, loaded beside
 * @pollinations/ui's theme until those pages move to it. Names the shared
 * theme also defines (font-body, rounded-card, font-pixel) are left to it,
 * so the new pages render exactly as designed. Delete with the last old page.
 *
 * THEME GUIDE:
 * - To change colors: Edit src/theme/palette.ts
 * - CSS variables are defined in palette.ts (15 colors)
 * - Opacity: Add /90, /80, /50 etc. (e.g., bg-primary-strong/90)
 */
import plugin from "tailwindcss/plugin";
import { CSS_VARIABLES } from "./src/theme/palette";

// Pixel headings use the shared pixel font, so no web font is loaded here.
const Fonts = {
    title: "var(--polli-font-pixel)",
    headline: "var(--polli-font-pixel)",
};

export default {
    content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
    theme: {
        extend: {
            colors: {
                // Direct palette colors (15 total) — each supports opacity via /50 etc.
                dark: "rgb(var(--dark) / <alpha-value>)",
                muted: "rgb(var(--muted) / <alpha-value>)",
                subtle: "rgb(var(--subtle) / <alpha-value>)",
                white: "rgb(var(--white) / <alpha-value>)",
                cream: "rgb(var(--cream) / <alpha-value>)",
                tan: "rgb(var(--tan) / <alpha-value>)",
                border: "rgb(var(--border) / <alpha-value>)",
                "primary-light": "rgb(var(--primary-light) / <alpha-value>)",
                "primary-strong": "rgb(var(--primary-strong) / <alpha-value>)",
                "secondary-light":
                    "rgb(var(--secondary-light) / <alpha-value>)",
                "secondary-strong":
                    "rgb(var(--secondary-strong) / <alpha-value>)",
                "tertiary-light": "rgb(var(--tertiary-light) / <alpha-value>)",
                "tertiary-strong":
                    "rgb(var(--tertiary-strong) / <alpha-value>)",
                "accent-strong": "rgb(var(--accent-strong) / <alpha-value>)",
                "accent-light": "rgb(var(--accent-light) / <alpha-value>)",

                // Legacy aliases
                yellow: "rgb(var(--accent-strong))",
                lime: "rgb(var(--accent-strong))",
                charcoal: "rgb(var(--dark))",
                pink: "#ffd1b3",
            },
            stroke: {
                pink: "#ffd1b3",
                yellow: "rgb(var(--accent-strong))",
                charcoal: "rgb(var(--dark))",
            },
            fontFamily: {
                title: [Fonts.title],
                headline: [Fonts.headline],
            },
            boxShadow: {
                "brand-sm": "2px 2px 0px 0px rgb(var(--accent-strong))",
                "brand-md": "4px 4px 0px 0px rgb(var(--accent-strong))",
                "brand-lg": "6px 6px 0px 0px rgb(var(--accent-strong))",
                "dark-sm": "2px 2px 0px 0px rgb(var(--dark))",
                "dark-md": "4px 4px 0px 0px rgb(var(--dark))",
                "dark-lg": "6px 6px 0px 0px rgb(var(--dark))",
                "dark-xl": "12px 12px 0px 0px rgb(var(--dark))",
                "highlight-sm": "2px 2px 0px 0px rgb(var(--dark))",
                "highlight-md": "4px 4px 0px 0px rgb(var(--dark))",
            },
            borderRadius: {
                button: "0px",
                input: "0px",
                "sub-card": "0px",
                tag: "0px",
            },
            animation: {
                "pulse-subtle": "pulse-subtle 1.5s ease-in-out infinite",
                shimmer: "shimmer 2.5s ease-in-out infinite",
            },
            keyframes: {
                "pulse-subtle": {
                    "0%, 100%": {
                        opacity: "1",
                        transform: "scale(1)",
                        boxShadow: "0 0 0 0 rgb(var(--dark))",
                    },
                    "50%": {
                        opacity: "0.9",
                        transform: "scale(1.03)",
                        boxShadow: "0 0 8px 2px rgb(var(--dark))",
                    },
                },
                shimmer: {
                    "0%": {
                        backgroundPosition: "-200% 0",
                    },
                    "100%": {
                        backgroundPosition: "200% 0",
                    },
                },
            },
        },
    },
    plugins: [
        // Generate CSS custom properties from palette.ts
        plugin(({ addBase }) => {
            addBase({
                ":root": {
                    "--color-pink": "#ffd1b3",
                    ...CSS_VARIABLES,
                },
            });
        }),
        // Pixel-art utility classes
        plugin(({ addUtilities, addBase }) => {
            addBase({
                ".font-title, .font-headline": {
                    "-webkit-font-smoothing": "none",
                    "-moz-osx-font-smoothing": "grayscale",
                },
            });
            addUtilities({
                ".render-pixelated": {
                    "image-rendering": "pixelated",
                },
                ".pixel-border": {
                    "box-shadow":
                        "-4px 0 0 0 currentColor, 4px 0 0 0 currentColor, 0 -4px 0 0 currentColor, 0 4px 0 0 currentColor",
                },
            });
        }),
    ],
};
