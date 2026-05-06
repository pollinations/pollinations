import type { FC } from "react";
import { cn } from "@/util.ts";
import { InfoTip } from "../ui/info-tip.tsx";
import { Tag } from "../ui/tag.tsx";
import { MODEL_CATEGORIES } from "./model-categories.ts";

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

    const totalModels = MODEL_CATEGORIES.reduce(
        (sum, { models }) => sum + models.length,
        0,
    );
    const selectedCount = isUnrestricted ? totalModels : (value ?? []).length;

    return (
        <div>
            {!compact && (
                <span className="flex items-center gap-1.5 text-sm font-semibold mb-2">
                    Models
                    <InfoTip
                        text="Limit this key to specific models. Model permission does not waive paid-only or balance requirements."
                        label="Show model access information"
                    />
                </span>
            )}
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
                    <span className="text-sm font-medium">
                        Allow all models
                    </span>
                    <Tag
                        color={
                            isUnrestricted
                                ? "green"
                                : selectedCount === 0
                                  ? "gray"
                                  : "amber"
                        }
                        className="ml-auto"
                    >
                        {`${selectedCount} selected`}
                    </Tag>
                </label>

                {/* Show model chips when restricting to specific models */}
                {!isUnrestricted && (
                    <div className="space-y-4">
                        {MODEL_CATEGORIES.map(({ label, models }) => (
                            <div key={label}>
                                <div className="text-xs font-semibold text-gray-500 tracking-wide mb-1">
                                    {label}
                                </div>
                                <div className="flex flex-col gap-1">
                                    {models.map((model) => (
                                        <ModelChip
                                            key={model.id}
                                            apiName={model.id}
                                            officialName={model.label}
                                            selected={isModelSelected(model.id)}
                                            onClick={() =>
                                                toggleModel(model.id)
                                            }
                                            disabled={disabled}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
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
