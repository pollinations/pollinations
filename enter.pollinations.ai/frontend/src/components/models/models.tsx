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
    XIcon,
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
    getExplicitModelQuerySource,
    getModelQueryDraftFilter,
    getModelQueryFilterTokens,
    getModelQuerySource,
    getModelQuerySuggestions,
    type ModelQueryDraftFilter,
    type ModelQueryFilter,
    type ModelQueryFilterToken,
    type ModelSource,
    matchesModelQuery,
    parseModelQuery,
    removeModelQueryFilterToken,
    removeModelQuerySource,
    replaceModelQueryFilterToken,
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
        label: "Popular",
        accessibleLabel: "Most popular",
    },
    {
        value: "newest",
        label: "Date added",
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
    const urlSearch = modelSearch.q ?? "";
    const [search, setSearch] = useState(urlSearch);
    const [draftFilter, setDraftFilter] = useState<
        ModelQueryDraftFilter | undefined
    >(() => getModelQueryDraftFilter(urlSearch));
    const [searchFocused, setSearchFocused] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const lastPushedSearchRef = useRef(urlSearch);
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
        () => getModelQueryFilterTokens(search),
        [search],
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
    const parsedQuery = useMemo(() => parseModelQuery(query), [query]);
    const explicitModelSource = getExplicitModelQuerySource(parsedQuery);
    const modelSource = getModelQuerySource(parsedQuery);
    const visibleSearch = getVisibleSearch(search, filterTokens, draftFilter);
    const supportsSourceFilter = activePrimaryTab === "models";
    const renderedFilterTokens = useMemo(
        () =>
            activePrimaryTab === "mcp"
                ? []
                : filterTokens.filter(
                      ({ filter }) =>
                          filter.key !== "source" || supportsSourceFilter,
                  ),
        [activePrimaryTab, filterTokens, supportsSourceFilter],
    );
    const renderedDraftFilter =
        activePrimaryTab !== "mcp" &&
        draftFilter &&
        (draftFilter.key !== "source" || supportsSourceFilter)
            ? draftFilter
            : undefined;
    const effectiveQuery =
        activePrimaryTab === "mcp"
            ? visibleSearch.trim()
            : supportsSourceFilter
              ? query
              : removeModelQuerySource(query).trim();
    const effectiveParsedQuery = useMemo(
        () => parseModelQuery(effectiveQuery),
        [effectiveQuery],
    );
    const modelModels = useMemo(
        () =>
            allModels.filter(
                (model) =>
                    !model.agent &&
                    Boolean(model.community) === (modelSource === "community"),
            ),
        [allModels, modelSource],
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
            effectiveQuery
                ? activeTabModels.filter((model) =>
                      matchesModelQuery(model, effectiveParsedQuery),
                  )
                : activeTabModels,
        [activeTabModels, effectiveParsedQuery, effectiveQuery],
    );
    const searchOptions = useMemo(() => {
        if (activeTab === "mcp") return [];
        let options = getModelQuerySuggestions(
            draftFilter ? search : visibleSearch,
            activeTabModels,
        );
        if (!supportsSourceFilter || explicitModelSource) {
            options = options.filter((option) => !isSourceSuggestion(option));
        }
        return draftFilter ? options.map(getDraftSuggestionValue) : options;
    }, [
        activeTab,
        activeTabModels,
        draftFilter,
        explicitModelSource,
        search,
        supportsSourceFilter,
        visibleSearch,
    ]);

    useEffect(() => {
        setSearchOpen(searchFocused && searchOptions.length > 0);
    }, [searchFocused, searchOptions]);

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
                ? `${modelSource} models`
                : `${modelSource} ${searchLabel} models`;

    const pushSearch = useCallback(
        (nextSearch: string) => {
            const normalizedSearch = nextSearch.trim();
            if (normalizedSearch === lastPushedSearchRef.current) return;

            lastPushedSearchRef.current = normalizedSearch;
            void navigate({
                search: (previous) => ({
                    ...previous,
                    q: normalizedSearch || undefined,
                }),
                replace: true,
            });
        },
        [navigate],
    );

    const setVisibleSearch = (nextSearch: string) => {
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
                : getModelQueryDraftFilter(nextQuery, true),
        );
        setSearch(nextQuery);
    };

    const removeFilter = (filterToken: ModelQueryFilterToken) => {
        setDraftFilter(undefined);
        setSearch(removeModelQueryFilterToken(search, filterToken.index));
    };

    const removeDraftFilter = () => {
        if (!draftFilter) return;
        setSearch(removeModelQueryFilterToken(search, draftFilter.index));
        setDraftFilter(undefined);
    };

    const setSourceFilter = (
        filterToken: ModelQueryFilterToken,
        source: ModelSource,
    ) => {
        setDraftFilter(undefined);
        setSearch(
            replaceModelQueryFilterToken(search, filterToken.index, {
                key: "source",
                value: source,
            }),
        );
    };

    useEffect(() => {
        if (urlSearch === lastPushedSearchRef.current) return;

        lastPushedSearchRef.current = urlSearch;
        setDraftFilter(getModelQueryDraftFilter(urlSearch));
        setSearch(urlSearch);
    }, [urlSearch]);

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
        "Popular";
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
                                    key={
                                        [
                                            ...filterTokens.map(
                                                ({ token }) => token,
                                            ),
                                            renderedDraftFilter
                                                ? `draft:${renderedDraftFilter.key}`
                                                : "",
                                        ]
                                            .filter(Boolean)
                                            .join("|") || "default"
                                    }
                                    value={visibleSearch}
                                    options={searchOptions}
                                    onChange={setVisibleSearch}
                                    open={searchOpen}
                                    onOpenChange={setSearchOpen}
                                    onFocus={() => setSearchFocused(true)}
                                    onBlur={() => {
                                        setSearchFocused(false);
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
                                                        const removeButton = (
                                                            <button
                                                                type="button"
                                                                aria-label={`Remove ${label} filter: ${value}`}
                                                                className="polli-control flex self-stretch items-center rounded-r-lg border-l border-divider px-1.5 text-theme-text-muted transition-colors hover:bg-theme-bg-hover hover:text-theme-text-strong"
                                                                onClick={() =>
                                                                    removeFilter(
                                                                        filterToken,
                                                                    )
                                                                }
                                                            >
                                                                <XIcon className="h-3 w-3" />
                                                            </button>
                                                        );

                                                        return (
                                                            <div
                                                                key={`${filterToken.index}:${filterToken.token}`}
                                                                className="flex h-7 max-w-full shrink-0 items-center rounded-lg bg-theme-bg-active text-xs font-medium text-theme-text-strong shadow-sm"
                                                            >
                                                                {filter.key ===
                                                                "source" ? (
                                                                    <Dropdown
                                                                        align="start"
                                                                        className="w-max p-1"
                                                                        trigger={(
                                                                            open,
                                                                        ) => (
                                                                            <button
                                                                                type="button"
                                                                                aria-label={`Source filter: ${filter.value}`}
                                                                                className="polli-control flex h-full min-w-0 items-center gap-1 rounded-l-lg px-2 transition-colors hover:bg-theme-bg-hover"
                                                                            >
                                                                                <span className="text-theme-text-muted">
                                                                                    Source:
                                                                                </span>
                                                                                <span className="truncate capitalize">
                                                                                    {
                                                                                        filter.value
                                                                                    }
                                                                                </span>
                                                                                <ChevronIcon
                                                                                    expanded={
                                                                                        open
                                                                                    }
                                                                                    className="h-3 w-3 shrink-0"
                                                                                />
                                                                            </button>
                                                                        )}
                                                                    >
                                                                        {(
                                                                            close,
                                                                        ) => (
                                                                            <div
                                                                                role="menu"
                                                                                aria-label="Model source"
                                                                                onKeyDown={
                                                                                    handleSortMenuKeyDown
                                                                                }
                                                                            >
                                                                                {(
                                                                                    [
                                                                                        "official",
                                                                                        "community",
                                                                                    ] as const
                                                                                ).map(
                                                                                    (
                                                                                        source,
                                                                                    ) => (
                                                                                        <DropdownItem
                                                                                            key={
                                                                                                source
                                                                                            }
                                                                                            role="menuitemradio"
                                                                                            aria-checked={
                                                                                                filter.value ===
                                                                                                source
                                                                                            }
                                                                                            className="capitalize"
                                                                                            onClick={() => {
                                                                                                setSourceFilter(
                                                                                                    filterToken,
                                                                                                    source,
                                                                                                );
                                                                                                close();
                                                                                            }}
                                                                                        >
                                                                                            {
                                                                                                source
                                                                                            }
                                                                                        </DropdownItem>
                                                                                    ),
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                    </Dropdown>
                                                                ) : (
                                                                    <span className="flex min-w-0 items-center gap-1 px-2">
                                                                        <span className="text-theme-text-muted">
                                                                            {
                                                                                label
                                                                            }
                                                                            :
                                                                        </span>
                                                                        <span className="truncate">
                                                                            {
                                                                                value
                                                                            }
                                                                        </span>
                                                                    </span>
                                                                )}
                                                                {removeButton}
                                                            </div>
                                                        );
                                                    },
                                                )}
                                                {renderedDraftFilter && (
                                                    <div className="flex h-7 max-w-full shrink-0 items-center rounded-lg bg-theme-bg-active text-xs font-medium text-theme-text-strong shadow-sm">
                                                        <span className="px-2 text-theme-text-muted">
                                                            {
                                                                MODEL_FILTER_LABELS[
                                                                    renderedDraftFilter
                                                                        .key
                                                                ]
                                                            }
                                                            :
                                                        </span>
                                                        <button
                                                            type="button"
                                                            aria-label={`Remove ${MODEL_FILTER_LABELS[renderedDraftFilter.key]} filter`}
                                                            className="polli-control flex self-stretch items-center rounded-r-lg border-l border-divider px-1.5 text-theme-text-muted transition-colors hover:bg-theme-bg-hover hover:text-theme-text-strong"
                                                            onClick={
                                                                removeDraftFilter
                                                            }
                                                        >
                                                            <XIcon className="h-3 w-3" />
                                                        </button>
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
                    modelSource === "community") && (
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
                    <McpServerList query={effectiveQuery} />
                ) : effectiveQuery && sectionModels[activeTab].length === 0 ? (
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
                            listKey={`${modelSource}:${activeTab}:${query}:${activeSort}`}
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
