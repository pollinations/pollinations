import type { LLMThemeResponse } from "../style/theme-processor";

export interface PresetMetadata {
    id: string;
    name: string;
    description: string;
    theme: LLMThemeResponse;
    cssVariables: Record<string, string>;
    backgroundHtml?: string;
}

/**
 * AUTO-DISCOVERY SYSTEM
 *
 * Just drop a new preset file in this directory - no manual registration needed!
 *
 * Requirements:
 * - File must export {Name}Theme: LLMThemeResponse
 * - File must export {Name}CssVariables: Record<string, string>
 * - File may export {Name}BackgroundHtml: string (optional - AI-generated background)
 * - Preset ID is derived from filename (e.g., ocean.ts -> "ocean")
 *
 * Note: Copy is now static in /src/copy/content/ - not part of presets.
 */
const presetModules = import.meta.glob<{
    [key: string]: LLMThemeResponse | Record<string, string>;
}>("./*.ts", { eager: true });

// Build PRESETS array dynamically
export const PRESETS: PresetMetadata[] = Object.entries(presetModules)
    .filter(([path]) => !path.includes("index.ts"))
    .map((entry): PresetMetadata | null => {
        const [path, module] = entry;
        const id = path.replace("./", "").replace(".ts", "");

        const themeName = Object.keys(module).find((key) =>
            key.endsWith("Theme"),
        );
        const cssVarsName = Object.keys(module).find((key) =>
            key.includes("CssVariables"),
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

        const theme = module[themeName] as LLMThemeResponse;
        const cssVariables = module[cssVarsName] as Record<string, string>;
        const backgroundHtml = backgroundName
            ? (module[backgroundName] as unknown as string)
            : undefined;

        const name = id.charAt(0).toUpperCase() + id.slice(1);
        const description = `${name} theme`;

        return {
            id,
            name,
            description,
            theme,
            cssVariables,
            backgroundHtml,
        };
    })
    .filter((preset): preset is PresetMetadata => preset !== null)
    .sort((a, b) => {
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
