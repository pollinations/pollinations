import type { FC } from "react";
import { useState } from "react";
import { cn } from "@/util.ts";
import { Badge } from "../ui/badge.tsx";
import { InfoTip } from "../ui/info-tip.tsx";
import {
    audioModelIds,
    imageModelIds,
    textModelIds,
    videoModelIds,
} from "./model-categories.ts";
import { normalizeAllowedModelSelection } from "./model-selection.ts";
import { getModelDisplayName } from "./model-utils.ts";
import {
    getPermissionPillClasses,
    getPermissionUiTheme,
    type PermissionUiTheme,
} from "./permission-ui.ts";

type AccountPermissionOption = {
    id: "profile" | "balance" | "usage" | "keys";
    label: string;
    tooltip: string;
};

type AccountPermissionsInputProps = {
    value: string[] | null;
    onChange: (value: string[] | null) => void;
    disabled?: boolean;
    allowedModels: string[] | null;
    onModelsChange: (models: string[] | null) => void;
    visiblePermissions?: readonly AccountPermissionOption["id"][];
    theme?: PermissionUiTheme;
    showApiName?: boolean;
};

const ACCOUNT_PERMISSIONS = [
    {
        id: "profile",
        label: "Profile",
        tooltip: "Read your GitHub username and profile image.",
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
] as const satisfies readonly AccountPermissionOption[];

const textModels = textModelIds
    .map((id) => ({
        id,
        label: getModelDisplayName(id),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

const imageModels = imageModelIds
    .map((id) => ({
        id,
        label: getModelDisplayName(id),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

const videoModels = videoModelIds
    .map((id) => ({
        id,
        label: getModelDisplayName(id),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

const audioModels = audioModelIds
    .map((id) => ({
        id,
        label: getModelDisplayName(id),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

const MODEL_CATEGORIES = [
    { label: "Text", models: textModels },
    { label: "Image", models: imageModels },
    { label: "Video", models: videoModels },
    { label: "Audio", models: audioModels },
] as const;

const MODEL_CATEGORY_TEXT_CLASSES = {
    Text: "text-blue-800",
    Image: "text-rose-800",
    Video: "text-teal-800",
    Audio: "text-violet-800",
} as const;

const MODEL_CATEGORY_HOVER_CLASSES = {
    Text: "hover:bg-blue-50 hover:text-blue-900 hover:border-blue-300",
    Image: "hover:bg-rose-50 hover:text-rose-900 hover:border-rose-300",
    Video: "hover:bg-teal-50 hover:text-teal-900 hover:border-teal-300",
    Audio: "hover:bg-violet-50 hover:text-violet-900 hover:border-violet-300",
} as const;

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
    visiblePermissions,
    theme = "green",
    showApiName = true,
}) => {
    const themeConfig = getPermissionUiTheme(theme);
    const { row: rowTheme, accent: accentTheme } = themeConfig;
    const permissionOptions = visiblePermissions?.length
        ? ACCOUNT_PERMISSIONS.filter((permission) =>
              visiblePermissions.includes(permission.id),
          )
        : ACCOUNT_PERMISSIONS;
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
    const hasSelectedModels = selectedCount > 0;

    const handleToggle = (permissionId: string) => {
        if (disabled) return;
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
        onModelsChange(normalizeAllowedModelSelection(next, allModelIds));
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
            <div className="space-y-2">
                {/* Model Permission */}
                <div
                    className={cn(
                        "relative rounded-lg border transition-all",
                        "border-gray-200",
                        disabled && "opacity-50 cursor-not-allowed",
                    )}
                >
                    {/* biome-ignore lint/a11y/useSemanticElements: full-row toggle with separate InfoTip keeps the whole row clickable without nesting interactive elements */}
                    <div
                        role="button"
                        tabIndex={disabled ? -1 : 0}
                        aria-expanded={isExpanded}
                        aria-label="Toggle model permissions"
                        onClick={handleHeaderClick}
                        onKeyDown={(event) => {
                            if (disabled) return;
                            if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                handleHeaderClick();
                            }
                        }}
                        className={cn(
                            "relative flex items-center gap-3 px-3 py-2 text-left transition-all",
                            rowTheme.focusRingClasses,
                            hasSelectedModels && rowTheme.selectedClasses,
                            !disabled &&
                                (hasSelectedModels
                                    ? rowTheme.selectedHoverClasses
                                    : rowTheme.rowHoverClasses),
                            !disabled && "cursor-pointer",
                        )}
                    >
                        <div className="flex flex-1 items-center gap-1.5 min-w-0">
                            <span className="text-sm font-medium">Model</span>
                            <InfoTip
                                text="Choose which models this key can use. By default, all models are allowed."
                                label="Model access information"
                                tone={accentTheme.tipTone}
                            />
                        </div>
                        <div className="flex items-center gap-3 text-left">
                            <Badge
                                color={
                                    selectedCount === 0
                                        ? "gray"
                                        : accentTheme.badgeColor
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
                        </div>
                    </div>

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
                            <div className="flex justify-end">
                                <button
                                    type="button"
                                    onClick={() =>
                                        onModelsChange(
                                            isUnrestricted ? [] : null,
                                        )
                                    }
                                    disabled={disabled}
                                    className={cn(
                                        "text-xs font-medium cursor-pointer disabled:opacity-50",
                                        accentTheme.actionTextClasses,
                                    )}
                                >
                                    {isUnrestricted
                                        ? "Deselect all"
                                        : "Select all"}
                                </button>
                            </div>
                            {MODEL_CATEGORIES.map(({ label, models }) => (
                                <ModelCategory
                                    key={label}
                                    label={label}
                                    models={models}
                                    disabled={disabled}
                                    isModelSelected={isModelSelected}
                                    toggleModel={toggleModel}
                                    toggleCategory={toggleCategory}
                                    isCategoryAllSelected={
                                        isCategoryAllSelected
                                    }
                                    showApiName={showApiName}
                                    theme={theme}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                {/* Other Permissions - Profile, Balance, Usage */}
                {permissionOptions.map((permission) => {
                    const isChecked = value?.includes(permission.id) ?? false;
                    return (
                        <div key={permission.id}>
                            {/* biome-ignore lint/a11y/useSemanticElements: full-row toggle with separate InfoTip keeps the whole row clickable without nesting interactive elements */}
                            <div
                                role="button"
                                tabIndex={disabled ? -1 : 0}
                                aria-pressed={isChecked}
                                aria-label={`Toggle ${permission.label} permission`}
                                onClick={() => handleToggle(permission.id)}
                                onKeyDown={(event) => {
                                    if (disabled) return;
                                    if (
                                        event.key === "Enter" ||
                                        event.key === " "
                                    ) {
                                        event.preventDefault();
                                        handleToggle(permission.id);
                                    }
                                }}
                                className={cn(
                                    "w-full flex items-center gap-3 px-3 py-2 rounded-lg border transition-all text-left",
                                    isChecked
                                        ? rowTheme.selectedClasses
                                        : "border-gray-200",
                                    rowTheme.focusRingClasses,
                                    !disabled &&
                                        (isChecked
                                            ? rowTheme.selectedHoverClasses
                                            : rowTheme.rowHoverClasses),
                                    !disabled && "cursor-pointer",
                                    disabled && "opacity-50 cursor-not-allowed",
                                )}
                            >
                                <div className="flex flex-1 items-center gap-1.5">
                                    <span className="text-sm font-medium">
                                        {permission.label}
                                    </span>
                                    <InfoTip
                                        text={permission.tooltip}
                                        label={`${permission.label} information`}
                                        tone={accentTheme.tipTone}
                                        placement="top"
                                    />
                                </div>
                            </div>
                        </div>
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
    theme?: PermissionUiTheme;
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
            <span
                className={cn(
                    "text-sm font-semibold",
                    MODEL_CATEGORY_TEXT_CLASSES[
                        label as keyof typeof MODEL_CATEGORY_TEXT_CLASSES
                    ],
                )}
            >
                {label}
            </span>
            <button
                type="button"
                onClick={() => toggleCategory(models)}
                disabled={disabled}
                className={cn(
                    "text-[10px] disabled:opacity-50 cursor-pointer",
                    getPermissionUiTheme(theme).accent.actionTextClasses,
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
                    category={label}
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
    theme?: PermissionUiTheme;
    category?: string;
}> = ({
    apiName,
    officialName,
    selected,
    onClick,
    disabled,
    showApiName = true,
    theme = "green",
    category,
}) => {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={cn(
                "px-2.5 py-1 rounded-lg text-xs transition-colors text-left border",
                selected
                    ? getPermissionPillClasses(category ?? "") ||
                          "bg-gray-100 text-gray-800 border-gray-400"
                    : "bg-transparent text-gray-600 border-gray-300",
                !disabled &&
                    !selected &&
                    MODEL_CATEGORY_HOVER_CLASSES[
                        (category ??
                            "Text") as keyof typeof MODEL_CATEGORY_HOVER_CLASSES
                    ],
                !disabled && "cursor-pointer",
                disabled && "opacity-50 cursor-not-allowed",
            )}
        >
            {officialName}
            {showApiName && (
                <span className="font-mono opacity-70"> - {apiName}</span>
            )}
        </button>
    );
};
