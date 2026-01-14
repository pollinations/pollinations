import { type FC, useState } from "react";
import { cn } from "@/util.ts";
import { TEXT_SERVICES } from "@shared/registry/text.ts";
import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import { getModelDisplayName } from "./model-utils.ts";

// Build model lists from the shared registry (same source as pricing table)
const textModels = Object.keys(TEXT_SERVICES)
    .map((id) => ({
        id,
        label: getModelDisplayName(id),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

// Image models - filter by outputModalities
const imageModels = Object.entries(IMAGE_SERVICES)
    .filter(([_, config]) =>
        (config.outputModalities as readonly string[]).includes("image"),
    )
    .map(([id]) => ({
        id,
        label: getModelDisplayName(id),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

// Video models - filter by outputModalities
const videoModels = Object.entries(IMAGE_SERVICES)
    .filter(([_, config]) =>
        (config.outputModalities as readonly string[]).includes("video"),
    )
    .map(([id]) => ({
        id,
        label: getModelDisplayName(id),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

type ModelPermissionsProps = {
    /** Selected model IDs. null = all models allowed, [] = restricted but none selected */
    value: string[] | null;
    /** Called when selection changes */
    onChange: (models: string[] | null) => void;
    /** Whether the component is disabled */
    disabled?: boolean;
    /** Compact mode for embedding in other forms */
    compact?: boolean;
};

/**
 * Model permissions selector - allows restricting API key to specific models.
 * null = all models allowed (default, unrestricted)
 * [] = restricted mode with no models selected yet
 * ["model1", "model2"] = restricted to specific models
 */
export const ModelPermissions: FC<ModelPermissionsProps> = ({
    value,
    onChange,
    disabled = false,
    compact = false,
}) => {
    const [showTooltip, setShowTooltip] = useState(false);
    // null means unrestricted (all models allowed)
    const isUnrestricted = value === null;

    const toggleRestrictionMode = () => {
        if (disabled) return;
        // Toggle between unrestricted (null) and restricted (empty array)
        onChange(isUnrestricted ? [] : null);
    };

    const toggleModel = (modelId: string) => {
        if (disabled || isUnrestricted) return;

        const currentModels = value ?? [];

        if (currentModels.includes(modelId)) {
            // Deselecting
            onChange(currentModels.filter((id) => id !== modelId));
        } else {
            // Selecting
            onChange([...currentModels, modelId]);
        }
    };

    const isModelSelected = (modelId: string) =>
        (value ?? []).includes(modelId);

    const totalModels =
        textModels.length + imageModels.length + videoModels.length;
    const selectedCount = isUnrestricted ? totalModels : (value ?? []).length;

    return (
        <div
            className={cn(
                "rounded-lg border border-gray-200 transition-all p-3 space-y-3",
                !disabled && "hover:border-gray-300",
                disabled && "opacity-50",
                compact && "text-sm",
            )}
        >
            {/* Toggle between all/specific models */}
            <label
                className={cn(
                    "flex items-center gap-2 cursor-pointer",
                    disabled && "cursor-not-allowed opacity-50",
                )}
            >
                <input
                    id="allow-all-models"
                    name="allow-all-models"
                    type="checkbox"
                    checked={isUnrestricted}
                    onChange={toggleRestrictionMode}
                    disabled={disabled}
                    className="w-4 h-4 rounded text-green-600"
                />
                <span className="text-sm font-medium">Allow all models</span>
                <button
                    type="button"
                    className="relative inline-flex items-center"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowTooltip((prev) => !prev);
                    }}
                    onMouseEnter={() => setShowTooltip(true)}
                    onMouseLeave={() => setShowTooltip(false)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setShowTooltip((prev) => !prev);
                        }
                    }}
                    aria-label="Show model access information"
                >
                    <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-pink-100 border border-pink-300 text-pink-500 hover:bg-pink-200 hover:border-pink-400 transition-colors text-[10px] font-bold cursor-pointer">
                        i
                    </span>
                    <span
                        className={`${showTooltip ? "visible" : "invisible"} absolute left-0 top-full mt-1 px-3 py-2 bg-gradient-to-r from-pink-50 to-purple-50 text-gray-800 text-xs rounded-lg shadow-lg border border-pink-200 whitespace-normal z-50 pointer-events-none`}
                    >
                        Restrict which models this API key can access. Useful
                        for limiting keys to specific use cases.
                    </span>
                </button>
                <span
                    className={cn(
                        "text-xs px-2 py-0.5 rounded-full ml-auto border",
                        isUnrestricted
                            ? "bg-green-100 text-green-700 border-green-300"
                            : selectedCount === 0
                              ? "bg-red-100 text-red-700 border-red-300"
                              : "bg-amber-100 text-amber-700 border-amber-300",
                    )}
                >
                    {`${selectedCount} selected`}
                </span>
            </label>

            {/* Show model chips when restricting to specific models */}
            {!isUnrestricted && (
                <div className="space-y-4">
                    {/* Text models */}
                    <div>
                        <div className="text-xs font-semibold text-gray-500 tracking-wide mb-1">
                            Text
                        </div>
                        <div className="flex flex-col gap-1">
                            {textModels.map((model) => (
                                <ModelChip
                                    key={model.id}
                                    apiName={model.id}
                                    officialName={model.label}
                                    selected={isModelSelected(model.id)}
                                    onClick={() => toggleModel(model.id)}
                                    disabled={disabled}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Image models */}
                    <div>
                        <div className="text-xs font-semibold text-gray-500 tracking-wide mb-1">
                            Image
                        </div>
                        <div className="flex flex-col gap-1">
                            {imageModels.map((model) => (
                                <ModelChip
                                    key={model.id}
                                    apiName={model.id}
                                    officialName={model.label}
                                    selected={isModelSelected(model.id)}
                                    onClick={() => toggleModel(model.id)}
                                    disabled={disabled}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Video models */}
                    <div>
                        <div className="text-xs font-semibold text-gray-500 tracking-wide mb-1">
                            Video
                        </div>
                        <div className="flex flex-col gap-1">
                            {videoModels.map((model) => (
                                <ModelChip
                                    key={model.id}
                                    apiName={model.id}
                                    officialName={model.label}
                                    selected={isModelSelected(model.id)}
                                    onClick={() => toggleModel(model.id)}
                                    disabled={disabled}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const ModelChip: FC<{
    apiName: string;
    officialName: string;
    selected: boolean;
    onClick: () => void;
    disabled?: boolean;
}> = ({ apiName, officialName, selected, onClick, disabled }) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
            "px-2.5 py-1 rounded-lg text-xs transition-all text-left",
            selected
                ? "bg-blue-100 text-blue-700 border border-blue-300"
                : "bg-gray-100 text-gray-500 border border-gray-200",
            !disabled && "hover:scale-105 cursor-pointer",
            disabled && "opacity-50 cursor-not-allowed",
        )}
    >
        {selected && "✓ "}
        {officialName} <span className="font-mono opacity-70">- {apiName}</span>
    </button>
);

export default ModelPermissions;
