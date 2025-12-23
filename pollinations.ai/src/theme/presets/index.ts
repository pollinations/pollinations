import type { LLMThemeResponse } from "../style/theme-processor";
import type { ThemeCopy } from "../buildPrompts";
import { hydrateCopy } from "../guidelines/helpers/copywriter";

export interface PresetMetadata {
    id: string;
    name: string;
    description: string;
    theme: LLMThemeResponse;
    cssVariables: Record<string, string>;
    copy: ThemeCopy; // Required - all presets must have copy
    backgroundHtml?: string; // Optional - AI-generated WebGL background
}

/**
 * AUTO-DISCOVERY SYSTEM
 *
 * Just drop a new preset file in this directory - no manual registration needed!
 *
 * Requirements:
 * - File must export {Name}Theme: LLMThemeResponse
 * - File must export {Name}CssVariables: Record<string, string>
 * - File must export {Name}Copy: Record<string, string> (REQUIRED - flat copy format)
 * - File may export {Name}BackgroundHtml: string (optional - AI-generated background)
 * - Preset ID is derived from filename (e.g., ocean.ts -> "ocean")
 *
 * See README.md for more details.
 */
const presetModules = import.meta.glob<{
    [key: string]: LLMThemeResponse | Record<string, string>;
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
        const backgroundName = Object.keys(module).find((key) =>
            key.endsWith("BackgroundHtml"),
        );

        if (!themeName || !cssVarsName) {
            console.warn(
                `Preset ${id} is missing required exports (${id}Theme and ${id}CssVariables)`,
            );
            return null;
        }

        if (!copyName) {
            console.warn(
                `Preset ${id} is missing required Copy export. All presets must have copy.`,
            );
            return null;
        }

        const theme = module[themeName] as LLMThemeResponse;
        const cssVariables = module[cssVarsName] as Record<string, string>;
        const rawCopy = module[copyName] as Record<string, string>;
        const backgroundHtml = backgroundName
            ? (module[backgroundName] as unknown as string)
            : undefined;

        // Hydrate flat copy into full structure
        const copy = hydrateCopy(rawCopy);

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
            backgroundHtml,
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
