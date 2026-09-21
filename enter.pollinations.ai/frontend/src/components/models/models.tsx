import {
    Alert,
    BotIcon,
    ClockIcon,
    EditableCombobox,
    InlineLink,
    Section,
    SparklesIcon,
    TabButton,
    TokensIcon,
    UsageIcon,
} from "@pollinations/ui";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
    type FC,
    type KeyboardEvent,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { DashboardLoading } from "../layout/dashboard-loading.tsx";
import { McpServerList } from "./mcp-server-list.tsx";
import {
    type ApiModelInfo,
    fetchModelCatalog,
    getModelPricesFromCatalog,
} from "./model-catalog.ts";
import {
    MODEL_FILTER_LABELS,
    ModelFilterTokens,
} from "./model-filter-tokens.tsx";
import {
    ensureModelQueryDefaults,
    getExplicitModelQuerySource,
    getModelQueryDraftFilter,
    getModelQueryDraftSuggestionValue,
    getModelQueryFilterTokens,
    getModelQuerySuggestions,
    getModelQueryVisibleSearch,
    MODEL_QUERY_FILTER_KEYS,
    type ModelQueryDraftFilter,
    type ModelQueryFilterKey,
    type ModelQueryFilterToken,
    matchesModelQuery,
    parseModelQuery,
    removeModelQueryFilterToken,
    replaceModelQueryFilterToken,
} from "./model-query.ts";
import type { ModelSort } from "./model-search.ts";
import { sortModels } from "./model-sort.ts";
import { ModelSortMenu } from "./model-sort-menu.tsx";
import {
    type SectionType,
    sectionLabels,
    UnifiedModelTable,
} from "./model-table.tsx";
import type { ModelPrice } from "./types.ts";
import { useModelStats } from "./use-model-stats.ts";

const MODEL_SECTION_ORDER: SectionType[] = [
    "all",
    "text",
    "image",
    "video",
    "3d",
    "audio",
    "realtime",
    "embedding",
];

type PrimaryTab = "models" | "agent" | "mcp";
type SearchParam = "q" | "agentQ" | "mcpQ";

const AGENT_QUERY_FILTER_KEYS = ["publisher", "id", "capability"] as const;
const MCP_QUERY_FILTER_KEYS: readonly ModelQueryFilterKey[] = [];
const SEARCH_PARAM_BY_TAB: Record<PrimaryTab, SearchParam> = {
    models: "q",
    agent: "agentQ",
    mcp: "mcpQ",
};
const QUERY_FILTER_KEYS_BY_TAB: Record<
    PrimaryTab,
    readonly ModelQueryFilterKey[]
> = {
    models: MODEL_QUERY_FILTER_KEYS,
    agent: AGENT_QUERY_FILTER_KEYS,
    mcp: MCP_QUERY_FILTER_KEYS,
};

const SEARCH_LABELS: Record<SectionType, string> = {
    all: "all",
    image: "image",
    video: "video",
    "3d": "3D",
    audio: "audio",
    realtime: "realtime",
    text: "text",
    embedding: "embedding",
    agent: "agent",
    mcp: "MCP server",
};

function categorizeModels(
    models: ModelPrice[],
): Record<SectionType, ModelPrice[]> {
    const categorized: Record<SectionType, ModelPrice[]> = {
        all: [],
        image: [],
        video: [],
        "3d": [],
        audio: [],
        realtime: [],
        text: [],
        embedding: [],
        agent: [],
        mcp: [],
    };

    for (const model of models) {
        if (model.agent) {
            categorized.agent.push(model);
        } else {
            categorized.all.push(model);
            categorized[model.type].push(model);
        }
    }
    return categorized;
}

const isSourceSuggestion = (option: string): boolean =>
    option
        .slice(option.lastIndexOf(" ") + 1)
        .toLowerCase()
        .startsWith("source:");

