import type { EditableComboboxProps } from "@pollinations/ui";
import { useState } from "react";
import {
    MODEL_FILTER_LABELS,
    ModelFilterTokens,
} from "./model-filter-tokens.tsx";
import {
    getModelQueryDraftFilter,
    getModelQueryDraftSuggestionValue,
    getModelQueryFilterTokens,
    getModelQuerySuggestions,
    getModelQueryVisibleSearch,
    type ModelQueryDraftFilter,
    type ModelQueryFilterToken,
    matchesModelQuery,
    parseModelQuery,
    removeModelQueryFilterToken,
    replaceModelQueryFilterToken,
} from "./model-query.ts";
import type { ModelPrice } from "./types.ts";

type ComboboxSearchProps = Pick<
    EditableComboboxProps,
    | "value"
    | "options"
    | "onChange"
    | "open"
    | "onOpenChange"
    | "closeOnSelect"
    | "placeholder"
    | "onClick"
    | "onBlur"
    | "onKeyDown"
    | "startContent"
>;

/**
 * One search-and-filter field for model lists: `key:value` filter tokens plus
 * free text, with filter suggestions in the dropdown. `pickable` also lists the
 * matching model ids so a single model can be chosen; the free text is then
 * that model id. Spread `comboboxProps` onto an `EditableCombobox`.
 */
export function useModelQuerySearch({
    models,
    initial = "source:official",
    pickable = false,
    value,
    onTextChange,
}: {
    models: ModelPrice[];
    initial?: string;
    pickable?: boolean;
    /** Parent-owned model ID for pickers; filters remain local search state. */
    value?: string;
    onTextChange?: (text: string) => void;
}) {
    const [localSearch, setSearch] = useState(initial);
    const [localDraft, setDraft] = useState<ModelQueryDraftFilter>();
    const [editing, setEditing] = useState<ModelQueryFilterToken>();
    const [pendingRemoval, setPendingRemoval] = useState<number>();
    const [open, setOpen] = useState(false);

    // A model picker owns its model ID in the form. Keep only the filter
    // editing state here, so parent resets are reflected without another copy.
    const controlledParts = [
        ...getModelQueryFilterTokens(localSearch)
            .filter(({ index }) => index !== localDraft?.index)
            .map(({ token }) => token),
        ...(value?.trim().split(/\s+/).filter(Boolean) ?? []),
    ];
    const draft =
        value !== undefined && localDraft
            ? { ...localDraft, index: controlledParts.length }
            : localDraft;
    const search =
        value === undefined
            ? localSearch
            : [
                  ...controlledParts,
                  ...(draft ? [`${draft.key}:${draft.value}`] : []),
              ].join(" ");

    const tokens = getModelQueryFilterTokens(search).filter(
        ({ index }) => index !== draft?.index,
    );
    const cancelledDraft = () =>
        !draft
            ? search.trim()
            : editing
              ? replaceModelQueryFilterToken(search, draft.index, editing.token)
              : removeModelQueryFilterToken(search, draft.index);
    const query = draft ? cancelledDraft() : search.trim();
    const visibleSearch =
        value !== undefined && draft
            ? draft.value
            : getModelQueryVisibleSearch(search, tokens, draft);
    const parsed = parseModelQuery(query);
    const matches = (model: ModelPrice) => matchesModelQuery(model, parsed);
    const suggestions = getModelQuerySuggestions(
        draft ? search : visibleSearch,
        models,
    );
    const options = draft
        ? suggestions.map(getModelQueryDraftSuggestionValue)
        : pickable
          ? [
                ...suggestions,
                ...models
                    .filter(matches)
                    .map(({ name }) => name)
                    .sort((a, b) => a.localeCompare(b)),
            ]
          : suggestions;

    const resetDraft = () => {
        setDraft(undefined);
        setEditing(undefined);
        setPendingRemoval(undefined);
    };
    const editFilter = (token: ModelQueryFilterToken) => {
        setEditing(token);
        setPendingRemoval(undefined);
        setSearch(
            replaceModelQueryFilterToken(
                search,
                token.index,
                `${token.filter.key}:`,
            ),
        );
        setDraft({ index: token.index, key: token.filter.key, value: "" });
        setOpen(true);
    };
    const changeSearch = (value: string) => {
        setPendingRemoval(undefined);
        const editable = value.trim().split(/\s+/).filter(Boolean);
        const next = [
            ...tokens.map(({ token }) => token),
            ...(draft
                ? [
                      ...editable.slice(0, -1),
                      `${draft.key}:${editable.at(-1) ?? ""}`,
                  ]
                : [value.trim()]),
        ]
            .filter(Boolean)
            .join(" ");
        const nextDraft =
            value.trim() === "" || value.endsWith(" ")
                ? undefined
                : getModelQueryDraftFilter(next, true);
        setSearch(next);
        setDraft(nextDraft);
        if (!nextDraft) setEditing(undefined);
        // A filter draft is search UI, never a selected model ID. Cancelling
        // or completing a filter must leave the parent's model untouched.
        if (!draft && !nextDraft) {
            onTextChange?.(
                getModelQueryVisibleSearch(
                    next,
                    getModelQueryFilterTokens(next),
                ),
            );
        }
        setOpen(
            !value.endsWith(" ") &&
                (!!nextDraft ||
                    pickable ||
                    getModelQuerySuggestions(value, models).length > 0),
        );
    };

    const comboboxProps: ComboboxSearchProps = {
        value: visibleSearch,
        options,
        onChange: changeSearch,
        open: open && options.length > 0,
        onOpenChange: setOpen,
        closeOnSelect: pickable && !draft,
        placeholder: draft
            ? `${MODEL_FILTER_LABELS[draft.key]} value…`
            : "Search models…",
        onClick: () => setPendingRemoval(undefined),
        onBlur: () => {
            setSearch(draft && !draft.value ? cancelledDraft() : search.trim());
            resetDraft();
        },
        onKeyDown: (event) => {
            // Searching inside a form must not submit it.
            if (event.key === "Enter" && (!open || options.length === 0)) {
                event.preventDefault();
                return;
            }
            if (event.key !== "Backspace" || visibleSearch !== "") {
                setPendingRemoval(undefined);
                return;
            }
            const last = tokens.at(-1);
            if (!draft && !last) return;
            event.preventDefault();
            setOpen(false);
            if (draft) {
                setSearch(cancelledDraft());
                resetDraft();
            } else if (last) {
                if (pendingRemoval === last.index) {
                    setSearch(removeModelQueryFilterToken(search, last.index));
                    resetDraft();
                } else setPendingRemoval(last.index);
            }
        },
        startContent: (
            <ModelFilterTokens
                tokens={tokens}
                draft={draft}
                pendingRemovalIndex={pendingRemoval}
                onEdit={editFilter}
            />
        ),
    };

    return { parsed, matches, text: visibleSearch, comboboxProps };
}
