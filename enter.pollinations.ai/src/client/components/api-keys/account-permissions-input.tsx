import type { FC } from "react";
import { useState } from "react";
import { cn } from "@/util.ts";
import { ModalityButton } from "./modality-button.tsx";
import { getModalityColors } from "./modality-ui.ts";
import {
    MODEL_CATEGORIES,
    type ModelCategoryModel,
} from "./model-categories.ts";
import { normalizeAllowedModelSelection } from "./model-selection.ts";
import {
    getPermissionUiTheme,
    type PermissionUiTheme,
} from "./permission-ui.ts";

type AccountPermissionOption = {
    id: "profile" | "usage" | "keys";
    label: string;
    shortLabel?: string;
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
    /** Whether the Models section starts expanded. Always collapsible. */
    modelsInitiallyExpanded?: boolean;
};

export const ACCOUNT_PERMISSIONS: readonly AccountPermissionOption[] = [
    {
        id: "profile",
        label: "Profile",
        tooltip: "account name and email",
    },
    {
        id: "usage",
        label: "Usage",
        tooltip: "account balance and usage",
    },
    {
        id: "keys",
        label: "Key Management",
        shortLabel: "Keys",
        tooltip: "create, list, and revoke API keys",
    },
];

/**
 * Unified permissions input for API keys.
 * Includes model restrictions and account permissions (profile, usage).
 */
export const AccountPermissionsInput: FC<AccountPermissionsInputProps> = ({
    value,
    onChange,
    disabled = false,
    allowedModels,
    onModelsChange,
    visiblePermissions,
    theme = "blue",
    showApiName = true,
    modelsInitiallyExpanded = false,
}) => {
    const themeConfig = getPermissionUiTheme(theme);
    const { row: rowTheme } = themeConfig;
    const permissionOptions =
        visiblePermissions === undefined
            ? ACCOUNT_PERMISSIONS
            : ACCOUNT_PERMISSIONS.filter((p) =>
                  visiblePermissions.includes(p.id),
              );
    const isUnrestricted = allowedModels === null;

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

    const allModelIds = MODEL_CATEGORIES.flatMap(({ models }) =>
        models.map((model) => model.id),
    );

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

    const toggleCategory = (categoryModels: ModelCategoryModel[]) => {
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

    const isCategoryAllSelected = (categoryModels: ModelCategoryModel[]) =>
        isUnrestricted ||
        categoryModels.every((m) => (allowedModels ?? []).includes(m.id));

    const selectedCount = isUnrestricted
        ? allModelIds.length
        : (allowedModels ?? []).length;

    // Start open if caller requested, or if the key is already restricted.
    const [modelsExpanded, setModelsExpanded] = useState(
        modelsInitiallyExpanded || !isUnrestricted,
    );

    return (
        <div>
            <div className="space-y-4">
                {/* Other Permissions - Profile, Usage */}
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
                                <div className="flex flex-1 items-baseline gap-1">
                                    <span className="text-sm font-medium">
                                        {permission.shortLabel ? (
                                            <>
                                                <span className="sm:hidden">
                                                    {permission.shortLabel}
                                                </span>
                                                <span className="hidden sm:inline">
                                                    {permission.label}
                                                </span>
                                            </>
                                        ) : (
                                            permission.label
                                        )}
                                    </span>
                                    <span className="text-sm text-gray-500">
                                        – {permission.tooltip}
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                })}

                {/* Models */}
                <div
                    className={cn(
                        "rounded-lg border transition-all",
                        rowTheme.selectedClasses,
                        disabled && "opacity-50 cursor-not-allowed",
                    )}
                >
                    {/* biome-ignore lint/a11y/useSemanticElements: full-row toggle with nested interactive children */}
                    <div
                        role="button"
                        tabIndex={disabled ? -1 : 0}
                        aria-expanded={modelsExpanded}
                        aria-label="Toggle model list"
                        onClick={() =>
                            !disabled && setModelsExpanded((v) => !v)
                        }
                        onKeyDown={(e) => {
                            if (disabled) return;
                            if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setModelsExpanded((v) => !v);
                            }
                        }}
                        className={cn(
                            "flex items-center gap-3 px-3 py-2",
                            rowTheme.focusRingClasses,
                            !disabled &&
                                (!isUnrestricted
                                    ? rowTheme.selectedHoverClasses
                                    : rowTheme.rowHoverClasses),
                            !disabled && "cursor-pointer",
                        )}
                    >
                        <div className="flex flex-1 items-baseline gap-1">
                            <span className="text-sm font-medium">Models</span>
                            <span className="text-sm text-gray-500">
                                –{" "}
                                {isUnrestricted
                                    ? "all models allowed"
                                    : `restricted to ${selectedCount} selected model${selectedCount === 1 ? "" : "s"}`}
                            </span>
                        </div>
                        <span
                            className={cn(
                                "text-gray-500 text-xs transition-transform",
                                modelsExpanded && "rotate-180",
                            )}
                            aria-hidden="true"
                        >
                            ▼
                        </span>
                    </div>
                    {modelsExpanded && (
                        <div className="px-3 pb-3 pt-3 space-y-3 border-t border-gray-200">
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
                    )}
                </div>
            </div>
        </div>
    );
};

/** Renders a category of model chips with a select/deselect-all toggle. */
const ModelCategory: FC<{
    label: string;
    models: ModelCategoryModel[];
    disabled: boolean;
    isModelSelected: (id: string) => boolean;
    toggleModel: (id: string) => void;
    toggleCategory: (models: ModelCategoryModel[]) => void;
    isCategoryAllSelected: (models: ModelCategoryModel[]) => boolean;
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
    theme = "blue",
}) => (
    <div>
        <div className="flex items-center justify-between mb-1">
            <span
                className={cn(
                    "text-sm font-semibold",
                    getModalityColors(label)?.text,
                )}
            >
                {label}
            </span>
            <button
                type="button"
                onClick={() => toggleCategory(models)}
                disabled={disabled}
                className={cn(
                    "text-micro disabled:opacity-50 cursor-pointer",
                    getPermissionUiTheme(theme).accent.actionTextClasses,
                )}
            >
                {isCategoryAllSelected(models) ? "Deselect all" : "Select all"}
            </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
            {models.map((model) => (
                <ModelChip
                    key={model.id}
                    apiName={model.id}
                    officialName={model.label}
                    selected={isModelSelected(model.id)}
                    onClick={() => toggleModel(model.id)}
                    disabled={disabled}
                    showApiName={showApiName}
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
    category?: string;
}> = ({
    apiName,
    officialName,
    selected,
    onClick,
    disabled,
    showApiName = true,
    category,
}) => (
    <ModalityButton
        category={category}
        selected={selected}
        onClick={onClick}
        disabled={disabled}
    >
        {officialName}
        {showApiName && (
            <span className="font-mono opacity-70"> - {apiName}</span>
        )}
    </ModalityButton>
);
