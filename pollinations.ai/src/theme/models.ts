/**
 * Theme Generation Model Configuration
 * Centralized config for all AI models used in theme generation
 */

export const THEME_MODELS = {
    // Text generation models (for design tokens, copy, backgrounds)
    designer: "gemini", // Theme colors, fonts, spacing
    copywriter: "gemini", // Page copy rewriting
    animator: "gemini", // WebGL background HTML generation

    // Image generation models
    illustrator: "nanobanana", // Supporter logo images
};
