import { Button, ButtonGroup, Collapsible, cn } from "@pollinations/ui";
import { ModalityDot } from "@pollinations/ui/gen";
import type { FC } from "react";
import { useState } from "react";
import {
    MODEL_CATEGORIES,
    type ModelCategoryModel,
} from "../models/model-categories.ts";
import { normalizeAllowedModelSelection } from "./model-selection.ts";
import { getPermissionUiTheme } from "./permission-ui.ts";

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
    showApiName = true,
    modelsInitiallyExpanded = false,
}) => {
    const themeConfig = getPermissionUiTheme();
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
                                        : "border-theme-border",
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
                                    <span className="text-sm font-medium text-theme-text-strong">
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
                                    <span className="text-sm text-theme-text-muted">
                                        – {permission.tooltip}
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                })}

                {/* Models */}
                <Collapsible
                    expanded={modelsExpanded}
                    onToggle={() => setModelsExpanded((v) => !v)}
                    disabled={disabled}
                    ariaLabel="Toggle model list"
                    // Border only on the wrapper so the expanded panel stays
                    // transparent (chips read on the neutral dialog surface, not
                    // a themed fill). Highlight the header only when ≥1 model is
                    // selected — same as the Profile/Usage/Keys rows.
                    wrapperClassName="border-theme-border"
                    triggerClassName={
                        selectedCount > 0 ? "bg-theme-bg-active" : undefined
                    }
                    hoverClassName={
                        selectedCount > 0
                            ? rowTheme.selectedHoverClasses
                            : rowTheme.rowHoverClasses
                    }
                    focusClassName={rowTheme.focusRingClasses}
                    panelClassName="border-t border-theme-border px-3 pb-3 pt-3 space-y-3"
                    label={
                        <div className="flex items-baseline gap-1">
                            <span className="text-sm font-medium text-theme-text-strong">
                                Models
                            </span>
                            <span className="text-sm text-theme-text-muted">
                                –{" "}
                                {isUnrestricted
                                    ? "all models allowed"
                                    : `restricted to ${selectedCount} selected model${selectedCount === 1 ? "" : "s"}`}
                            </span>
                        </div>
                    }
                >
                    {MODEL_CATEGORIES.map(({ label, models }) => (
                        <ModelCategory
                            key={label}
                            label={label}
                            models={models}
                            disabled={disabled}
                            isModelSelected={isModelSelected}
                            toggleModel={toggleModel}
                            toggleCategory={toggleCategory}
                            isCategoryAllSelected={isCategoryAllSelected}
                            showApiName={showApiName}
                        />
                    ))}
                </Collapsible>
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
}> = ({
    label,
    models,
    disabled,
    isModelSelected,
    toggleModel,
    toggleCategory,
    isCategoryAllSelected,
    showApiName = true,
}) => (
    <div>
        <div className="flex items-center justify-between mb-1">
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-theme-text-strong">
                <ModalityDot modality={label} />
                {label}
            </span>
            <button
                type="button"
                onClick={() => toggleCategory(models)}
                disabled={disabled}
                className={cn(
                    "text-micro disabled:opacity-50 cursor-pointer",
                    getPermissionUiTheme().accent.actionTextClasses,
                )}
            >
                {isCategoryAllSelected(models) ? "Deselect all" : "Select all"}
            </button>
        </div>
        <ButtonGroup aria-label={`${label} models`}>
            {models.map((model) => (
                <ModelChip
                    key={model.id}
                    apiName={model.id}
                    officialName={model.label}
                    selected={isModelSelected(model.id)}
                    onClick={() => toggleModel(model.id)}
                    disabled={disabled}
                    showApiName={showApiName}
                />
            ))}
        </ButtonGroup>
    </div>
);

const ModelChip: FC<{
    apiName: string;
    officialName: string;
    selected: boolean;
    onClick: () => void;
    disabled?: boolean;
    showApiName?: boolean;
}> = ({
    apiName,
    officialName,
    selected,
    onClick,
    disabled,
    showApiName = true,
}) => {
    const colorClasses = selected
        ? "polli:bg-theme-bg-active polli:text-theme-text-strong"
        : cn(
              "polli:bg-ink-100 polli:text-theme-text-muted",
              !disabled &&
                  "polli:hover:bg-theme-bg-subtle polli:hover:text-theme-text-strong",
          );

    return (
        <Button
            type="button"
            size="sm"
            aria-pressed={selected}
            onClick={onClick}
            disabled={disabled}
            className={cn(
                "polli:shrink-0 polli:gap-1 polli:px-3 polli:py-1 polli:text-left polli:text-sm",
                colorClasses,
            )}
        >
            {officialName}
            {showApiName && (
                <span className="font-mono opacity-70"> - {apiName}</span>
            )}
        </Button>
    );
};
