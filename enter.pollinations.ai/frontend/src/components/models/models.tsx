import {
    Alert,
    BeakerIcon,
    BotIcon,
    Button,
    ChevronIcon,
    ClockIcon,
    Dropdown,
    DropdownItem,
    EditableCombobox,
    EditableComboboxToken,
    ExternalLinkButton,
    GitHubIcon,
    InlineLink,
    McpIcon,
    SearchIcon,
    Section,
    SparklesIcon,
    TabButton,
    TokensIcon,
    TrendUpIcon,
    UsageIcon,
    WarningIcon,
} from "@pollinations/ui";
import { MCP_SERVERS } from "@shared/registry/mcp.ts";
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
import { McpServerList } from "./mcp-server-list.tsx";
import {
    type ApiModelInfo,
    fetchModelCatalog,
    getModelPricesFromCatalog,
} from "./model-catalog.ts";
import {
    ensureModelQuerySource,
    getExplicitModelQuerySource,
    getModelQueryDraftFilter,
    getModelQueryFilterTokens,
    getModelQuerySuggestions,
    MODEL_QUERY_FILTER_KEYS,
    type ModelQueryDraftFilter,
    type ModelQueryFilter,
    type ModelQueryFilterKey,
    type ModelQueryFilterToken,
    matchesModelQuery,
    parseModelQuery,
    removeModelQueryFilterToken,
} from "./model-query.ts";
import type { ModelSort } from "./model-search.ts";
import { sortModels } from "./model-sort.ts";
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

const PRIMARY_TABS: Array<{
    value: PrimaryTab;
    label: string;
    Icon: FC<{ className?: string }>;
}> = [
    { value: "models", label: "Models", Icon: BeakerIcon },
    { value: "agent", label: "Agents", Icon: BotIcon },
    { value: "mcp", label: "MCP", Icon: McpIcon },
];

const TabCount: FC<{ value: number }> = ({ value }) => (
    <span
        aria-hidden="true"
        className="text-[0.8em] font-normal tabular-nums text-theme-text-muted"
    >
        {value}
    </span>
);

const MODEL_SLUG_LIST_URL =
    "https://github.com/pollinations/pollinations/blob/main/MODEL_SLUGS.md";

const SORT_OPTIONS: Array<{
    value: ModelSort;
    label: string;
    accessibleLabel: string;
}> = [
    {
        value: "popular",
        label: "Most Popular",
        accessibleLabel: "Most popular",
    },
    {
        value: "newest",
        label: "Last Added",
        accessibleLabel: "Date added, newest first",
    },
    {
        value: "price-low",
        label: "Price: Low",
        accessibleLabel: "Lowest price first",
    },
    {
        value: "price-high",
        label: "Price: High",
        accessibleLabel: "Highest price first",
    },
    { value: "title", label: "Name: A–Z", accessibleLabel: "Name: A to Z" },
    {
        value: "title-desc",
        label: "Name: Z–A",
        accessibleLabel: "Name: Z to A",
    },
    {
        value: "brand",
        label: "Publisher: A–Z",
        accessibleLabel: "Publisher: A to Z",
    },
    {
        value: "brand-desc",
        label: "Publisher: Z–A",
        accessibleLabel: "Publisher: Z to A",
    },
];

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

function handleSortMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (
        event.key !== "ArrowDown" &&
        event.key !== "ArrowUp" &&
        event.key !== "Home" &&
        event.key !== "End"
    ) {
        return;
    }

    const items = Array.from(
        event.currentTarget.querySelectorAll<HTMLElement>(
            '[role="menuitemradio"]',
        ),
    );
    if (items.length === 0) return;

    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    const nextIndex =
        event.key === "Home"
            ? 0
            : event.key === "End"
              ? items.length - 1
              : event.key === "ArrowDown"
                ? (currentIndex + 1) % items.length
                : (currentIndex - 1 + items.length) % items.length;

    event.preventDefault();
    items[nextIndex]?.focus();
}

const isSourceSuggestion = (option: string): boolean =>
    option
        .slice(option.lastIndexOf(" ") + 1)
        .toLowerCase()
        .startsWith("source:");

