import { useState, type FC } from "react";
import { cn } from "@/util.ts";
import { TEXT_SERVICES } from "@shared/registry/text.ts";
import { IMAGE_SERVICES } from "@shared/registry/image.ts";

// Build model lists from the shared registry (same source as pricing table)
const textModels = Object.entries(TEXT_SERVICES).map(([id, config]) => ({
    id,
    label: config.description?.split(" - ")[0] || id,
}));

// Image/video models - all from IMAGE_SERVICES (video uses same endpoint)
const imageModels = Object.entries(IMAGE_SERVICES).map(([id, config]) => ({
    id,
    label: config.description?.split(" - ")[0] || id,
}));

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
    const [isExpanded, setIsExpanded] = useState(false);
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

    const selectedCount = (value ?? []).length;

    return (
        <div className={cn("space-y-2", compact && "text-sm")}>
            {/* Collapsed state - just a toggle */}
            <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                disabled={disabled}
                className={cn(
                    "flex items-center gap-2 text-left w-full py-2 px-3 rounded-lg transition-all",
                    "border border-gray-200 hover:border-gray-300",
                    disabled && "opacity-50 cursor-not-allowed",
                    !disabled && "cursor-pointer hover:bg-gray-50",
                )}
            >
                <span
                    className={cn(
                        "transition-transform",
                        isExpanded && "rotate-90",
                    )}
                >
                    ▶
                </span>
                <span className="flex-1 font-medium text-gray-700">
                    Model Access
                </span>
                <span
                    className={cn(
                        "text-xs px-2 py-0.5 rounded-full",
                        isUnrestricted
                            ? "bg-green-100 text-green-700"
                            : selectedCount === 0
                              ? "bg-red-100 text-red-700"
                              : "bg-amber-100 text-amber-700",
                    )}
                >
                    {isUnrestricted
                        ? "All models"
                        : `${selectedCount} selected`}
                </span>
            </button>

            {/* Expanded state - model selection */}
            {isExpanded && (
                <div className="pl-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
                    {/* Toggle between all/specific models */}
                    <label
                        className={cn(
                            "flex items-center gap-2 cursor-pointer",
                            disabled && "cursor-not-allowed opacity-50",
                        )}
                    >
                        <input
                            type="checkbox"
                            checked={isUnrestricted}
                            onChange={toggleRestrictionMode}
                            disabled={disabled}
                            className="w-4 h-4 rounded text-green-600"
                        />
                        <span className="text-sm font-medium">
                            Allow all models
                        </span>
                    </label>

                    {/* Show model chips when restricting to specific models */}
                    {!isUnrestricted && (
                        <>
                            {/* Text models */}
                            <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                    Text Models
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {textModels.map((model) => (
                                        <ModelChip
                                            key={model.id}
                                            label={model.label}
                                            selected={isModelSelected(model.id)}
                                            onClick={() =>
                                                toggleModel(model.id)
                                            }
                                            disabled={disabled}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Image & Video models */}
                            <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                    Image & Video Models
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {imageModels.map((model) => (
                                        <ModelChip
                                            key={model.id}
                                            label={model.label}
                                            selected={isModelSelected(model.id)}
                                            onClick={() =>
                                                toggleModel(model.id)
                                            }
                                            disabled={disabled}
                                        />
                                    ))}
                                </div>
                            </div>
                        </>
                    )}

                    <p className="text-xs text-gray-500 italic">
                        {isUnrestricted
                            ? "This key can access any model."
                            : selectedCount === 0
                              ? "Select at least one model."
                              : "This key can only access selected models."}
                    </p>
                </div>
            )}
        </div>
    );
};

const ModelChip: FC<{
    label: string;
    selected: boolean;
    onClick: () => void;
    disabled?: boolean;
}> = ({ label, selected, onClick, disabled }) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
            "px-2.5 py-1 rounded-full text-xs font-medium transition-all",
            selected
                ? "bg-blue-100 text-blue-700 border border-blue-300"
                : "bg-gray-100 text-gray-500 border border-gray-200",
            !disabled && "hover:scale-105 cursor-pointer",
            disabled && "opacity-50 cursor-not-allowed",
        )}
    >
        {selected && "✓ "}
        {label}
    </button>
);

export default ModelPermissions;
