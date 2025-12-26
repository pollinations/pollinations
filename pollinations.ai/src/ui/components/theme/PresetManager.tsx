import { X } from "lucide-react";
import type { FontState, RadiusState, ThemeState } from "./types";

interface PresetManagerProps {
    selectedPresetId: string;
    presets: Array<{ id: string; name: string }>;
    theme: ThemeState;
    radius: RadiusState;
    fonts: FontState;
    onPresetChange: (presetId: string) => void;
    onClose: () => void;
}

/**
 * Preset management and manipulation controls
 * Handles preset selection and export
 */
export function PresetManager({
    selectedPresetId,
    presets,
    onPresetChange,
    onClose,
}: PresetManagerProps) {
    return (
        <div className="flex flex-col border-b border-gray-100 relative">
            {/* Close Button - Top Right (alone at the top) */}
            <div className="w-full flex justify-end p-2">
                <button
                    type="button"
                    onClick={onClose}
                    className="p-1 text-gray-400 hover:text-black transition-colors"
                    title="Close"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            {/* Preset Dropdown - Below close button */}
            <div className="px-3 pb-3">
                <select
                    value={selectedPresetId}
                    onChange={(e) => onPresetChange(e.target.value)}
                    className="w-full px-2 py-1 text-[10px] font-mono bg-white border border-gray-200 rounded focus:outline-none focus:border-black"
                >
                    {presets.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                            {preset.name}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    );
}
