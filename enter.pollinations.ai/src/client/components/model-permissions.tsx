import { useState, type FC } from "react";
import { cn } from "@/util.ts";
import { TEXT_SERVICES } from "../../../../shared/registry/text.ts";
import { IMAGE_SERVICES } from "../../../../shared/registry/image.ts";

// Build model lists from the shared registry (same source as pricing table)
const textModels = Object.entries(TEXT_SERVICES).map(([id, config]) => ({
    id,
    label: config.description?.split(" - ")[0] || id,
}));

const imageModels = Object.entries(IMAGE_SERVICES)
    .filter(([_, config]) => config.outputModalities?.[0] !== "video") // Exclude video models
    .map(([id, config]) => ({
        id,
        label: config.description?.split(" - ")[0] || id,
    }));

type ModelPermissionsProps = {
    /** Selected model IDs. Empty array = all models allowed */
    value: string[];
    /** Called when selection changes */
    onChange: (models: string[]) => void;
    /** Whether the component is disabled */
    disabled?: boolean;
    /** Compact mode for embedding in other forms */
    compact?: boolean;
};

/**
 * Model permissions selector - allows restricting API key to specific models.
 * Empty array = all models allowed (default)
 * Non-empty array = only those models allowed
 */
export const ModelPermissions: FC<ModelPermissionsProps> = ({
    value,
    onChange,
    disabled = false,
    compact = false,
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const allModels = [...textModels, ...imageModels];
    const isAllSelected = value.length === 0;

    const toggleAllModels = () => {
        if (disabled) return;
        if (isAllSelected) {
            // Switching from "all" to "specific" - start with all models selected
            onChange(allModels.map((m) => m.id));
        } else {
            // Switching back to "all"
            onChange([]);
        }
    };

    const toggleModel = (modelId: string) => {
        if (disabled || isAllSelected) return;

        if (value.includes(modelId)) {
            // Don't allow deselecting the last model
            if (value.length === 1) return;
            onChange(value.filter((id) => id !== modelId));
        } else {
            onChange([...value, modelId]);
        }
    };

    const isModelSelected = (modelId: string) => value.includes(modelId);

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
                        isAllSelected
                            ? "bg-green-100 text-green-700"
                            : "bg-amber-100 text-amber-700",
                    )}
                >
                    {isAllSelected ? "All models" : `${value.length} selected`}
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
                            checked={isAllSelected}
                            onChange={toggleAllModels}
                            disabled={disabled}
                            className="w-4 h-4 rounded text-green-600"
                        />
                        <span className="text-sm font-medium">
                            Allow all models
                        </span>
                    </label>

                    {/* Show model chips when restricting to specific models */}
                    {!isAllSelected && (
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

                            {/* Image models */}
                            <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                    Image Models
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
                        {isAllSelected
                            ? "This key can access any model."
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
