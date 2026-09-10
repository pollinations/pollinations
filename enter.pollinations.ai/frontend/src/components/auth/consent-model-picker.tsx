import {
    Button,
    ButtonGroup,
    EditableCombobox,
    TabButton,
} from "@pollinations/ui";
import { useEffect, useMemo, useState } from "react";
import {
    setConsentModelGroup,
    toggleConsentModel,
} from "../keys/model-selection.ts";
import {
    type ApiModelInfo,
    fetchModelCatalog,
    getModelPricesFromCatalog,
} from "../models/model-catalog.ts";
import type { ModelCategoryModel } from "../models/model-categories.ts";
import {
    MODEL_FILTER_LABELS,
    ModelFilterTokens,
} from "../models/model-filter-tokens.tsx";
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
} from "../models/model-query.ts";

export function ConsentModelPicker({
    models,
    extraModels,
    selected,
    onChange,
    disabled,
}: {
    models: ModelCategoryModel[];
    extraModels: ApiModelInfo[];
    selected: string[] | null;
    onChange: (models: string[]) => void;
    disabled: boolean;
}) {
    const [catalog, setCatalog] = useState<ApiModelInfo[]>([]);
    const [search, setSearch] = useState("source:official");
    const [draft, setDraft] = useState<ModelQueryDraftFilter>();
    const [editing, setEditing] = useState<ModelQueryFilterToken>();
    const [pendingRemoval, setPendingRemoval] = useState<number>();
    const [open, setOpen] = useState(false);
    useEffect(() => {
        let cancelled = false;
        fetchModelCatalog()
            .then((catalog) => {
                if (!cancelled) setCatalog(catalog);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, []);
    const requestedIds = models.map(({ id }) => id);
    const searchableModels = useMemo(() => {
        const offered = new Set(models.map(({ id }) => id));
        return getModelPricesFromCatalog([...catalog, ...extraModels]).filter(
            ({ name }) => offered.has(name),
        );
    }, [catalog, extraModels, models]);
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
    const visibleSearch = getModelQueryVisibleSearch(search, tokens, draft);
    const parsed = parseModelQuery(query);
    const indexed = new Map(
        searchableModels.map((model) => [model.name, model]),
    );
    const visibleModels = models.filter((model) => {
        const metadata = indexed.get(model.id);
        return metadata
            ? matchesModelQuery(metadata, parsed)
            : parsed.filters.length === 0 &&
                  parsed.terms.every((term) =>
                      `${model.id} ${model.label}`.toLowerCase().includes(term),
                  );
    });
    const suggestions = getModelQuerySuggestions(
        draft ? search : visibleSearch,
        searchableModels,
    );
    const options = draft
        ? suggestions.map(getModelQueryDraftSuggestionValue)
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
        const nextDraft = value.endsWith(" ")
            ? undefined
            : getModelQueryDraftFilter(next, true);
        setSearch(next);
        setDraft(nextDraft);
        if (!nextDraft) setEditing(undefined);
        setOpen(
            !!nextDraft ||
                getModelQuerySuggestions(value, searchableModels).length > 0,
        );
    };

    return (
        <div className="space-y-3">
            <div className="space-y-1">
                <EditableCombobox
                    value={visibleSearch}
                    options={options}
                    onChange={changeSearch}
                    open={open}
                    onOpenChange={setOpen}
                    disabled={disabled}
                    aria-label="Search and filter models"
                    autoComplete="off"
                    placeholder={
                        draft
                            ? `${MODEL_FILTER_LABELS[draft.key]} value…`
                            : "Search models…"
                    }
                    onClick={() => setPendingRemoval(undefined)}
                    onBlur={() => {
                        setSearch(
                            draft && !draft.value
                                ? cancelledDraft()
                                : search.trim(),
                        );
                        resetDraft();
                    }}
                    onKeyDown={(event) => {
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
                                setSearch(
                                    removeModelQueryFilterToken(
                                        search,
                                        last.index,
                                    ),
                                );
                                resetDraft();
                            } else setPendingRemoval(last.index);
                        }
                    }}
                    startContent={
                        <ModelFilterTokens
                            tokens={tokens}
                            draft={draft}
                            pendingRemovalIndex={pendingRemoval}
                            onEdit={editFilter}
                        />
                    }
                />
                <div className="flex flex-wrap items-center justify-end gap-3">
                    <Button
                        size="xs"
                        className="polli:bg-transparent polli:px-0 polli:text-xs polli:font-normal polli:text-theme-text-soft polli:underline polli:underline-offset-2 polli:hover:bg-transparent"
                        disabled={disabled || visibleModels.length === 0}
                        onClick={() =>
                            onChange(
                                setConsentModelGroup(
                                    selected,
                                    requestedIds,
                                    visibleModels.map(({ id }) => id),
                                    false,
                                ),
                            )
                        }
                    >
                        Clear all
                    </Button>
                    <Button
                        size="xs"
                        className="polli:bg-transparent polli:px-0 polli:text-xs polli:font-normal polli:text-theme-text-soft polli:underline polli:underline-offset-2 polli:hover:bg-transparent"
                        disabled={disabled || visibleModels.length === 0}
                        onClick={() =>
                            onChange(
                                setConsentModelGroup(
                                    selected,
                                    requestedIds,
                                    visibleModels.map(({ id }) => id),
                                    true,
                                ),
                            )
                        }
                    >
                        Select all
                    </Button>
                </div>
            </div>
            <ButtonGroup aria-label="Requested models">
                {visibleModels.map((model) => {
                    const active =
                        selected === null || selected.includes(model.id);
                    return (
                        <TabButton
                            key={model.id}
                            active={active}
                            size="sm"
                            variant="ghost"
                            disabled={disabled}
                            onClick={() =>
                                onChange(
                                    toggleConsentModel(
                                        selected,
                                        requestedIds,
                                        model.id,
                                    ),
                                )
                            }
                        >
                            {model.label}
                        </TabButton>
                    );
                })}
            </ButtonGroup>
            {visibleModels.length === 0 && (
                <p className="text-xs text-theme-text-muted">
                    No models match these filters.
                </p>
            )}
        </div>
    );
}