export const Models: FC = () => {
    const navigate = useNavigate({ from: "/models" });
    const modelSearch = useSearch({ from: "/_dashboard/models" });
    const activeTab = modelSearch.category ?? "all";
    const activePrimaryTab: PrimaryTab =
        activeTab === "agent"
            ? "agent"
            : activeTab === "mcp"
              ? "mcp"
              : "models";
    const activeSort = modelSearch.sort ?? "popular";
    const searchParam = SEARCH_PARAM_BY_TAB[activePrimaryTab];
    const supportedFilterKeys = QUERY_FILTER_KEYS_BY_TAB[activePrimaryTab];
    const urlSearch = modelSearch[searchParam] ?? "";
    const initialSearch =
        activePrimaryTab === "models"
            ? ensureModelQueryDefaults(urlSearch)
            : urlSearch;
    const [search, setSearch] = useState(initialSearch);
    const [draftFilter, setDraftFilter] = useState<
        ModelQueryDraftFilter | undefined
    >(() =>
        getModelQueryDraftFilter(initialSearch, false, supportedFilterKeys),
    );
    const [editingFilterToken, setEditingFilterToken] = useState<
        ModelQueryFilterToken | undefined
    >();
    const [pendingRemovalIndex, setPendingRemovalIndex] = useState<
        number | undefined
    >();
    const [searchOpen, setSearchOpen] = useState(false);
    const lastPushedSearchRef = useRef(urlSearch);
    const previousPrimaryTabRef = useRef(activePrimaryTab);
    const [catalogModels, setCatalogModels] = useState<ApiModelInfo[]>([]);
    const [catalogLoading, setCatalogLoading] = useState(true);
    const [catalogError, setCatalogError] = useState<string | null>(null);
    const { stats } = useModelStats();
    const allModels = useMemo(
        () => getModelPricesFromCatalog(catalogModels, stats),
        [catalogModels, stats],
    );
    const agentModels = useMemo(
        () => allModels.filter((model) => model.agent),
        [allModels],
    );
    const allFilterTokens = useMemo(
        () => getModelQueryFilterTokens(search, supportedFilterKeys),
        [search, supportedFilterKeys],
    );
    const filterTokens = useMemo(
        () =>
            allFilterTokens.filter(({ index }) => index !== draftFilter?.index),
        [allFilterTokens, draftFilter],
    );
    const query =
        draftFilter === undefined
            ? search.trim()
            : editingFilterToken
              ? replaceModelQueryFilterToken(
                    search,
                    draftFilter.index,
                    editingFilterToken.token,
                )
              : removeModelQueryFilterToken(search, draftFilter.index);
    const parsedQuery = useMemo(
        () => parseModelQuery(query, supportedFilterKeys),
        [query, supportedFilterKeys],
    );
    const explicitModelSource = getExplicitModelQuerySource(parsedQuery);
    const visibleSearch = getModelQueryVisibleSearch(
        search,
        filterTokens,
        draftFilter,
    );
    const renderedFilterTokens = filterTokens;
    const renderedDraftFilter = draftFilter;
    const modelModels = useMemo(() => {
        const statusQuery = {
            terms: [],
            filters: parsedQuery.filters.filter(({ key }) => key === "status"),
        };
        return allModels.filter(
            (model) =>
                !model.agent &&
                matchesModelQuery(model, statusQuery) &&
                (explicitModelSource === undefined ||
                    Boolean(model.community) ===
                        (explicitModelSource === "community")),
        );
    }, [allModels, explicitModelSource, parsedQuery]);
    const modelSections = useMemo(
        () => categorizeModels(modelModels),
        [modelModels],
    );
    const activeTabModels = useMemo(() => {
        if (activeTab === "mcp") return [];
        if (activeTab === "agent") return agentModels;
        return modelSections[activeTab];
    }, [activeTab, agentModels, modelSections]);
    const filteredModels = useMemo(
        () =>
            query
                ? activeTabModels.filter((model) =>
                      matchesModelQuery(model, parsedQuery),
                  )
                : activeTabModels,
        [activeTabModels, parsedQuery, query],
    );
    const searchOptions = useMemo(() => {
        let options = getModelQuerySuggestions(
            draftFilter ? search : visibleSearch,
            activeTabModels,
            supportedFilterKeys,
        );
        if (explicitModelSource) {
            options = options.filter((option) => !isSourceSuggestion(option));
        }
        return draftFilter
            ? options.map(getModelQueryDraftSuggestionValue)
            : options;
    }, [
        activeTabModels,
        draftFilter,
        explicitModelSource,
        search,
        supportedFilterKeys,
        visibleSearch,
    ]);
    const draftFilterKey = draftFilter?.key;

    useEffect(() => {
        if (draftFilterKey) setSearchOpen(true);
    }, [draftFilterKey]);

    useEffect(() => {
        if (!draftFilterKey && searchOptions.length === 0) {
            setSearchOpen(false);
        }
    }, [draftFilterKey, searchOptions.length]);

    const loadModelCatalog = useCallback(
        () =>
            fetchModelCatalog()
                .then((models) => {
                    setCatalogModels(models);
                    setCatalogError(null);
                })
                .catch((error) => {
                    console.error("Model catalog fetch failed:", error);
                    setCatalogModels([]);
                    setCatalogError("Could not load models.");
                })
                .finally(() => setCatalogLoading(false)),
        [],
    );

    useEffect(() => {
        void loadModelCatalog();
    }, [loadModelCatalog]);

    const sectionModels = useMemo(
        () => categorizeModels(sortModels(filteredModels, activeSort)),
        [activeSort, filteredModels],
    );
    const searchLabel = SEARCH_LABELS[activeTab];
    const searchTarget =
        activeTab === "mcp"
            ? "MCP servers"
            : activeTab === "agent"
              ? "agents"
              : activeTab === "all"
                ? explicitModelSource
                    ? `${explicitModelSource} models`
                    : "models"
                : [explicitModelSource, searchLabel, "models"]
                      .filter(Boolean)
                      .join(" ");

    const pushSearch = useCallback(
        (nextSearch: string) => {
            const normalizedSearch = nextSearch.trim();
            if (normalizedSearch === lastPushedSearchRef.current) return;

            lastPushedSearchRef.current = normalizedSearch;
            void navigate({
                search: (previous) => ({
                    ...previous,
                    [searchParam]: normalizedSearch || undefined,
                }),
                replace: true,
            });
        },
        [navigate, searchParam],
    );

    const setVisibleSearch = (nextSearch: string) => {
        setPendingRemovalIndex(undefined);
        const preservedFilters = filterTokens.map(({ token }) => token);
        const editableTokens = nextSearch.trim().split(/\s+/).filter(Boolean);
        const nextQuery = draftFilter
            ? [
                  ...preservedFilters,
                  ...editableTokens.slice(0, -1),
                  `${draftFilter.key}:${editableTokens.at(-1) ?? ""}`,
              ]
                  .filter(Boolean)
                  .join(" ")
            : [...preservedFilters, nextSearch.trim()]
                  .filter(Boolean)
                  .join(" ");

        const nextDraftFilter = nextSearch.endsWith(" ")
            ? undefined
            : getModelQueryDraftFilter(nextQuery, true, supportedFilterKeys);
        setDraftFilter(nextDraftFilter);
        if (!nextDraftFilter) setEditingFilterToken(undefined);
        setSearch(nextQuery);
    };

    const removeFilter = (filterToken: ModelQueryFilterToken) => {
        setPendingRemovalIndex(undefined);
        setSearchOpen(false);
        setDraftFilter(undefined);
        setEditingFilterToken(undefined);
        setSearch(removeModelQueryFilterToken(search, filterToken.index));
    };

    const editFilter = (filterToken: ModelQueryFilterToken) => {
        setPendingRemovalIndex(undefined);
        setEditingFilterToken(filterToken);
        const tokens = search.split(/\s+/).filter(Boolean);
        tokens[filterToken.index] = `${filterToken.filter.key}:`;
        setSearch(tokens.join(" "));
        setDraftFilter({
            index: filterToken.index,
            key: filterToken.filter.key,
            value: "",
        });
        setSearchOpen(true);
    };

    const getCancelledDraftSearch = () => {
        if (!draftFilter) return search.trim();
        return editingFilterToken
            ? replaceModelQueryFilterToken(
                  search,
                  draftFilter.index,
                  editingFilterToken.token,
              )
            : removeModelQueryFilterToken(search, draftFilter.index);
    };

    const removeDraftFilter = () => {
        if (!draftFilter) return;
        setPendingRemovalIndex(undefined);
        setSearchOpen(false);
        setSearch(getCancelledDraftSearch());
        setDraftFilter(undefined);
        setEditingFilterToken(undefined);
    };

    const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== "Backspace") {
            setPendingRemovalIndex(undefined);
            return;
        }
        if (visibleSearch !== "") {
            setPendingRemovalIndex(undefined);
            return;
        }

        const lastFilter = renderedFilterTokens.at(-1);
        if (!draftFilter && !lastFilter) return;

        event.preventDefault();
        if (draftFilter) {
            removeDraftFilter();
        } else if (lastFilter) {
            setSearchOpen(false);
            if (pendingRemovalIndex === lastFilter.index) {
                removeFilter(lastFilter);
            } else {
                setPendingRemovalIndex(lastFilter.index);
            }
        }
    };

    useEffect(() => {
        const primaryTabChanged =
            activePrimaryTab !== previousPrimaryTabRef.current;
        previousPrimaryTabRef.current = activePrimaryTab;

        if (!primaryTabChanged && urlSearch === lastPushedSearchRef.current)
            return;

        lastPushedSearchRef.current = urlSearch;
        setPendingRemovalIndex(undefined);
        setEditingFilterToken(undefined);
        const nextSearch =
            activePrimaryTab === "models"
                ? ensureModelQueryDefaults(urlSearch)
                : urlSearch;
        setDraftFilter(
            getModelQueryDraftFilter(nextSearch, false, supportedFilterKeys),
        );
        setSearch(nextSearch);
    }, [activePrimaryTab, supportedFilterKeys, urlSearch]);

    useEffect(() => {
        if (query === lastPushedSearchRef.current) return;

        const timeout = window.setTimeout(() => {
            pushSearch(query);
        }, 200);

        return () => window.clearTimeout(timeout);
    }, [pushSearch, query]);

    const setActiveTab = (category: SectionType) => {
        void navigate({
            search: (previous) => ({
                ...previous,
                category: category === "all" ? undefined : category,
            }),
        });
    };

    const setActiveSort = (sort: ModelSort) => {
        void navigate({
            search: (previous) => ({
                ...previous,
                sort: sort === "popular" ? undefined : sort,
            }),
        });
    };

    if (catalogLoading && activePrimaryTab !== "mcp") {
        return (
            <DashboardLoading
                label={
                    activePrimaryTab === "agent"
                        ? "Loading agents…"
                        : "Loading models…"
                }
            />
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <Section
                title={
                    activePrimaryTab === "agent"
                        ? "Agents"
                        : activePrimaryTab === "mcp"
                          ? "MCP"
                          : "Models"
                }
                actionClassName="ml-auto"
                action={
                    activePrimaryTab === "models" && (
                        <InlineLink
                            href="https://model-monitor.pollinations.ai"
                            size="sm"
                            className="inline-flex items-center gap-1.5 whitespace-nowrap"
                        >
                            <UsageIcon className="h-4 w-4" />
                            Model health
                        </InlineLink>
                    )
                }
            >
                <div className="flex flex-col items-start gap-3">
                    {activePrimaryTab === "models" && (
                        <div className="flex w-full flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap gap-1.5">
                                {MODEL_SECTION_ORDER.filter(
                                    (section) =>
                                        section === "all" ||
                                        modelSections[section].length > 0,
                                ).map((section) => (
                                    <TabButton
                                        key={section}
                                        active={activeTab === section}
                                        onClick={() => setActiveTab(section)}
                                        ariaLabel={sectionLabels[section]}
                                    >
                                        {sectionLabels[section]}
                                    </TabButton>
                                ))}
                            </div>
                        </div>
                    )}
                    <div className="flex w-full flex-wrap items-center justify-between gap-2">
                        <div className="catalog-search min-w-0 flex-1 basis-[240px]">
                            <div>
                                <EditableCombobox
                                    value={visibleSearch}
                                    options={searchOptions}
                                    onChange={setVisibleSearch}
                                    open={searchOpen}
                                    onOpenChange={setSearchOpen}
                                    onClick={() =>
                                        setPendingRemovalIndex(undefined)
                                    }
                                    onKeyDown={handleSearchKeyDown}
                                    onBlur={() => {
                                        const normalizedSearch =
                                            draftFilter && !draftFilter.value
                                                ? getCancelledDraftSearch()
                                                : search.trim();
                                        setDraftFilter(undefined);
                                        setEditingFilterToken(undefined);
                                        setSearch(normalizedSearch);
                                        pushSearch(normalizedSearch);
                                    }}
                                    placeholder={
                                        renderedDraftFilter
                                            ? `${MODEL_FILTER_LABELS[renderedDraftFilter.key]} value…`
                                            : `Search ${searchTarget}…`
                                    }
                                    aria-label={`Search ${searchTarget}`}
                                    autoComplete="off"
                                    contentClassName="catalog-search-panel"
                                    startContent={
                                        <ModelFilterTokens
                                            tokens={renderedFilterTokens}
                                            draft={renderedDraftFilter}
                                            pendingRemovalIndex={
                                                pendingRemovalIndex
                                            }
                                            onEdit={editFilter}
                                            onChange={(token, value) => {
                                                setSearch(
                                                    replaceModelQueryFilterToken(
                                                        getCancelledDraftSearch(),
                                                        token.index,
                                                        `${token.filter.key}:${value}`,
                                                    ),
                                                );
                                                setDraftFilter(undefined);
                                                setEditingFilterToken(
                                                    undefined,
                                                );
                                                setPendingRemovalIndex(
                                                    undefined,
                                                );
                                                setSearchOpen(false);
                                            }}
                                        />
                                    }
                                />
                            </div>
                        </div>
                        {activeTab !== "mcp" && (
                            <div className="flex flex-wrap items-center gap-2">
                                <ModelSortMenu
                                    value={activeSort}
                                    onChange={setActiveSort}
                                />
                            </div>
                        )}
                    </div>
                </div>
                {(activePrimaryTab === "agent" ||
                    (activePrimaryTab === "models" &&
                        explicitModelSource !== "official")) && (
                    <Alert
                        intent="advisory"
                        title="Community privacy"
                        className="polli:bg-transparent"
                    >
                        Independent providers and configured fallbacks process
                        requests under their own policies.{" "}
                        <strong className="font-semibold text-theme-text-strong">
                            Avoid sensitive data.
                        </strong>{" "}
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                            <InlineLink href="https://gen.pollinations.ai/docs#tag/Safety">
                                Privacy filter
                            </InlineLink>
                            <span aria-hidden="true">·</span>
                            <InlineLink href="https://pollinations.ai/privacy">
                                Privacy Policy
                            </InlineLink>
                        </span>
                    </Alert>
                )}
                {catalogError && activeTab !== "mcp" && (
                    <Alert intent="danger">{catalogError}</Alert>
                )}
                {activeTab === "mcp" ? (
                    <McpServerList query={query} />
                ) : query && sectionModels[activeTab].length === 0 ? (
                    <p className="py-8 text-center text-sm text-theme-text-muted">
                        No {searchTarget.toLowerCase()} match{" "}
                        {visibleSearch.trim()
                            ? `“${visibleSearch.trim()}”`
                            : "the selected filters"}
                        .
                    </p>
                ) : (
                    <div className="overflow-x-auto md:overflow-visible [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                        <UnifiedModelTable
                            listKey={`${explicitModelSource ?? "all-sources"}:${activeTab}:${query}:${activeSort}`}
                            allModels={sectionModels.all}
                            imageModels={sectionModels.image}
                            videoModels={sectionModels.video}
                            model3dModels={sectionModels["3d"]}
                            audioModels={sectionModels.audio}
                            realtimeModels={sectionModels.realtime}
                            textModels={sectionModels.text}
                            embeddingModels={sectionModels.embedding}
                            agentModels={sectionModels.agent}
                            activeTab={activeTab}
                        />
                    </div>
                )}
                {activeTab !== "mcp" && (
                    <div className="space-y-2 px-1 text-[13px] leading-snug text-theme-text-muted">
                        {activeTab === "agent" && (
                            <p className="flex items-start gap-1.5">
                                <BotIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                <span>
                                    <strong>agent pricing</strong> — listed
                                    rates are for the agent&apos;s base model
                                    running its saved instructions.
                                </span>
                            </p>
                        )}
                        <p className="flex items-start gap-1.5">
                            <SparklesIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>
                                <strong>/gen</strong> — flat rate per image or
                                audio generation.
                            </span>
                        </p>
                        <p className="flex items-start gap-1.5">
                            <TokensIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>
                                <strong>/K · /M</strong> — rates per thousand or
                                million tokens.
                            </span>
                        </p>
                        <p className="flex items-start gap-1.5">
                            <ClockIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>
                                <strong>/sec</strong> — per second of
                                video/audio; TTS is estimated from text length.
                            </span>
                        </p>
                        <p className="flex items-start gap-1.5">
                            <UsageIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>
                                <strong>requests /pollen</strong> — estimated
                                from the median observed cost over the last 7
                                days.
                            </span>
                        </p>
                    </div>
                )}
            </Section>
        </div>
    );
};
