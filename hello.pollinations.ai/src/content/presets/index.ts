import type { LLMThemeResponse } from "../theme/engine";
import type { ThemeCopy } from "../buildPrompts";

export interface PresetMetadata {
    id: string;
    name: string;
    description: string;
    theme: LLMThemeResponse;
    cssVariables: Record<string, string>;
    copy?: ThemeCopy; // Optional - not all presets have custom copy yet
}

/**
 * AUTO-DISCOVERY SYSTEM
 *
 * Just drop a new preset file in this directory - no manual registration needed!
 *
 * Requirements:
 * - File must export {Name}Theme: LLMThemeResponse
 * - File must export {Name}CssVariables: Record<string, string>
 * - Preset ID is derived from filename (e.g., ocean.ts -> "ocean")
 *
 * See README.md for more details.
 */
const presetModules = import.meta.glob<{
    [key: string]: LLMThemeResponse | Record<string, string> | ThemeCopy;
}>("./*.ts", { eager: true });

// Build PRESETS array dynamically
export const PRESETS: PresetMetadata[] = Object.entries(presetModules)
    .filter(([path]) => !path.includes("index.ts")) // Skip index.ts itself
    .map((entry): PresetMetadata | null => {
        const [path, module] = entry;
        // Extract filename without extension (e.g., "./classic.ts" -> "classic")
        const id = path.replace("./", "").replace(".ts", "");

        // Find the theme, CSS variables, and copy exports
        // Convention: {Name}Theme, {Name}CssVariables, {Name}Copy (optional)
        const themeName = Object.keys(module).find((key) =>
            key.endsWith("Theme"),
        );
        const cssVarsName = Object.keys(module).find((key) =>
            key.includes("CssVariables"),
        );
        const copyName = Object.keys(module).find((key) =>
            key.endsWith("Copy"),
        );

        if (!themeName || !cssVarsName) {
            console.warn(
                `Preset ${id} is missing required exports (${id}Theme and ${id}CssVariables)`,
            );
            return null;
        }

        const theme = module[themeName] as LLMThemeResponse;
        const cssVariables = module[cssVarsName] as Record<string, string>;
        const copy = copyName
            ? (module[copyName] as unknown as ThemeCopy)
            : undefined;

        // Generate name from ID (capitalize first letter)
        const name = id.charAt(0).toUpperCase() + id.slice(1);

        // Extract description from theme if available, or generate default
        const description = `${name} theme`;

        return {
            id,
            name,
            description,
            theme,
            cssVariables,
            copy,
        };
    })
    .filter((preset): preset is PresetMetadata => preset !== null)
    .sort((a, b) => {
        // Keep "classic" first, then alphabetical
        if (a.id === "classic") return -1;
        if (b.id === "classic") return 1;
        return a.name.localeCompare(b.name);
    });

// Helper to get preset by ID
export function getPreset(id: string): PresetMetadata | undefined {
    return PRESETS.find((p) => p.id === id);
}

// Export default preset
export const DEFAULT_PRESET = PRESETS[0];
