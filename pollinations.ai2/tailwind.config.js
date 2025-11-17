/** @type {import('tailwindcss').Config} */
/**
 * THEME GUIDE:
 * - To change theme: Edit colors below and rebuild
 * - Use semantic names (primary/accent) in new code
 * - Original names (lime/rose) kept for existing code
 * - Opacity: Add /90, /80, /50 etc. (e.g., bg-lime/90)
 */
export default {
    content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
    theme: {
        extend: {
            colors: {
                // Brand colors
                lime: "#ecf874",
                rose: "#ff69b4",
                offwhite: "#c7d4d6",
                offblack: "#110518",

                // Semantic aliases (easier theming)
                primary: "#ecf874", // lime - main accent
                accent: "#ff69b4", // rose - borders/highlights
                background: "#c7d4d6", // offwhite - page bg
                foreground: "#110518", // offblack - text

                // Additional shades
                "offblack-2": "#181A2C",
                gray1: "#B3B3B3",
                gray2: "#8A8A8A",
            },
            fontFamily: {
                title: ["Maven Pro", "sans-serif"],
                headline: ["Mako", "sans-serif"],
                body: ["Duru Sans", "sans-serif"],
            },
            boxShadow: {
                "brutal": "8px 8px 0px 0px rgba(0,0,0,1)",
                "brutal-lime": "8px 8px 0px 0px rgba(236,248,116,1)",
                "brutal-lg": "16px 16px 0px 0px rgba(0,0,0,1)",
            },
        },
    },
    plugins: [],
};
