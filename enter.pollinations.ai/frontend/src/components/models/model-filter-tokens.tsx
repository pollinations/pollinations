import { EditableComboboxToken, SearchIcon } from "@pollinations/ui";
import type { FC } from "react";
import type {
    ModelQueryDraftFilter,
    ModelQueryFilter,
    ModelQueryFilterToken,
} from "./model-query.ts";

export const MODEL_FILTER_LABELS: Record<ModelQueryFilter["key"], string> = {
    access: "Access",
    source: "Source",
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
};

export const ModelFilterTokens: FC<ModelFilterTokensProps> = ({
    tokens,
    draft,
    pendingRemovalIndex,
    onEdit,
}) => {
    if (tokens.length === 0 && !draft) {
        return (
            <SearchIcon className="pointer-events-none ml-1 mr-0.5 h-4 w-4 shrink-0 text-theme-text-muted" />
        );
    }

    return (
        <>
            {tokens.map((token) => {
                const label = MODEL_FILTER_LABELS[token.filter.key];
                const value = formatFilterValue(token.filter);
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
