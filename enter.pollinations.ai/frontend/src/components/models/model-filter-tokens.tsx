import {
    CheckIcon,
    Dropdown,
    DropdownItem,
    EditableComboboxToken,
    SearchIcon,
} from "@pollinations/ui";
import type { FC } from "react";
import type {
    ModelQueryDraftFilter,
    ModelQueryFilter,
    ModelQueryFilterToken,
} from "./model-query.ts";
import {
    getModelQueryDraftSuggestionValue,
    getModelQuerySuggestions,
} from "./model-query.ts";

export const MODEL_FILTER_LABELS: Record<ModelQueryFilter["key"], string> = {
    access: "Access",
    source: "Source",
    status: "Status",
    publisher: "Publisher",
    id: "ID",
    type: "Type",
    capability: "Capability",
};

const formatFilterValue = (filter: ModelQueryFilter): string =>
    filter.key === "id" || filter.key === "publisher"
        ? filter.value
        : filter.value.replaceAll("-", " ");

type ModelFilterTokensProps = {
    tokens: ModelQueryFilterToken[];
    draft?: ModelQueryDraftFilter;
    pendingRemovalIndex?: number;
    onEdit: (token: ModelQueryFilterToken) => void;
    onChange: (token: ModelQueryFilterToken, value: string) => void;
};

export const ModelFilterTokens: FC<ModelFilterTokensProps> = ({
    tokens,
    draft,
    pendingRemovalIndex,
    onEdit,
    onChange,
}) => {
    return (
        <>
            <SearchIcon
                aria-hidden="true"
                className="pointer-events-none ml-1 mr-0.5 h-4 w-4 shrink-0 text-theme-text-muted"
            />
            {tokens.map((token) => {
                const label = MODEL_FILTER_LABELS[token.filter.key];
                const value = formatFilterValue(token.filter);
                if (
                    token.filter.key === "source" ||
                    token.filter.key === "status"
                ) {
                    return (
                        <Dropdown
                            key={`${token.index}:${token.filter.key}`}
                            className="catalog-filter-menu min-w-32 p-1"
                            trigger={() => (
                                <EditableComboboxToken
                                    label={label}
                                    value={value}
                                    className="catalog-filter-trigger capitalize"
                                    highlighted={
                                        pendingRemovalIndex === token.index
                                    }
                                    aria-label={`Change ${label} filter: ${value}`}
                                />
                            )}
                        >
                            {(close) =>
                                getModelQuerySuggestions(
                                    `${token.filter.key}:`,
                                    [],
                                ).map((option) => {
                                    const nextValue =
                                        getModelQueryDraftSuggestionValue(
                                            option,
                                        ).trim();
                                    return (
                                        <DropdownItem
                                            key={nextValue}
                                            type="button"
                                            aria-pressed={
                                                token.filter.value === nextValue
                                            }
                                            onClick={() => {
                                                onChange(token, nextValue);
                                                close();
                                            }}
                                            className="catalog-filter-option capitalize"
                                        >
                                            {nextValue}
                                            <CheckIcon
                                                aria-hidden="true"
                                                className={`ml-auto h-3.5 w-3.5 shrink-0 ${token.filter.value === nextValue ? "" : "invisible"}`}
                                            />
                                        </DropdownItem>
                                    );
                                })
                            }
                        </Dropdown>
                    );
                }
                return (
                    <EditableComboboxToken
                        key={`${token.index}:${token.token}`}
                        label={label}
                        value={value}
                        highlighted={pendingRemovalIndex === token.index}
                        aria-label={`Change ${label} filter: ${value}`}
                        onClick={() => onEdit(token)}
                    />
                );
            })}
            {draft && (
                <div className="flex h-7 max-w-full shrink-0 items-center text-xs">
                    <span className="py-1 pl-1.5 pr-1 text-theme-text-muted">
                        {MODEL_FILTER_LABELS[draft.key]}:
                    </span>
                </div>
            )}
        </>
    );
};
