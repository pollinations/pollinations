// Convert rgba() to #rrggbb for color inputs (they don't support rgba)
export const rgbaToHex = (color: string): string => {
    // Already hex - return as is
    if (color.startsWith("#")) {
        // Ensure it's #rrggbb format (not #rrggbbaa)
        return color.substring(0, 7);
    }

    // Parse rgba(r, g, b, a) format
    const rgbaMatch = color.match(
        /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/,
    );
    if (rgbaMatch) {
        const r = parseInt(rgbaMatch[1]);
        const g = parseInt(rgbaMatch[2]);
        const b = parseInt(rgbaMatch[3]);
        return `#${r.toString(16).padStart(2, "0")}${g
            .toString(16)
            .padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
    }

    // Fallback to black if we can't parse
    return "#000000";
};

export const tokenToCssVar = (id: string) => {
    // Replace dots with hyphens for CSS variable names (e.g., text.primary -> --text-primary)
    return `--${id.replace(/\./g, "-")}`;
};
