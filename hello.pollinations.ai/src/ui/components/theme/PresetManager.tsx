import {
    CheckIcon,
    ShuffleIcon,
    PaletteIcon,
    DownloadIcon,
} from "lucide-react";

interface PresetManagerProps {
    selectedPresetId: string;
    presets: Array<{ id: string; name: string }>;
    onPresetChange: (presetId: string) => void;
    onDownload: () => void;
    onRandomizeColors: () => void;
    onRandomizeAssignments: () => void;
    onSetAllWhite: () => void;
    onSetAllBlack: () => void;
    onClose: () => void;
}

/**
 * Preset management and manipulation controls
 * Handles preset selection, randomization, and export
 */
export function PresetManager({
    selectedPresetId,
    presets,
    onPresetChange,
    onDownload,
    onRandomizeColors,
    onRandomizeAssignments,
    onSetAllWhite,
    onSetAllBlack,
    onClose,
}: PresetManagerProps) {
    return (
        <div className="flex flex-col gap-2 p-3 border-b border-gray-100">
            {/* Preset Dropdown */}
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

            {/* Action Buttons */}
            <div className="flex items-center justify-between">
                <div className="flex gap-1">
                    <button
                        type="button"
                        onClick={onDownload}
                        className="p-1 text-gray-400 hover:text-black transition-colors"
                        title="Download Preset"
                    >
                        <DownloadIcon className="w-3 h-3" />
                    </button>

                    <button
                        type="button"
                        onClick={onRandomizeColors}
                        className="p-1 text-gray-400 hover:text-black transition-colors"
                        title="Randomize Colors"
                    >
                        <PaletteIcon className="w-3 h-3" />
                    </button>
                    <button
                        type="button"
                        onClick={onRandomizeAssignments}
                        className="p-1 text-gray-400 hover:text-black transition-colors"
                        title="Randomize Assignments"
                    >
                        <ShuffleIcon className="w-3 h-3" />
                    </button>
                    <button
                        type="button"
                        onClick={onSetAllWhite}
                        className="p-1 hover:scale-110 transition-transform"
                        title="Set All to White"
                    >
                        <div className="w-3 h-3 bg-white border border-gray-300 rounded-sm" />
                    </button>
                    <button
                        type="button"
                        onClick={onSetAllBlack}
                        className="p-1 hover:scale-110 transition-transform"
                        title="Set All to Black"
                    >
                        <div className="w-3 h-3 bg-black rounded-sm" />
                    </button>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="p-1 text-gray-400 hover:text-black transition-colors"
                    title="Close"
                >
                    <CheckIcon className="w-3 h-3" />
                </button>
            </div>
        </div>
    );
}
