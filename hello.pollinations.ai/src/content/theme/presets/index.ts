import type { LLMThemeResponse } from "../engine";
import { ClassicTheme, ClassicCssVariables } from "./classic";
import { NeonTheme, NeonCssVariables } from "./neon";
import { MinimalTheme, MinimalCssVariables } from "./minimal";

export interface PresetMetadata {
    id: string;
    name: string;
    description: string;
    theme: LLMThemeResponse;
    cssVariables: Record<string, string>;
}

// Preset Registry
export const PRESETS: PresetMetadata[] = [
    {
        id: "classic",
        name: "Classic",
        description: "Hot pink & lime default theme",
        theme: ClassicTheme,
        cssVariables: ClassicCssVariables,
    },
    {
        id: "neon",
        name: "Neon",
        description: "Cyberpunk electric colors",
        theme: NeonTheme,
        cssVariables: NeonCssVariables,
    },
    {
        id: "minimal",
        name: "Minimal",
        description: "Pure black & white brutalism",
        theme: MinimalTheme,
        cssVariables: MinimalCssVariables,
    },
];

// Helper to get preset by ID
export function getPreset(id: string): PresetMetadata | undefined {
    return PRESETS.find((p) => p.id === id);
}

// Export default preset
export const DEFAULT_PRESET = PRESETS[0];
