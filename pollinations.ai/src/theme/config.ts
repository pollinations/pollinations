/**
 * Theme Generation Configuration
 * Centralized config for AI models and settings
 */

export const THEME_CONFIG = {
    // Models
    models: {
        designer: "gemini", // Theme colors, fonts, spacing
        animator: "gemini", // WebGL background HTML generation
        illustrator: "nanobanana", // Supporter logo images
    },

    // Maximum variation seed (1 to maxSeed)
    // Set to 1 for 100% cache hit rate
    maxSeed: 1,
};