const MODEL_FILTER_LABELS: Record<ModelQueryFilter["key"], string> = {
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

function getVisibleSearch(
    query: string,
    filters: ModelQueryFilterToken[],
    draftFilter?: ModelQueryDraftFilter,
): string {
    const filterIndexes = new Set(filters.map(({ index }) => index));
    return query
        .split(/\s+/)
        .filter(Boolean)
        .map((token, index) =>
            index === draftFilter?.index ? draftFilter.value : token,
        )
        .filter((_token, index) => !filterIndexes.has(index))
        .filter(Boolean)
        .join(" ");
}

const getDraftSuggestionValue = (option: string): string => {
    const trimmedOption = option.trimEnd();
    const token = trimmedOption.slice(trimmedOption.lastIndexOf(" ") + 1);
    const trailingSpace = option.endsWith(" ") ? " " : "";
    return `${token.slice(token.indexOf(":") + 1)}${trailingSpace}`;
};

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
            ? ensureModelQuerySource(urlSearch)
            : urlSearch;
    const [search, setSearch] = useState(initialSearch);
    const [draftFilter, setDraftFilter] = useState<
        ModelQueryDraftFilter | undefined
    >(() =>
        getModelQueryDraftFilter(initialSearch, false, supportedFilterKeys),
    );
    const [pendingRemovalIndex, setPendingRemovalIndex] = useState<
        number | undefined
    >();
    const [searchOpen, setSearchOpen] = useState(false);
    const lastPushedSearchRef = useRef(urlSearch);
    const previousPrimaryTabRef = useRef(activePrimaryTab);
    const [catalogModels, setCatalogModels] = useState<ApiModelInfo[]>([]);
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
            : removeModelQueryFilterToken(search, draftFilter.index);
    const parsedQuery = useMemo(
        () => parseModelQuery(query, supportedFilterKeys),
        [query, supportedFilterKeys],
    );
    const explicitModelSource = getExplicitModelQuerySource(parsedQuery);
    const visibleSearch = getVisibleSearch(search, filterTokens, draftFilter);
    const renderedFilterTokens = filterTokens;
    const renderedDraftFilter = draftFilter;
    const modelModels = useMemo(
        () =>
            allModels.filter(
                (model) =>
                    !model.agent &&
                    (explicitModelSource === undefined ||
                        Boolean(model.community) ===
                            (explicitModelSource === "community")),
            ),
        [allModels, explicitModelSource],
    );
    const modelSections = useMemo(
        () => categorizeModels(modelModels),
        [modelModels],
    );
    const primaryTabCounts: Record<PrimaryTab, number> = {
        models: modelSections.all.length,
        agent: agentModels.length,
        mcp: MCP_SERVERS.length,
    };
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
        return draftFilter ? options.map(getDraftSuggestionValue) : options;
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
                }),
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

        setDraftFilter(
            nextSearch.endsWith(" ")
                ? undefined
                : getModelQueryDraftFilter(
                      nextQuery,
                      true,
                      supportedFilterKeys,
                  ),
        );
        setSearch(nextQuery);
    };

    const removeFilter = (filterToken: ModelQueryFilterToken) => {
        setPendingRemovalIndex(undefined);
        setSearchOpen(false);
        setDraftFilter(undefined);
        setSearch(removeModelQueryFilterToken(search, filterToken.index));
    };

    const editFilter = (filterToken: ModelQueryFilterToken) => {
        setPendingRemovalIndex(undefined);
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

    const removeDraftFilter = () => {
        if (!draftFilter) return;
        setPendingRemovalIndex(undefined);
        setSearchOpen(false);
        setSearch(removeModelQueryFilterToken(search, draftFilter.index));
        setDraftFilter(undefined);
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
        const nextSearch =
            activePrimaryTab === "models"
                ? ensureModelQuerySource(urlSearch)
                : urlSearch;
        setDraftFilter(
            getModelQueryDraftFilter(nextSearch, false, supportedFilterKeys),
        );
        setSearch(nextSearch);
    }, [activePrimaryTab, supportedFilterKeys, urlSearch]);

    useEffect(() => {
        if (search === lastPushedSearchRef.current) return;

        const timeout = window.setTimeout(() => {
            pushSearch(search);
        }, 200);

        return () => window.clearTimeout(timeout);
    }, [pushSearch, search]);

    const setActiveTab = (category: SectionType) => {
        void navigate({
            search: (previous) => ({
                ...previous,
                category: category === "all" ? undefined : category,
            }),
        });
    };

    const setActivePrimaryTab = (primaryTab: PrimaryTab) => {
        void navigate({
            search: (previous) => ({
                ...previous,
                category: primaryTab === "models" ? undefined : primaryTab,
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

    const activeSortLabel =
        SORT_OPTIONS.find(({ value }) => value === activeSort)?.label ??
        "Most Popular";
    const activeSortAccessibleLabel =
        SORT_OPTIONS.find(({ value }) => value === activeSort)
            ?.accessibleLabel ?? "Most popular";
    return (
        <div className="flex flex-col gap-6">
            <Section
                title="Models"
                framed
                actionClassName="w-full sm:ml-auto sm:w-auto"
                action={
                    <div className="flex flex-col items-start gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                        <ExternalLinkButton
                            href="https://model-monitor.pollinations.ai"
                            className="self-start sm:self-center"
                        >
                            <span className="inline-flex items-center gap-1.5">
                                <TrendUpIcon className="h-4 w-4" />
                                Model Health
                            </span>
                        </ExternalLinkButton>
                        <ExternalLinkButton
                            href="https://github.com/pollinations/pollinations/issues/5321"
                            className="self-start sm:self-center"
                        >
                            <span className="inline-flex items-center gap-1.5">
                                <GitHubIcon className="h-4 w-4" />
                                Vote for next model
                            </span>
                        </ExternalLinkButton>
                    </div>
                }
            >
                <Alert className="mb-4 shadow-well !bg-surface-opaque !text-theme-text-base">
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-theme-text-soft">
                        Upcoming change
                    </div>
                    <div className="mb-1.5 flex items-center gap-2 text-base font-bold text-theme-text-strong">
                        <BeakerIcon className="h-4 w-4 shrink-0" />
                        <span>
                            We're standardizing model IDs on September 7
                        </span>
                    </div>
                    Model IDs will use the publisher and official model name—for
                    example, <code className="font-semibold">flux</code> →{" "}
                    <code className="font-semibold">
                        black-forest-labs/flux.1-schnell
                    </code>
                    . You can use the new IDs now. Existing IDs will keep
                    working.
                    <a
                        href={MODEL_SLUG_LIST_URL}
                        className="mt-2 flex w-fit items-center gap-1.5 font-semibold text-theme-text-soft hover:text-theme-text-strong hover:underline"
                    >
                        <GitHubIcon className="h-4 w-4 shrink-0" />
                        <span>View all model ID changes →</span>
                    </a>
                </Alert>
                <div className="mb-4 flex flex-col items-start gap-3">
                    <div className="flex w-full flex-col gap-2">
                        <div className="flex flex-wrap gap-1.5">
                            {PRIMARY_TABS.map((tab) => {
                                const TabIcon = tab.Icon;
                                return (
                                    <TabButton
                                        key={tab.value}
                                        active={activePrimaryTab === tab.value}
                                        onClick={() =>
                                            setActivePrimaryTab(tab.value)
                                        }
                                        size="lg"
                                        ariaLabel={`${tab.label}, ${primaryTabCounts[tab.value]} ${tab.value === "mcp" ? "servers" : tab.value === "agent" ? "agents" : "models"}`}
                                    >
                                        <span className="inline-flex items-center gap-1.5">
                                            <TabIcon className="h-4 w-4" />
                                            {tab.label}
                                            <TabCount
                                                value={
                                                    primaryTabCounts[tab.value]
                                                }
                                            />
                                        </span>
                                    </TabButton>
                                );
                            })}
                        </div>
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
                                            onClick={() =>
                                                setActiveTab(section)
                                            }
                                            ariaLabel={`${sectionLabels[section]}, ${modelSections[section].length} models`}
                                        >
                                            <span className="inline-flex items-center gap-1.5">
                                                {sectionLabels[section]}
                                                <TabCount
                                                    value={
                                                        modelSections[section]
                                                            .length
                                                    }
                                                />
                                            </span>
                                        </TabButton>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="flex w-full flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0 max-w-md flex-1 basis-[240px]">
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
                                        if (draftFilter?.value) {
                                            setDraftFilter(undefined);
                                        }
                                        const normalizedSearch = search.trim();
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
                                    startContent={
                                        renderedFilterTokens.length === 0 &&
                                        !renderedDraftFilter ? (
                                            <SearchIcon className="pointer-events-none ml-1 mr-0.5 h-4 w-4 shrink-0 text-theme-text-muted" />
                                        ) : (
                                            <>
                                                {renderedFilterTokens.map(
                                                    (filterToken) => {
                                                        const { filter } =
                                                            filterToken;
                                                        const label =
                                                            MODEL_FILTER_LABELS[
                                                                filter.key
                                                            ];
                                                        const value =
                                                            formatFilterValue(
                                                                filter,
                                                            );

                                                        return (
                                                            <EditableComboboxToken
                                                                key={`${filterToken.index}:${filterToken.token}`}
                                                                label={label}
                                                                value={value}
                                                                highlighted={
                                                                    pendingRemovalIndex ===
                                                                    filterToken.index
                                                                }
                                                                aria-label={`Change ${label} filter: ${value}`}
                                                                onClick={() =>
                                                                    editFilter(
                                                                        filterToken,
                                                                    )
                                                                }
                                                            />
                                                        );
                                                    },
                                                )}
                                                {renderedDraftFilter && (
                                                    <div className="flex h-7 max-w-full shrink-0 items-center text-xs">
                                                        <span className="py-1 pl-1.5 pr-1 text-theme-text-muted">
                                                            {
                                                                MODEL_FILTER_LABELS[
                                                                    renderedDraftFilter
                                                                        .key
                                                                ]
                                                            }
                                                            :
                                                        </span>
                                                    </div>
                                                )}
                                            </>
                                        )
                                    }
                                />
                            </div>
                        </div>
                        {activeTab !== "mcp" && (
                            <div className="flex flex-wrap items-center gap-2">
                                <Dropdown
                                    align="end"
                                    className="w-max p-2"
                                    trigger={(open) => (
                                        <Button
                                            type="button"
                                            size="md"
                                            aria-label={`Sort models by ${activeSortAccessibleLabel}`}
                                            className="shrink-0 justify-end gap-2"
                                        >
                                            <span className="text-right">
                                                {activeSortLabel}
                                            </span>
                                            <ChevronIcon expanded={open} />
                                        </Button>
                                    )}
                                >
                                    {(close) => (
                                        <div
                                            role="menu"
                                            aria-label="Sort models"
                                            onKeyDown={handleSortMenuKeyDown}
                                            className="flex flex-col gap-1"
                                        >
                                            {SORT_OPTIONS.map((option) => (
                                                <DropdownItem
                                                    key={option.value}
                                                    role="menuitemradio"
                                                    aria-label={
                                                        option.accessibleLabel
                                                    }
                                                    aria-checked={
                                                        activeSort ===
                                                        option.value
                                                    }
                                                    onClick={() => {
                                                        setActiveSort(
                                                            option.value,
                                                        );
                                                        close();
                                                    }}
                                                    className={
                                                        activeSort ===
                                                        option.value
                                                            ? "justify-end bg-theme-bg-active text-right text-theme-text-strong"
                                                            : "justify-end text-right"
                                                    }
                                                >
                                                    <span className="flex-1 text-right">
                                                        {option.label}
                                                    </span>
                                                </DropdownItem>
                                            ))}
                                        </div>
                                    )}
                                </Dropdown>
                            </div>
                        )}
                    </div>
                </div>
                {(activePrimaryTab === "agent" ||
                    (activePrimaryTab === "models" &&
                        explicitModelSource !== "official")) && (
                    <aside
                        aria-label="Community privacy notice"
                        className="mb-4 flex items-start gap-2 rounded-lg border border-divider bg-intent-warning-bg-light/45 px-3 py-2 text-[13px] leading-snug text-theme-text-muted"
                    >
                        <WarningIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-intent-warning-text" />
                        <span className="min-w-0">
                            <strong className="font-semibold text-theme-text-strong">
                                Community privacy
                            </strong>{" "}
                            — Independent providers and configured fallbacks
                            process requests under their own policies.{" "}
                            <strong className="font-semibold text-theme-text-strong">
                                Avoid sensitive data.
                            </strong>{" "}
                            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                <InlineLink
                                    href="https://gen.pollinations.ai/docs#tag/Safety"
                                    showIcon={false}
                                >
                                    Privacy filter
                                </InlineLink>
                                <span aria-hidden="true">·</span>
                                <InlineLink
                                    href="https://pollinations.ai/privacy"
                                    showIcon={false}
                                >
                                    Privacy Policy
                                </InlineLink>
                            </span>
                        </span>
                    </aside>
                )}
                {catalogError && activeTab !== "mcp" && (
                    <Alert intent="danger" className="mb-4">
                        {catalogError}
                    </Alert>
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
                    <div className="mt-4 space-y-2 border-t border-divider pt-4 text-[13px] leading-snug text-theme-text-muted">
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
