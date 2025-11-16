/** @type {import('tailwindcss').Config} */
export default {
    content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
    theme: {
        extend: {
            colors: {
                lime: "#ecf874",
                offwhite: "#c7d4d6",
                offblack: "#110518",
                "offblack-2": "#181A2C",
                gray1: "#B3B3B3",
                gray2: "#8A8A8A",
                special: "rgb(191, 64, 64)",
                rose: "#ff69b4",
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
