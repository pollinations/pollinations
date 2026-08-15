import {
    Alert,
    Button,
    ChevronIcon,
    Chip,
    ClockIcon,
    Dropdown,
    DropdownItem,
    ExternalLinkButton,
    GitHubIcon,
    Input,
    SearchIcon,
    Section,
    SparklesIcon,
    TabButton,
    TokensIcon,
    TrendUpIcon,
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
import {
    type ApiModelInfo,
    fetchModelCatalog,
    getModelPricesFromCatalog,
} from "./model-catalog.ts";
import { getModelDisplayName } from "./model-info.ts";
import type { ModelScope, ModelSort } from "./model-search.ts";
import { sortModels } from "./model-sort.ts";
import {
    type SectionType,
    sectionLabels,
    UnifiedModelTable,
} from "./model-table.tsx";
import type { ModelPrice } from "./types.ts";
import { useModelStats } from "./use-model-stats.ts";

const POLLINATIONS_SECTION_ORDER: SectionType[] = [
    "all",
    "text",
    "image",
    "video",
    "3d",
    "audio",
    "realtime",
    "embedding",
];

const COMMUNITY_SECTION_ORDER: SectionType[] = [
    "all",
    "text",
    "image",
    "agent",
];
const SCOPE_ORDER: ModelScope[] = ["pollinations", "community"];

const SCOPE_LABELS: Record<ModelScope, string> = {
    pollinations: "Official",
    community: "Community",
};

const SORT_OPTIONS: Array<{
    value: ModelSort;
    label: string;
    accessibleLabel: string;
}> = [
    { value: "newest", label: "Newest", accessibleLabel: "Newest" },
    {
        value: "price-low",
        label: "Price ↑",
        accessibleLabel: "Price: Low to high",
    },
    {
        value: "price-high",
        label: "Price ↓",
        accessibleLabel: "Price: High to low",
    },
    { value: "title", label: "Title", accessibleLabel: "Title: A to Z" },
    { value: "brand", label: "Brand", accessibleLabel: "Brand: A to Z" },
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
};

function matchesQuery(model: ModelPrice, query: string): boolean {
    if (!query) return true;
    const displayName = getModelDisplayName(model) ?? "";
    const haystack = `${displayName} ${model.brand ?? ""}`.toLowerCase();
    return haystack.includes(query);
}

function categorizeModels(
    models: ModelPrice[],
): Record<SectionType, ModelPrice[]> {
    const categorized: Record<SectionType, ModelPrice[]> = {
        all: models,
        image: [],
        video: [],
        "3d": [],
        audio: [],
        realtime: [],
        text: [],
        embedding: [],
        agent: [],
    };

    for (const model of models) {
        categorized[model.agent ? "agent" : model.type].push(model);
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
    const activeScope = modelSearch.scope ?? "pollinations";
    const activeTab = modelSearch.category ?? "all";
    const activeSort = modelSearch.sort ?? "newest";
    const urlSearch = modelSearch.q ?? "";
    const [search, setSearch] = useState(urlSearch);
    const lastPushedSearchRef = useRef(urlSearch);
    const [catalogModels, setCatalogModels] = useState<ApiModelInfo[]>([]);
    const [catalogError, setCatalogError] = useState<string | null>(null);
    const { stats } = useModelStats();
    const allModels = useMemo(
        () => getModelPricesFromCatalog(catalogModels, stats),
        [catalogModels, stats],
    );
    const query = search.trim().toLowerCase();
    const scopedModels = useMemo(
        () =>
            allModels.filter(
                (model) =>
                    Boolean(model.community) === (activeScope === "community"),
            ),
        [activeScope, allModels],
    );
    const filteredModels = useMemo(
        () =>
            query
                ? scopedModels.filter((model) => matchesQuery(model, query))
                : scopedModels,
        [query, scopedModels],
    );

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
    const sectionOrder =
        activeScope === "community"
            ? COMMUNITY_SECTION_ORDER
            : POLLINATIONS_SECTION_ORDER;
    const scopeLabel = SCOPE_LABELS[activeScope];
    const searchLabel = SEARCH_LABELS[activeTab];
    const searchTarget =
        activeTab === "all"
            ? `${scopeLabel} models`
            : `${scopeLabel} ${searchLabel} models`;

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

    const setActiveScope = (scope: ModelScope) => {
        void navigate({
            search: (previous) => ({
                ...previous,
                scope: scope === "pollinations" ? undefined : scope,
                category:
                    scope === "community"
                        ? previous.category === "text" ||
                          previous.category === "image" ||
                          previous.category === "agent"
                            ? previous.category
                            : undefined
                        : previous.category === "agent"
                          ? undefined
                          : previous.category,
            }),
        });
    };

    const setActiveSort = (sort: ModelSort) => {
        void navigate({
            search: (previous) => ({
                ...previous,
                sort: sort === "newest" ? undefined : sort,
            }),
        });
    };

    const activeSortLabel =
        SORT_OPTIONS.find(({ value }) => value === activeSort)?.label ??
        "Newest";
    const activeSortAccessibleLabel =
        SORT_OPTIONS.find(({ value }) => value === activeSort)
            ?.accessibleLabel ?? "Newest";

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
                <div className="mb-4 flex flex-col items-start gap-3">
                    <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap gap-1.5">
                            {SCOPE_ORDER.map((scope) => (
                                <TabButton
                                    key={scope}
                                    active={activeScope === scope}
                                    onClick={() => setActiveScope(scope)}
                                    size="lg"
                                    ariaLabel={
                                        scope === "community"
                                            ? "Community alpha models"
                                            : undefined
                                    }
                                >
                                    <span className="inline-flex items-center gap-1.5">
                                        {SCOPE_LABELS[scope]}
                                        {scope === "community" && (
                                            <Chip intent="alpha" size="sm">
                                                Alpha
                                            </Chip>
                                        )}
                                    </span>
                                </TabButton>
                            ))}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {sectionOrder.map((section) => (
                                <TabButton
                                    key={section}
                                    active={activeTab === section}
                                    onClick={() => setActiveTab(section)}
                                >
                                    {sectionLabels[section]}
                                </TabButton>
                            ))}
                        </div>
                    </div>
                    <div className="flex w-full items-center justify-between gap-2">
                        <div className="relative min-w-0 max-w-md flex-1">
                            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-theme-text-muted" />
                            <Input
                                type="search"
                                value={search}
                                onChange={(event) =>
                                    setSearch(event.target.value)
                                }
                                onBlur={() => {
                                    const normalizedSearch = search.trim();
                                    setSearch(normalizedSearch);
                                    pushSearch(normalizedSearch);
                                }}
                                placeholder={`Search ${searchTarget}…`}
                                aria-label={`Search ${searchTarget}`}
                                className="w-full pl-9"
                            />
                        </div>
                        <Dropdown
                            align="end"
                            className="w-max p-2"
                            trigger={(open) => (
                                <Button
                                    type="button"
                                    aria-label={`Sort models by ${activeSortAccessibleLabel}`}
                                    className="h-[42px] shrink-0 justify-end gap-2 px-3 text-sm"
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
                                            aria-label={option.accessibleLabel}
                                            aria-checked={
                                                activeSort === option.value
                                            }
                                            onClick={() => {
                                                setActiveSort(option.value);
                                                close();
                                            }}
                                            className={
                                                activeSort === option.value
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
                </div>
                {catalogError && (
                    <Alert intent="danger" className="mb-4">
                        {catalogError}
                    </Alert>
                )}
                {query && sectionModels[activeTab].length === 0 ? (
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
                <div className="mt-4 space-y-2 border-t border-divider pt-4 text-[13px] leading-snug text-theme-text-muted">
                    <p className="flex items-start gap-1.5">
                        <SparklesIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>
                            <strong>/gen</strong> — flat rate per image or audio
                            generation.
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
                            <strong>/sec</strong> — per second of video/audio;
                            TTS is estimated from text length.
                        </span>
                    </p>
                    <p className="flex items-start gap-1.5">
                        <UsageIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>
                            <strong>gen /pollen</strong> — how many generations
                            you can make with 1 Pollen, estimated from average
                            usage over the last 7 days.
                        </span>
                    </p>
                </div>
            </Section>
        </div>
    );
};
