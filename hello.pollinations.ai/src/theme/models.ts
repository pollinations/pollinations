/**
 * Theme Generation Model Configuration
 * Centralized config for all AI models used in theme generation
 */

export const THEME_MODELS = {
    // Text generation models (for design tokens, copy, backgrounds)
    designer: "gemini-large", // Theme colors, fonts, spacing
    copywriter: "gemini-large", // Page copy rewriting
    animator: "gemini-large", // WebGL background HTML generation

    // Image generation models
    illustrator: "nanobanana", // Supporter logo images
};
