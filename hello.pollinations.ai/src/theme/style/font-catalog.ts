export interface FontDefinition {
    family: string;
    category:
        | "classic"
        | "tech"
        | "minimal"
        | "creative"
        | "handwriting"
        | "display";
    type: "sans-serif" | "serif" | "display" | "monospace" | "handwriting";
}

// Standard weights to load for all fonts to simplify config
const DEFAULT_WEIGHTS = ["300", "400", "500", "700"];

export const FONT_LIBRARY: Record<string, FontDefinition> = {
    // CLASSIC / NEUTRAL
    "Maven Pro": {
        family: "Maven Pro",
        category: "classic",
        type: "sans-serif",
    },
    "Mako": { family: "Mako", category: "classic", type: "sans-serif" },
    "Duru Sans": {
        family: "Duru Sans",
        category: "classic",
        type: "sans-serif",
    },
    "Merriweather": {
        family: "Merriweather",
        category: "classic",
        type: "serif",
    },
    "Playfair Display": {
        family: "Playfair Display",
        category: "classic",
        type: "serif",
    },
    "Lato": { family: "Lato", category: "classic", type: "sans-serif" },
    "Open Sans": {
        family: "Open Sans",
        category: "classic",
        type: "sans-serif",
    },
    "PT Sans": { family: "PT Sans", category: "classic", type: "sans-serif" },
    "PT Serif": { family: "PT Serif", category: "classic", type: "serif" },
    "Source Sans Pro": {
        family: "Source Sans Pro",
        category: "classic",
        type: "sans-serif",
    },

    // MINIMAL / CLEAN
    "Inter": { family: "Inter", category: "minimal", type: "sans-serif" },
    "Roboto": { family: "Roboto", category: "minimal", type: "sans-serif" },
    "Quicksand": {
        family: "Quicksand",
        category: "minimal",
        type: "sans-serif",
    },
    "Poppins": { family: "Poppins", category: "minimal", type: "sans-serif" },
    "Montserrat": {
        family: "Montserrat",
        category: "minimal",
        type: "sans-serif",
    },
    "Nunito": { family: "Nunito", category: "minimal", type: "sans-serif" },
    "Raleway": { family: "Raleway", category: "minimal", type: "sans-serif" },
    "Work Sans": {
        family: "Work Sans",
        category: "minimal",
        type: "sans-serif",
    },
    "DM Sans": { family: "DM Sans", category: "minimal", type: "sans-serif" },
    "Outfit": { family: "Outfit", category: "minimal", type: "sans-serif" },

    // TECH / FUTURISTIC
    "Orbitron": { family: "Orbitron", category: "tech", type: "sans-serif" },
    "Rajdhani": { family: "Rajdhani", category: "tech", type: "sans-serif" },
    "Exo 2": { family: "Exo 2", category: "tech", type: "sans-serif" },
    "Teko": { family: "Teko", category: "tech", type: "sans-serif" },
    "Chakra Petch": {
        family: "Chakra Petch",
        category: "tech",
        type: "sans-serif",
    },
    "Michroma": { family: "Michroma", category: "tech", type: "sans-serif" },
    "Audiowide": { family: "Audiowide", category: "tech", type: "display" },
    "Share Tech Mono": {
        family: "Share Tech Mono",
        category: "tech",
        type: "monospace",
    },
    "Syncopate": { family: "Syncopate", category: "tech", type: "sans-serif" },
    "Titillium Web": {
        family: "Titillium Web",
        category: "tech",
        type: "sans-serif",
    },

    // CREATIVE / DISPLAY
    "Lora": { family: "Lora", category: "creative", type: "serif" },
    "Fredoka": { family: "Fredoka", category: "creative", type: "sans-serif" },
    "Abril Fatface": {
        family: "Abril Fatface",
        category: "creative",
        type: "display",
    },
    "Righteous": { family: "Righteous", category: "creative", type: "display" },
    "Comfortaa": { family: "Comfortaa", category: "creative", type: "display" },
    "Bangers": { family: "Bangers", category: "creative", type: "display" },
    "Lobster": { family: "Lobster", category: "creative", type: "display" },
    "Pacifico": {
        family: "Pacifico",
        category: "creative",
        type: "handwriting",
    },
    "Permanent Marker": {
        family: "Permanent Marker",
        category: "creative",
        type: "handwriting",
    },
    "Alfa Slab One": {
        family: "Alfa Slab One",
        category: "creative",
        type: "display",
    },
    "Chewy": { family: "Chewy", category: "creative", type: "display" },
    "Press Start 2P": {
        family: "Press Start 2P",
        category: "tech",
        type: "display",
    }, // Pixel art style
    "Rubik Mono One": {
        family: "Rubik Mono One",
        category: "creative",
        type: "sans-serif",
    },
    "Cinzel": { family: "Cinzel", category: "creative", type: "serif" },
    "Cormorant Garamond": {
        family: "Cormorant Garamond",
        category: "creative",
        type: "serif",
    },
};

// Helper to get the array of font strings for WebFontLoader
// Automatically appends default weights to all fonts
export const getGoogleFontFamilies = (): string[] => {
    return Object.values(FONT_LIBRARY).map((font) => {
        return `${font.family}:${DEFAULT_WEIGHTS.join(",")}`;
    });
};
