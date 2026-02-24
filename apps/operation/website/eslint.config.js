import js from "@eslint/js";
import pluginReact from "eslint-plugin-react";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
    {
        files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
        languageOptions: {
            globals: globals.browser,
            ecmaVersion: 2020,
            sourceType: "module",
        },
    },
    {
        files: ["**/*.{cjs,mjs}"],
        languageOptions: {
            globals: globals.node,
            ecmaVersion: 2020,
            sourceType: "module",
        },
    },
    {
        files: ["data/scripts/**/*.mjs"],
        languageOptions: {
            globals: { ...globals.node, process: "readonly" },
            ecmaVersion: 2020,
            sourceType: "module",
        },
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    pluginReact.configs.flat.recommended,
    {
        settings: {
            react: {
                version: "detect",
            },
        },
        rules: {
            "react/react-in-jsx-scope": "off",
            "@typescript-eslint/no-unused-vars": [
                "error",
                { "argsIgnorePattern": "^_" },
            ],
        },
    },
];
