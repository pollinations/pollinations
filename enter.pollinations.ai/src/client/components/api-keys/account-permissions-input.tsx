import { AUDIO_SERVICES } from "@shared/registry/audio.ts";
import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import { TEXT_SERVICES } from "@shared/registry/text.ts";
import type { FC } from "react";
import { useState } from "react";
import { cn } from "@/util.ts";
import { Badge } from "../ui/badge.tsx";
import { InfoTip } from "../ui/info-tip.tsx";
import { getModelDisplayName } from "./model-utils.ts";

type AccountPermissionsInputProps = {
    value: string[] | null;
    onChange: (value: string[] | null) => void;
    disabled?: boolean;
    allowedModels: string[] | null;
    onModelsChange: (models: string[] | null) => void;
    hiddenPermissions?: readonly string[];
    theme?: "green" | "amber";
    showApiName?: boolean;
};

const THEME_SELECTED = {
    green: "border-green-400 bg-green-50",
    amber: "border-amber-400 bg-amber-100",
} as const;

const ACCOUNT_PERMISSIONS = [
    {
        id: "profile",
        label: "Profile",
        tooltip: "Read your name, email, profile image, and account tier.",
    },
    {
        id: "balance",
        label: "Balance",
        tooltip:
            "Read your total pollen balance and the spending limit set on this key.",
    },
    {
        id: "usage",
        label: "Usage",
        tooltip:
            "Read your entire account's usage history across all API keys — not just activity from this key.",
    },
    {
        id: "keys",
        label: "Key Management",
        tooltip:
            "Create, list, and revoke API keys on your account via the API.",
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
    hiddenPermissions,
    theme = "green",
    showApiName = true,
}) => {
    const visiblePermissions = hiddenPermissions?.length
        ? ACCOUNT_PERMISSIONS.filter((p) => !hiddenPermissions.includes(p.id))
        : ACCOUNT_PERMISSIONS;
    const selectedClasses = THEME_SELECTED[theme];
    const tipTone = theme === "amber" ? "amber" : "pink";
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

    const allModelIds = [
        ...textModels,
        ...imageModels,
        ...videoModels,
        ...audioModels,
    ].map((m) => m.id);

    const commitSelection = (next: string[]) => {
        if (next.length === allModelIds.length) {
            onModelsChange(null);
        } else {
            onModelsChange(next);
        }
    };

    const toggleModel = (modelId: string) => {
        if (disabled) return;
        if (isUnrestricted) {
            commitSelection(allModelIds.filter((id) => id !== modelId));
            return;
        }
        const currentModels = allowedModels ?? [];
        const next = currentModels.includes(modelId)
            ? currentModels.filter((id) => id !== modelId)
            : [...currentModels, modelId];
        commitSelection(next);
    };

    const isModelSelected = (modelId: string) =>
        isUnrestricted || (allowedModels ?? []).includes(modelId);

    const toggleCategory = (categoryModels: { id: string }[]) => {
        if (disabled) return;
        const categoryIds = categoryModels.map((m) => m.id);
        if (isUnrestricted) {
            commitSelection(
                allModelIds.filter((id) => !categoryIds.includes(id)),
            );
            return;
        }
        const currentModels = allowedModels ?? [];
        const allSelected = categoryIds.every((id) =>
            currentModels.includes(id),
        );
        if (allSelected) {
            commitSelection(
                currentModels.filter((id) => !categoryIds.includes(id)),
            );
        } else {
            const next = [...currentModels];
            for (const id of categoryIds) {
                if (!next.includes(id)) next.push(id);
            }
            commitSelection(next);
        }
    };

    const isCategoryAllSelected = (categoryModels: { id: string }[]) =>
        isUnrestricted ||
        categoryModels.every((m) => (allowedModels ?? []).includes(m.id));

    const handleHeaderClick = () => {
        if (disabled) return;
        setIsExpanded((prev) => !prev);
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
                            ? selectedClasses
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
                        <div className="flex-1 flex items-center gap-2">
                            <span className="text-sm font-medium">Model</span>
                            <InfoTip
                                text="Choose which models this key can use. By default, all models are allowed."
                                label="Model access information"
                                tone={tipTone}
                            />
                            {isExpanded && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onModelsChange(
                                            isUnrestricted ? [] : null,
                                        );
                                    }}
                                    disabled={disabled}
                                    className={cn(
                                        "text-xs font-medium cursor-pointer disabled:opacity-50 ml-1",
                                        theme === "amber"
                                            ? "text-amber-800 hover:text-amber-950"
                                            : "text-green-800 hover:text-green-950",
                                    )}
                                >
                                    {isUnrestricted
                                        ? "Deselect all"
                                        : "Select all"}
                                </button>
                            )}
                        </div>
                        <Badge
                            color={
                                selectedCount === 0
                                    ? "gray"
                                    : theme === "amber"
                                      ? "amber"
                                      : "green"
                            }
                        >
                            {isUnrestricted
                                ? "All selected"
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
                            "transition-all duration-200 ease-in-out",
                            isExpanded
                                ? "opacity-100"
                                : "max-h-0 opacity-0 overflow-hidden",
                        )}
                    >
                        <div className="px-3 pb-4 space-y-3 border-t border-gray-200 pt-3">
                            <ModelCategory
                                label="Text"
                                models={textModels}
                                disabled={disabled}
                                isModelSelected={isModelSelected}
                                toggleModel={toggleModel}
                                toggleCategory={toggleCategory}
                                isCategoryAllSelected={isCategoryAllSelected}
                                showApiName={showApiName}
                                theme={theme}
                            />
                            <ModelCategory
                                label="Image"
                                models={imageModels}
                                disabled={disabled}
                                isModelSelected={isModelSelected}
                                toggleModel={toggleModel}
                                toggleCategory={toggleCategory}
                                isCategoryAllSelected={isCategoryAllSelected}
                                showApiName={showApiName}
                                theme={theme}
                            />
                            <ModelCategory
                                label="Video"
                                models={videoModels}
                                disabled={disabled}
                                isModelSelected={isModelSelected}
                                toggleModel={toggleModel}
                                toggleCategory={toggleCategory}
                                isCategoryAllSelected={isCategoryAllSelected}
                                showApiName={showApiName}
                                theme={theme}
                            />
                            <ModelCategory
                                label="Audio"
                                models={audioModels}
                                disabled={disabled}
                                isModelSelected={isModelSelected}
                                toggleModel={toggleModel}
                                toggleCategory={toggleCategory}
                                isCategoryAllSelected={isCategoryAllSelected}
                                showApiName={showApiName}
                                theme={theme}
                            />
                        </div>
                    </div>
                </div>

                {/* Other Permissions - Profile, Balance, Usage */}
                {visiblePermissions.map((permission) => {
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
                                    ? selectedClasses
                                    : "border-gray-200 hover:border-gray-300",
                                !disabled && "cursor-pointer",
                                disabled && "opacity-50 cursor-not-allowed",
                            )}
                        >
                            <div className="flex-1 flex items-center gap-1.5">
                                <span className="text-sm font-medium">
                                    {permission.label}
                                </span>
                                <InfoTip
                                    text={permission.tooltip}
                                    label={`${permission.label} information`}
                                    tone={tipTone}
                                    placement="top"
                                />
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
    showApiName?: boolean;
    theme?: "green" | "amber";
}> = ({
    label,
    models,
    disabled,
    isModelSelected,
    toggleModel,
    toggleCategory,
    isCategoryAllSelected,
    showApiName = true,
    theme = "green",
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
                className={cn(
                    "text-[10px] disabled:opacity-50 cursor-pointer",
                    theme === "amber"
                        ? "text-amber-700 hover:text-amber-900"
                        : "text-green-700 hover:text-green-900",
                )}
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
                    showApiName={showApiName}
                    theme={theme}
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
    showApiName?: boolean;
    theme?: "green" | "amber";
}> = ({
    apiName,
    officialName,
    selected,
    onClick,
    disabled,
    showApiName = true,
    theme = "green",
}) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
            "px-2.5 py-1 rounded-lg text-xs transition-colors text-left border",
            selected
                ? theme === "amber"
                    ? "bg-amber-100 text-amber-900 border-amber-400"
                    : "bg-green-50 text-gray-900 border-green-400"
                : "bg-transparent text-gray-600 border-gray-300",
            !disabled &&
                !selected &&
                (theme === "amber"
                    ? "hover:bg-amber-50 hover:text-gray-800 hover:border-amber-300"
                    : "hover:bg-green-50 hover:text-gray-800 hover:border-green-300"),
            !disabled && "cursor-pointer",
            disabled && "opacity-50 cursor-not-allowed",
        )}
    >
        {selected && "✓ "}
        {officialName}
        {showApiName && (
            <span className="font-mono opacity-70"> - {apiName}</span>
        )}
    </button>
);
