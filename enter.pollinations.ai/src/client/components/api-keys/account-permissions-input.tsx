import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import { TEXT_SERVICES } from "@shared/registry/text.ts";
import type { FC } from "react";
import { cn } from "@/util.ts";
import { Badge } from "../ui/badge.tsx";
import { getModelDisplayName } from "./model-utils.ts";

type AccountPermissionsInputProps = {
    value: string[] | null;
    onChange: (value: string[] | null) => void;
    disabled?: boolean;
    // Model permissions
    allowedModels: string[] | null;
    onModelsChange: (models: string[] | null) => void;
};

const ACCOUNT_PERMISSIONS = [
    {
        id: "profile",
        label: "Profile",
        tooltip: "Read name, email, GitHub username",
    },
    {
        id: "balance",
        label: "Balance",
        tooltip: "Read keys, budget, etc.",
    },
    {
        id: "usage",
        label: "Usage",
        tooltip: "Read usage history via API",
    },
] as const;

// Build model lists from the shared registry
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

    // Model permissions logic
    const isUnrestricted = allowedModels === null;
    const totalModels =
        textModels.length + imageModels.length + videoModels.length;
    const selectedCount = isUnrestricted
        ? totalModels
        : (allowedModels ?? []).length;

    const toggleRestrictionMode = () => {
        if (disabled) return;
        onModelsChange(isUnrestricted ? [] : null);
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

    return (
        <div>
            <div className="text-sm font-semibold mb-4">Permissions</div>
            <div className="space-y-2">
                {/* Model Permission - Full width box */}
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
                        onClick={toggleRestrictionMode}
                        disabled={disabled}
                        className="w-full flex items-center gap-3 px-3 py-2 text-left"
                    >
                        <div className="flex-1">
                            <span className="text-sm font-medium">Model</span>
                            <span className="text-sm text-gray-500">
                                {" "}
                                –{" "}
                                {isUnrestricted
                                    ? "Allow selected models"
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
                        <span className="text-gray-400 text-lg leading-none">
                            ✕
                        </span>
                    </button>

                    {/* Model chips when restricting */}
                    {!isUnrestricted && (
                        <div className="px-3 pb-3 space-y-3 border-t border-gray-200 pt-3">
                            {/* Text models */}
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-semibold text-gray-500 tracking-wide">
                                        Text
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            toggleCategory(textModels)
                                        }
                                        disabled={disabled}
                                        className="text-[10px] text-blue-600 hover:text-blue-800 disabled:opacity-50 cursor-pointer"
                                    >
                                        {isCategoryAllSelected(textModels)
                                            ? "Deselect all"
                                            : "Select all"}
                                    </button>
                                </div>
                                <div className="flex flex-col gap-1">
                                    {textModels.map((model) => (
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

                            {/* Image models */}
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-semibold text-gray-500 tracking-wide">
                                        Image
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            toggleCategory(imageModels)
                                        }
                                        disabled={disabled}
                                        className="text-[10px] text-blue-600 hover:text-blue-800 disabled:opacity-50 cursor-pointer"
                                    >
                                        {isCategoryAllSelected(imageModels)
                                            ? "Deselect all"
                                            : "Select all"}
                                    </button>
                                </div>
                                <div className="flex flex-col gap-1">
                                    {imageModels.map((model) => (
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

                            {/* Video models */}
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-semibold text-gray-500 tracking-wide">
                                        Video
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            toggleCategory(videoModels)
                                        }
                                        disabled={disabled}
                                        className="text-[10px] text-blue-600 hover:text-blue-800 disabled:opacity-50 cursor-pointer"
                                    >
                                        {isCategoryAllSelected(videoModels)
                                            ? "Deselect all"
                                            : "Select all"}
                                    </button>
                                </div>
                                <div className="flex flex-col gap-1">
                                    {videoModels.map((model) => (
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
                        </div>
                    )}
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
