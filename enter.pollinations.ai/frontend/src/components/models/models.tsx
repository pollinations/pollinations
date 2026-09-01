import {
    Alert,
    BeakerIcon,
    BotIcon,
    Button,
    ChevronIcon,
    Chip,
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
import { McpServerList } from "./mcp-server-list.tsx";
import {
    type ApiModelInfo,
    fetchModelCatalog,
    getModelPricesFromCatalog,
} from "./model-catalog.ts";
import {
    getModelQuerySuggestions,
    matchesModelQuery,
    parseModelQuery,
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

export const Models: FC = () => {
    const navigate = useNavigate({ from: "/models" });
    const modelSearch = useSearch({ from: "/_dashboard/models" });
    const activeScope = modelSearch.scope ?? "community";
    const activeTab = modelSearch.category ?? "all";
    const activePrimaryTab: PrimaryTab =
        activeTab === "agent"
            ? "agent"
            : activeTab === "mcp"
              ? "mcp"
              : "models";
    const includeCommunity = activeScope === "community";
    const activeSort = modelSearch.sort ?? "popular";
    const urlSearch = modelSearch.q ?? "";
    const [search, setSearch] = useState(urlSearch);
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
    const query = search.trim();
    const parsedQuery = useMemo(() => parseModelQuery(query), [query]);
    const visibleModels = useMemo(
        () =>
            allModels.filter(
                (model) =>
                    activePrimaryTab === "agent" ||
                    includeCommunity ||
                    !model.community,
            ),
        [activePrimaryTab, allModels, includeCommunity],
    );
    const filteredModels = useMemo(
        () =>
            query
                ? visibleModels.filter((model) =>
                      matchesModelQuery(model, parsedQuery),
                  )
                : visibleModels,
        [parsedQuery, query, visibleModels],
    );
    const searchOptions = useMemo(
        () =>
            activeTab === "mcp"
                ? []
                : getModelQuerySuggestions(search, visibleModels),
        [activeTab, search, visibleModels],
    );

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
                ? includeCommunity
                    ? "models"
                    : "official models"
                : `${includeCommunity ? "" : "official "}${searchLabel} models`;

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

    useEffect(() => {
        if (urlSearch === lastPushedSearchRef.current) return;

        lastPushedSearchRef.current = urlSearch;
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

    const setIncludeCommunity = (include: boolean) => {
        void navigate({
            search: (previous) => ({
                ...previous,
                scope: include ? undefined : "pollinations",
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
                                    >
                                        <span className="inline-flex items-center gap-1.5">
                                            <TabIcon className="h-4 w-4" />
                                            {tab.label}
                                        </span>
                                    </TabButton>
                                );
                            })}
                        </div>
                        {activePrimaryTab === "models" && (
                            <div className="flex w-full flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap gap-1.5">
                                    {MODEL_SECTION_ORDER.map((section) => (
                                        <TabButton
                                            key={section}
                                            active={activeTab === section}
                                            onClick={() =>
                                                setActiveTab(section)
                                            }
                                        >
                                            {sectionLabels[section]}
                                        </TabButton>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="flex w-full flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0 max-w-md flex-1 basis-[240px]">
                            <div className="relative">
                                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-theme-text-muted" />
                                <EditableCombobox
                                    value={search}
                                    options={searchOptions}
                                    onChange={setSearch}
                                    open={searchOpen}
                                    onOpenChange={setSearchOpen}
                                    onFocus={() => setSearchFocused(true)}
                                    onBlur={() => {
                                        setSearchFocused(false);
                                        const normalizedSearch = search.trim();
                                        setSearch(normalizedSearch);
                                        pushSearch(normalizedSearch);
                                    }}
                                    placeholder={`Search ${searchTarget}…`}
                                    aria-label={`Search ${searchTarget}`}
                                    autoComplete="off"
                                    className="pl-9"
                                />
                            </div>
                        </div>
                        {activeTab !== "mcp" && (
                            <div className="flex flex-wrap items-center gap-2">
                                <TabButton
                                    active={
                                        activePrimaryTab === "agent" ||
                                        includeCommunity
                                    }
                                    onClick={() =>
                                        setIncludeCommunity(!includeCommunity)
                                    }
                                    disabled={activePrimaryTab === "agent"}
                                    size="md"
                                    ariaLabel={
                                        activePrimaryTab === "agent"
                                            ? "All agents are community models for now"
                                            : includeCommunity
                                              ? "Hide community models"
                                              : "Show community models"
                                    }
                                >
                                    <span className="inline-flex items-center gap-1.5">
                                        Community
                                        <Chip intent="alpha" size="sm">
                                            Alpha
                                        </Chip>
                                    </span>
                                </TabButton>
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
                {(activePrimaryTab === "agent" || includeCommunity) && (
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
                        No {searchTarget.toLowerCase()} match “{search.trim()}”.
                    </p>
                ) : (
                    <div className="overflow-x-auto md:overflow-visible [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                        <UnifiedModelTable
                            listKey={`${activeScope}:${activeTab}:${query}:${activeSort}`}
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
