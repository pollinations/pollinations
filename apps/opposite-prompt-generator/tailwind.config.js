/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./index.html",
        "./src/**/*.{js,jsx,ts,tsx}", // <-- scans all React files
    ],
    theme: {
        extend: {},
    },
    plugins: [],
};
