import { AUDIO_SERVICES } from "@shared/registry/audio.ts";
import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import { TEXT_SERVICES } from "@shared/registry/text.ts";
import type { FC } from "react";
import { useState } from "react";
import { cn } from "@/util.ts";
import { Badge } from "../ui/badge.tsx";
import { getModelDisplayName } from "./model-utils.ts";

type AccountPermissionsInputProps = {
    value: string[] | null;
    onChange: (value: string[] | null) => void;
    disabled?: boolean;
    allowedModels: string[] | null;
    onModelsChange: (models: string[] | null) => void;
};

const ACCOUNT_PERMISSIONS = [
    {
        id: "profile",
        label: "Profile",
        tooltip: "Read name, email, image, tier",
    },
    {
        id: "balance",
        label: "Balance",
        tooltip: "Read pollen balance and key budget",
    },
    {
        id: "usage",
        label: "Usage",
        tooltip: "Read usage history",
    },
] as const;

const textModels = Object.keys(TEXT_SERVICES)
    .map((id) => ({
        id,
        label: getModelDisplayName(id),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

const imageModels = Object.entries(IMAGE_SERVICES)
    .filter(([_, config]) =>
        (config.outputModalities as readonly string[]).includes("image"),
    )
    .map(([id]) => ({
        id,
        label: getModelDisplayName(id),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

const videoModels = Object.entries(IMAGE_SERVICES)
    .filter(([_, config]) =>
        (config.outputModalities as readonly string[]).includes("video"),
    )
    .map(([id]) => ({
        id,
        label: getModelDisplayName(id),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

const audioModels = Object.keys(AUDIO_SERVICES)
    .map((id) => ({
        id,
        label: getModelDisplayName(id),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

/**
 * Unified permissions input for API keys.
 * Includes model restrictions and account permissions (profile, balance, usage).
 */
export const AccountPermissionsInput: FC<AccountPermissionsInputProps> = ({
    value,
    onChange,
    disabled = false,
    allowedModels,
    onModelsChange,
}) => {
    const isUnrestricted = allowedModels === null;
    const [isExpanded, setIsExpanded] = useState(!isUnrestricted);

    const totalModels =
        textModels.length +
        imageModels.length +
        videoModels.length +
        audioModels.length;
    const selectedCount = isUnrestricted
        ? totalModels
        : (allowedModels ?? []).length;

    const handleToggle = (permissionId: string) => {
        const currentPermissions = value ?? [];
        const hasPermission = currentPermissions.includes(permissionId);

        if (hasPermission) {
            const newPermissions = currentPermissions.filter(
                (p) => p !== permissionId,
            );
            onChange(newPermissions.length > 0 ? newPermissions : null);
        } else {
            onChange([...currentPermissions, permissionId]);
        }
    };

    const toggleModel = (modelId: string) => {
        if (disabled || isUnrestricted) return;
        const currentModels = allowedModels ?? [];
        if (currentModels.includes(modelId)) {
            onModelsChange(currentModels.filter((id) => id !== modelId));
        } else {
            onModelsChange([...currentModels, modelId]);
        }
    };

    const isModelSelected = (modelId: string) =>
        (allowedModels ?? []).includes(modelId);

    const toggleCategory = (categoryModels: { id: string }[]) => {
        if (disabled || isUnrestricted) return;
        const categoryIds = categoryModels.map((m) => m.id);
        const currentModels = allowedModels ?? [];
        const allSelected = categoryIds.every((id) =>
            currentModels.includes(id),
        );
        if (allSelected) {
            onModelsChange(
                currentModels.filter((id) => !categoryIds.includes(id)),
            );
        } else {
            const newModels = [...currentModels];
            for (const id of categoryIds) {
                if (!newModels.includes(id)) newModels.push(id);
            }
            onModelsChange(newModels);
        }
    };

    const isCategoryAllSelected = (categoryModels: { id: string }[]) =>
        categoryModels.every((m) => (allowedModels ?? []).includes(m.id));

    const handleHeaderClick = () => {
        if (disabled) return;
        setIsExpanded((prev) => !prev);
    };

    const handleRestrictionToggle = (
        e: React.MouseEvent<HTMLButtonElement>,
    ) => {
        e.stopPropagation();
        if (disabled) return;
        if (isUnrestricted) {
            onModelsChange([]);
            setIsExpanded(true);
        } else {
            onModelsChange(null);
        }
    };

    return (
        <div>
            <div className="text-sm font-semibold mb-4">Permissions</div>
            <div className="space-y-2">
                {/* Model Permission */}
                <div
                    className={cn(
                        "rounded-lg border transition-all",
                        isUnrestricted
                            ? "border-green-400 bg-green-50"
                            : "border-gray-200 hover:border-gray-300",
                        disabled && "opacity-50 cursor-not-allowed",
                    )}
                >
                    <button
                        type="button"
                        onClick={handleHeaderClick}
                        disabled={disabled}
                        className="w-full flex items-center gap-3 px-3 py-2 text-left cursor-pointer"
                    >
                        <div className="flex-1">
                            <span className="text-sm font-medium">Model</span>
                            <span className="text-sm text-gray-500">
                                {" "}
                                –{" "}
                                {isUnrestricted
                                    ? "All models allowed"
                                    : "Limited to selected models"}
                            </span>
                        </div>
                        <Badge
                            color={
                                isUnrestricted
                                    ? "green"
                                    : selectedCount === 0
                                      ? "gray"
                                      : "amber"
                            }
                        >
                            {isUnrestricted
                                ? "All"
                                : `${selectedCount} selected`}
                        </Badge>
                        <span
                            className={cn(
                                "text-gray-400 text-sm leading-none transition-transform duration-200",
                                isExpanded && "rotate-180",
                            )}
                        >
                            ▾
                        </span>
                    </button>

                    {/* Expandable model panel */}
                    <div
                        className={cn(
                            "overflow-hidden transition-all duration-200 ease-in-out",
                            isExpanded
                                ? "max-h-[2000px] opacity-100"
                                : "max-h-0 opacity-0",
                        )}
                    >
                        <div
                            className="px-3 pb-3 space-y-3 border-t border-gray-200 pt-3 overflow-y-auto"
                            style={{
                                maxHeight: "50vh",
                                scrollbarWidth: "thin",
                            }}
                        >
                            {/* Restriction toggle */}
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-500">
                                    {isUnrestricted
                                        ? "This key can access all models"
                                        : "Select which models this key can access"}
                                </span>
                                <button
                                    type="button"
                                    onClick={handleRestrictionToggle}
                                    disabled={disabled}
                                    className={cn(
                                        "text-xs px-2 py-1 rounded-md transition-colors cursor-pointer",
                                        isUnrestricted
                                            ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                                            : "bg-green-100 text-green-700 hover:bg-green-200",
                                    )}
                                >
                                    {isUnrestricted
                                        ? "Restrict models"
                                        : "Allow all"}
                                </button>
                            </div>

                            {/* Model chips when restricted */}
                            {!isUnrestricted && (
                                <>
                                    <ModelCategory
                                        label="Text"
                                        models={textModels}
                                        disabled={disabled}
                                        isModelSelected={isModelSelected}
                                        toggleModel={toggleModel}
                                        toggleCategory={toggleCategory}
                                        isCategoryAllSelected={
                                            isCategoryAllSelected
                                        }
                                    />
                                    <ModelCategory
                                        label="Image"
                                        models={imageModels}
                                        disabled={disabled}
                                        isModelSelected={isModelSelected}
                                        toggleModel={toggleModel}
                                        toggleCategory={toggleCategory}
                                        isCategoryAllSelected={
                                            isCategoryAllSelected
                                        }
                                    />
                                    <ModelCategory
                                        label="Video"
                                        models={videoModels}
                                        disabled={disabled}
                                        isModelSelected={isModelSelected}
                                        toggleModel={toggleModel}
                                        toggleCategory={toggleCategory}
                                        isCategoryAllSelected={
                                            isCategoryAllSelected
                                        }
                                    />
                                    <ModelCategory
                                        label="Audio"
                                        models={audioModels}
                                        disabled={disabled}
                                        isModelSelected={isModelSelected}
                                        toggleModel={toggleModel}
                                        toggleCategory={toggleCategory}
                                        isCategoryAllSelected={
                                            isCategoryAllSelected
                                        }
                                    />
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Other Permissions - Profile, Balance, Usage */}
                {ACCOUNT_PERMISSIONS.map((permission) => {
                    const isChecked = value?.includes(permission.id) ?? false;
                    return (
                        <button
                            key={permission.id}
                            type="button"
                            onClick={() => handleToggle(permission.id)}
                            disabled={disabled}
                            className={cn(
                                "w-full flex items-center gap-3 px-3 py-2 rounded-lg border transition-all text-left",
                                isChecked
                                    ? "border-green-400 bg-green-50"
                                    : "border-gray-200 hover:border-gray-300",
                                !disabled && "cursor-pointer",
                                disabled && "opacity-50 cursor-not-allowed",
                            )}
                        >
                            <div className="flex-1">
                                <span className="text-sm font-medium">
                                    {permission.label}
                                </span>
                                <span className="text-sm text-gray-500">
                                    {" "}
                                    – {permission.tooltip}
                                </span>
                            </div>
                            <span className="text-gray-400 text-lg leading-none">
                                {isChecked ? "✕" : "+"}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

/** Renders a category of model chips with a select/deselect-all toggle. */
const ModelCategory: FC<{
    label: string;
    models: { id: string; label: string }[];
    disabled: boolean;
    isModelSelected: (id: string) => boolean;
    toggleModel: (id: string) => void;
    toggleCategory: (models: { id: string }[]) => void;
    isCategoryAllSelected: (models: { id: string }[]) => boolean;
}> = ({
    label,
    models,
    disabled,
    isModelSelected,
    toggleModel,
    toggleCategory,
    isCategoryAllSelected,
}) => (
    <div>
        <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-gray-500 tracking-wide">
                {label}
            </span>
            <button
                type="button"
                onClick={() => toggleCategory(models)}
                disabled={disabled}
                className="text-[10px] text-blue-600 hover:text-blue-800 disabled:opacity-50 cursor-pointer"
            >
                {isCategoryAllSelected(models) ? "Deselect all" : "Select all"}
            </button>
        </div>
        <div className="flex flex-col gap-1">
            {models.map((model) => (
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
);

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
