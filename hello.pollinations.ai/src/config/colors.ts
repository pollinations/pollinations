import { DefaultTheme } from "./defaultTheme";
import { processTheme } from "./themeEngine";

// ============================================
// COLOR SYSTEM
// ============================================

// Process the default theme to get CSS variables
const { cssVariables } = processTheme(DefaultTheme);

// Export CSS variables for usage in Tailwind or other places if needed
export const DefaultCssVariables = cssVariables;

// ============================================
// FONTS
// ============================================

export const Fonts = {
    title: "Maven Pro",
    headline: "Mako",
    body: "Duru Sans",
};

// ============================================
// TEST UTILITIES
// ============================================

// Simple test modes using the new system
// We can implement these properly later if needed, for now just placeholders or simple overrides
export const TestModes = {
    allWhite: () => {
        console.warn("TestModes.allWhite not implemented in new system yet");
        return {};
    },
    allBlack: () => {
        console.warn("TestModes.allBlack not implemented in new system yet");
        return {};
    },
};
