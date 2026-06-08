import { type ModelCatalogItem, pricingEntries } from "@pollinations/sdk";
import {
    PolliProvider,
    useAccountKey,
    useAccountKeyUsage,
    useAccountProfile,
    useAuthActions,
    useModelCatalog,
} from "@pollinations/sdk/react";
import {
    Alert,
    AppHeader,
    AppIcon,
    BeakerIcon,
    BookIcon,
    Button,
    ButtonGroup,
    CheckIcon,
    ChevronIcon,
    Chip,
    ClipboardIcon,
    ClockIcon,
    CodeBlock,
    Collapsible,
    ColorModeToggle,
    CopyButton,
    currentPeriod,
    Dialog,
    DiscordIcon,
    DownloadIcon,
    Dropdown,
    DropdownItem,
    ExternalLinkButton,
    ExternalLinkIcon,
    Field,
    FileUpload,
    GenApiIcon,
    GitHubIcon,
    Heading,
    IconButton,
    ImageIcon,
    InfoTip,
    InlineLink,
    Input,
    LinkCard,
    LockIcon,
    MailIcon,
    Markdown,
    McpIcon,
    MediaPlaceholder,
    MenuIcon,
    MultiSelect,
    NavItem,
    PeriodPicker,
    type PeriodSelection,
    Prose,
    ScrollArea,
    Section,
    Slider,
    StatCard,
    Surface,
    Switch,
    TabButton,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
    TerminalIcon,
    Text,
    Textarea,
    TokensIcon,
    Tooltip,
    TrendUpIcon,
    useColorMode,
    WalletIcon,
    XIcon,
} from "@pollinations/ui";
import { AppUserMenu } from "@pollinations/ui/app-user-menu/sdk";
import {
    categoryLabel,
    ModalityChip,
    ModalityDot,
    ModalityTab,
    ModelSelector,
    type ModelSelectorCategory,
} from "@pollinations/ui/gen";
import {
    lazy,
    type ReactNode,
    type RefObject,
    Suspense,
    useEffect,
    useRef,
    useState,
} from "react";

// Publishable key for this showcase (pk_* is safe to commit).
// Created via `polli keys create --type publishable` with redirect URIs
// http://localhost:5173 and https://react.pollinations.ai.
const APP_KEY = "pk_kZRl8saq8s2h9ome";
// Point the catalog at a local gen worker in dev (VITE_GEN_BASE_URL=http://localhost:8788).
// Unset falls back to the SDK default (production gen.pollinations.ai).
const GEN_BASE_URL = import.meta.env.VITE_GEN_BASE_URL || undefined;

const DesignShowcase = lazy(() =>
    import("./showcase/DesignShowcase").then((module) => ({
        default: module.DesignShowcase,
    })),
);

type PublicAppView = "primitives" | "compositions" | "modules" | "colors";
type AppView = PublicAppView | "showcase";

const PUBLIC_VIEWS: { id: PublicAppView; label: string }[] = [
    { id: "primitives", label: "Primitives" },
    { id: "compositions", label: "Compositions" },
    { id: "modules", label: "Modules" },
    { id: "colors", label: "Colors" },
];

function readAppView(): AppView {
    if (typeof window === "undefined") return "primitives";
    const view = new URLSearchParams(window.location.search).get("view");
    if (view === "showcase") return "showcase";
    if (
        view === "primitives" ||
        view === "compositions" ||
        view === "modules" ||
        view === "colors"
    ) {
        return view;
    }
    if (view === "models" || view === "react") {
        return "modules";
    }
    return "primitives";
}

function useAppView() {
    const [activeView, setActiveView] = useState<AppView>(readAppView);

    useEffect(() => {
        const handlePopState = () => setActiveView(readAppView());
        window.addEventListener("popstate", handlePopState);
        return () => window.removeEventListener("popstate", handlePopState);
    }, []);

    const selectView = (view: AppView) => {
        const url = new URL(window.location.href);
        if (view === "primitives") {
            url.searchParams.delete("view");
        } else {
            url.searchParams.set("view", view);
        }
        url.hash = "";
        window.history.pushState(null, "", url);
        setActiveView(view);
    };

    return { activeView, selectView };
}

function ShellHeader({
    activeView,
    onSelectView,
    scrollTargetRef,
}: {
    activeView: AppView;
    onSelectView: (view: AppView) => void;
    scrollTargetRef?: RefObject<HTMLElement | null>;
}) {
    return (
        <AppHeader
            navLabel="React app views"
            autoHide
            scrollTargetRef={scrollTargetRef}
        >
            {PUBLIC_VIEWS.map((view) => (
                <TabButton
                    key={view.id}
                    active={activeView === view.id}
                    onClick={() => onSelectView(view.id)}
                >
                    {view.label}
                </TabButton>
            ))}
            <ColorModeToggle />
        </AppHeader>
    );
}

function AppShell({
    activeView,
    onSelectView,
}: {
    activeView: AppView;
    onSelectView: (view: AppView) => void;
}) {
    const scrollTargetRef = useRef<HTMLDivElement | null>(null);

    return (
        <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-app-bg text-theme-text-strong">
            <ScrollArea
                ref={scrollTargetRef}
                axis="y"
                className="min-h-0 flex-1"
            >
                <ShellHeader
                    activeView={activeView}
                    onSelectView={onSelectView}
                    scrollTargetRef={scrollTargetRef}
                />
                <main className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-4 py-8 sm:px-6 sm:py-10">
                    {activeView === "primitives" ? (
                        <PrimitivesPage />
                    ) : activeView === "compositions" ? (
                        <CompositionsPage />
                    ) : activeView === "modules" ? (
                        <ModulesPage />
                    ) : activeView === "colors" ? (
                        <ColorsPage />
                    ) : null}
                </main>
            </ScrollArea>
        </div>
    );
}

// Short intro at the top of each page. No title — the header tabs already say
// which layer you're on; this just explains what that layer is.
function PageIntro({ children }: { children: ReactNode }) {
    return (
        <section className="border-b border-theme-border pb-7">
            <p className="max-w-3xl text-base leading-7 text-theme-text-base">
                {children}
            </p>
        </section>
    );
}

function SectionHeader({
    title,
    children,
}: {
    title: string;
    children?: ReactNode;
}) {
    return (
        <div className="mb-4 flex max-w-3xl flex-col gap-1">
            <h2 className="font-serif text-2xl font-black text-theme-text-strong">
                {title}
            </h2>
            {children ? (
                <p className="text-sm leading-6 text-theme-text-soft">
                    {children}
                </p>
            ) : null}
        </div>
    );
}

function AccountSummaryItem({
    label,
    children,
}: {
    label: string;
    children: ReactNode;
}) {
    return (
        <div className="grid min-w-0 gap-1 rounded-lg bg-theme-bg-pale px-3 py-2 sm:grid-cols-[6rem_minmax(0,1fr)] sm:items-center">
            <Text
                as="span"
                size="micro"
                tone="muted"
                weight="bold"
                className="shrink-0"
            >
                {label}
            </Text>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:justify-end">
                {children}
            </div>
        </div>
    );
}

function AccountSummaryText({
    value,
    isLoading,
    fallback = "Not shared",
}: {
    value: string | null | undefined;
    isLoading?: boolean;
    fallback?: string;
}) {
    return (
        <span className="min-w-0 truncate text-sm font-medium text-theme-text-base">
            {isLoading ? "Loading..." : value || fallback}
        </span>
    );
}

function formatPollenAmount(value: number | null | undefined): string {
    if (value == null) return "No cap";
    return `${value.toLocaleString(undefined, {
        maximumFractionDigits: 4,
    })} pollen`;
}

function formatUsageCount(count: number | null | undefined): string {
    if (count == null) return "No usage";
    return `${count.toLocaleString()} request${count === 1 ? "" : "s"} / 30d`;
}

function formatExpiry(value: string | null | undefined): string {
    if (!value) return "No expiry";
    return value.slice(0, 10);
}

function ModelCountChips({
    counts,
    isLoading,
}: {
    counts: readonly { category: ModelSelectorCategory; count: number }[];
    isLoading: boolean;
}) {
    if (isLoading) {
        return (
            <Chip intent="neutral" size="sm">
                Loading
            </Chip>
        );
    }
    if (!counts.length) {
        return (
            <Chip intent="neutral" size="sm">
                No model
            </Chip>
        );
    }
    return counts.map(({ category, count }) => (
        <Chip key={category} size="sm">
            <span className="inline-flex items-center gap-1.5">
                <ModalityDot modality={category} />
                {categoryLabel(category)} {count}
            </span>
        </Chip>
    ));
}

function formatList(values: readonly string[] | undefined): string {
    return values?.length ? values.join(", ") : "Not listed";
}

function formatModelLimit(model: ModelCatalogItem | undefined): string {
    if (model?.contextLength) {
        return `${model.contextLength.toLocaleString()} context`;
    }
    return "Not listed";
}

function formatPricing(model: ModelCatalogItem | undefined): string {
    const entries = pricingEntries(model?.pricing);
    if (!entries.length) return "Not listed";

    return entries
        .map(([label, value]) => `${label}: ${value} pollen`)
        .join(", ");
}

function selectedCatalogModel(
    models: readonly ModelCatalogItem[],
    category: ModelSelectorCategory,
    selectedModelId: string | undefined,
): ModelCatalogItem | undefined {
    return (
        (selectedModelId
            ? models.find((model) => model.id === selectedModelId)
            : undefined) ?? models.find((model) => model.category === category)
    );
}

function ModulesPage() {
    const {
        models,
        allowedModelIds,
        allowedCategories,
        isLoggedIn,
        isLoading,
        error,
    } = useModelCatalog({
        baseUrl: GEN_BASE_URL,
    });
    const { enterUrl } = useAuthActions();
    const profile = useAccountProfile({ enabled: isLoggedIn });
    const accountKey = useAccountKey({ enabled: isLoggedIn });
    const keyUsage = useAccountKeyUsage({
        enabled: isLoggedIn,
        days: 30,
        limit: 1,
    });
    const [category, setCategory] = useState<ModelSelectorCategory | null>(
        null,
    );
    const [selectedByCategory, setSelectedByCategory] = useState<
        Partial<Record<ModelSelectorCategory, string>>
    >({});
    // Categories come only from the catalog the key can actually see. No
    // hardcoded fallback list — an empty catalog renders an empty state.
    const categories = allowedCategories;
    const activeCategory =
        category && categories.includes(category) ? category : categories[0];
    const visibleModels = isLoggedIn
        ? models.filter((model) => allowedModelIds.has(model.id))
        : models;
    const selectedModel = activeCategory
        ? selectedCatalogModel(
              visibleModels,
              activeCategory,
              selectedByCategory[activeCategory],
          )
        : undefined;
    const selectedModelId = selectedModel?.id ?? "";
    const selectedModelAccess = !isLoggedIn
        ? "Public catalog"
        : selectedModel && allowedModelIds.has(selectedModel.id)
          ? "Allowed by key"
          : "Not allowed";
    const modelCounts = categories
        .map((item) => ({
            category: item,
            count: visibleModels.filter((model) => model.category === item)
                .length,
        }))
        .filter(({ count }) => count > 0);

    return (
        <>
            <PageIntro>
                Modules are domain features wired to the SDK and live data —
                authentication, model selection, wallet — assembled from
                primitives and compositions.
            </PageIntro>

            <section>
                <SectionHeader title="Auth" />
                <Surface
                    variant="panel"
                    className="flex flex-col items-start gap-5"
                >
                    <div className="flex flex-wrap items-center gap-3">
                        <AppUserMenu dashboardHref={enterUrl} />
                        {!isLoggedIn ? (
                            <span className="text-sm font-medium text-intent-danger-text">
                                Authorize the app to load your account and
                                per-key access.
                            </span>
                        ) : null}
                    </div>
                    <div className="flex w-full flex-col gap-5">
                        <div className="w-full">
                            <Text as="h3" size="sm" weight="bold">
                                Account
                            </Text>
                            <div className="mt-2 grid w-full gap-2 lg:grid-cols-2">
                                <AccountSummaryItem label="GitHub Username">
                                    <AccountSummaryText
                                        value={
                                            isLoggedIn
                                                ? (profile.data
                                                      ?.githubUsername ?? null)
                                                : "—"
                                        }
                                        isLoading={profile.isLoading}
                                        fallback="Not available"
                                    />
                                </AccountSummaryItem>
                                <AccountSummaryItem label="GitHub Name">
                                    <AccountSummaryText
                                        value={
                                            isLoggedIn
                                                ? profile.data?.name
                                                : "—"
                                        }
                                        isLoading={profile.isLoading}
                                    />
                                </AccountSummaryItem>
                                <AccountSummaryItem label="Email">
                                    <AccountSummaryText
                                        value={
                                            isLoggedIn
                                                ? profile.data?.email
                                                : "—"
                                        }
                                        isLoading={profile.isLoading}
                                    />
                                </AccountSummaryItem>
                            </div>
                        </div>

                        <div className="w-full">
                            <Text as="h3" size="sm" weight="bold">
                                App access (per key)
                            </Text>
                            <div className="mt-2 grid w-full gap-2 lg:grid-cols-2">
                                <AccountSummaryItem label="Key budget">
                                    <AccountSummaryText
                                        value={
                                            isLoggedIn
                                                ? formatPollenAmount(
                                                      accountKey.data
                                                          ?.pollenBudget,
                                                  )
                                                : "—"
                                        }
                                        isLoading={accountKey.isLoading}
                                        fallback="No cap"
                                    />
                                </AccountSummaryItem>
                                <AccountSummaryItem label="Key expires">
                                    <AccountSummaryText
                                        value={
                                            isLoggedIn
                                                ? formatExpiry(
                                                      accountKey.data
                                                          ?.expiresAt,
                                                  )
                                                : "—"
                                        }
                                        isLoading={accountKey.isLoading}
                                        fallback="No expiry"
                                    />
                                </AccountSummaryItem>
                                <AccountSummaryItem label="Usage">
                                    <AccountSummaryText
                                        value={
                                            isLoggedIn
                                                ? formatUsageCount(
                                                      keyUsage.data?.count,
                                                  )
                                                : "—"
                                        }
                                        isLoading={keyUsage.isLoading}
                                    />
                                </AccountSummaryItem>
                                <AccountSummaryItem label="Models and Modalities">
                                    {isLoggedIn ? (
                                        <ModelCountChips
                                            counts={modelCounts}
                                            isLoading={isLoading}
                                        />
                                    ) : (
                                        <AccountSummaryText value="—" />
                                    )}
                                </AccountSummaryItem>
                                <AccountSummaryItem label="App Earnings">
                                    {isLoggedIn ? (
                                        <Chip intent="success" size="sm">
                                            20% of pollen spent in-app
                                        </Chip>
                                    ) : (
                                        <AccountSummaryText value="—" />
                                    )}
                                </AccountSummaryItem>
                            </div>
                        </div>
                    </div>
                </Surface>
            </section>

            {activeCategory ? (
                <>
                    <section>
                        <SectionHeader title="Gen" />
                        <Surface
                            variant="panel"
                            className="flex flex-col gap-5"
                        >
                            <div className="w-full">
                                <Text as="h3" size="sm" weight="bold">
                                    Modality
                                </Text>
                                <div className="mt-2 grid w-full gap-2 lg:grid-cols-2">
                                    <AccountSummaryItem label="Category">
                                        <ButtonGroup aria-label="Modality">
                                            {categories.map((item) => (
                                                <ModalityTab
                                                    key={item}
                                                    modality={item}
                                                    active={
                                                        activeCategory === item
                                                    }
                                                    onClick={() =>
                                                        setCategory(item)
                                                    }
                                                >
                                                    {categoryLabel(item)}
                                                </ModalityTab>
                                            ))}
                                        </ButtonGroup>
                                    </AccountSummaryItem>
                                </div>
                            </div>

                            <div className="w-full">
                                <Text as="h3" size="sm" weight="bold">
                                    Models
                                </Text>
                                <div className="mt-2 grid w-full gap-2 lg:grid-cols-2">
                                    <AccountSummaryItem label="Model">
                                        <ModelSelector
                                            models={visibleModels}
                                            category={activeCategory}
                                            value={selectedModelId}
                                            isLoading={isLoading}
                                            onChange={(modelId) =>
                                                setSelectedByCategory(
                                                    (current) => ({
                                                        ...current,
                                                        [activeCategory]:
                                                            modelId,
                                                    }),
                                                )
                                            }
                                        />
                                    </AccountSummaryItem>
                                    {selectedModel ? (
                                        <>
                                            <AccountSummaryItem label="Brand">
                                                <span className="text-sm text-theme-text-base sm:text-right">
                                                    {selectedModel.brand ??
                                                        "Not listed"}
                                                </span>
                                            </AccountSummaryItem>
                                            <AccountSummaryItem label="Description">
                                                <span className="text-sm text-theme-text-base sm:text-right">
                                                    {selectedModel.description ??
                                                        "Not listed"}
                                                </span>
                                            </AccountSummaryItem>
                                            <AccountSummaryItem label="ID">
                                                <span className="min-w-0 break-all font-mono text-sm text-theme-text-base sm:text-right">
                                                    {selectedModel.id}
                                                </span>
                                            </AccountSummaryItem>
                                            <AccountSummaryItem label="Input">
                                                <span className="text-sm text-theme-text-base sm:text-right">
                                                    {formatList(
                                                        selectedModel.inputModalities,
                                                    )}
                                                </span>
                                            </AccountSummaryItem>
                                            <AccountSummaryItem label="Output">
                                                <span className="text-sm text-theme-text-base sm:text-right">
                                                    {formatList(
                                                        selectedModel.outputModalities,
                                                    )}
                                                </span>
                                            </AccountSummaryItem>
                                            <AccountSummaryItem label="Limit">
                                                <span className="text-sm text-theme-text-base sm:text-right">
                                                    {formatModelLimit(
                                                        selectedModel,
                                                    )}
                                                </span>
                                            </AccountSummaryItem>
                                            <AccountSummaryItem label="Access">
                                                <Chip
                                                    intent={
                                                        selectedModelAccess ===
                                                        "Not allowed"
                                                            ? "warning"
                                                            : "success"
                                                    }
                                                    size="sm"
                                                >
                                                    {selectedModelAccess}
                                                </Chip>
                                                {selectedModel.paidOnly ? (
                                                    <Chip size="sm">paid</Chip>
                                                ) : null}
                                            </AccountSummaryItem>
                                            <AccountSummaryItem label="Pricing">
                                                <span className="text-sm text-theme-text-base sm:text-right">
                                                    {formatPricing(
                                                        selectedModel,
                                                    )}
                                                </span>
                                            </AccountSummaryItem>
                                        </>
                                    ) : null}
                                </div>
                                {error ? (
                                    <div className="mt-3">
                                        <Alert intent="warning">
                                            Model catalog unavailable:{" "}
                                            {error.message}
                                        </Alert>
                                    </div>
                                ) : !selectedModel ? (
                                    <Text
                                        size="sm"
                                        tone="soft"
                                        className="mt-3"
                                    >
                                        {isLoading
                                            ? "Loading models..."
                                            : "No model available for this modality."}
                                    </Text>
                                ) : null}
                            </div>
                        </Surface>
                    </section>

                    <ExternalLinkButton
                        href="https://playground.pollinations.ai"
                        className="self-start"
                    >
                        Try it out in Playground
                    </ExternalLinkButton>
                </>
            ) : (
                <section>
                    <SectionHeader title="Gen" />
                    <Surface variant="panel" className="flex flex-col gap-3">
                        {error ? (
                            <Alert intent="warning">
                                Model catalog unavailable: {error.message}
                            </Alert>
                        ) : (
                            <Text size="sm" tone="soft">
                                {isLoading
                                    ? "Loading models..."
                                    : "No models available for your key."}
                            </Text>
                        )}
                    </Surface>
                </section>
            )}
        </>
    );
}

const CONTROL_SIZES = ["sm", "md", "lg"] as const;
const TAB_SIZES = ["sm", "md"] as const;
const NAV_ITEM_OPTIONS = ["Models", "Usage", "Keys", "Billing"] as const;
const NAV_ITEM_ICONS = {
    Models: BeakerIcon,
    Usage: TrendUpIcon,
    Keys: LockIcon,
    Billing: WalletIcon,
} as const;
const SCROLL_AREA_ITEMS = [
    "Text prompt",
    "Image prompt",
    "Video prompt",
    "Audio prompt",
    "Realtime session",
    "Embedding request",
    "Batch output",
    "Webhook event",
    "Usage row",
    "Billing row",
] as const;
const ICON_PREVIEWS = [
    { label: "App", Icon: AppIcon },
    { label: "Beaker", Icon: BeakerIcon },
    { label: "Book", Icon: BookIcon },
    { label: "Check", Icon: CheckIcon },
    { label: "Chevron", Icon: ChevronIcon },
    { label: "Clipboard", Icon: ClipboardIcon },
    { label: "Clock", Icon: ClockIcon },
    { label: "Discord", Icon: DiscordIcon },
    { label: "Download", Icon: DownloadIcon },
    { label: "External", Icon: ExternalLinkIcon },
    { label: "Gen API", Icon: GenApiIcon },
    { label: "GitHub", Icon: GitHubIcon },
    { label: "Image", Icon: ImageIcon },
    { label: "Lock", Icon: LockIcon },
    { label: "Mail", Icon: MailIcon },
    { label: "MCP", Icon: McpIcon },
    { label: "Menu", Icon: MenuIcon },
    { label: "Terminal", Icon: TerminalIcon },
    { label: "Tokens", Icon: TokensIcon },
    { label: "Trend", Icon: TrendUpIcon },
    { label: "Wallet", Icon: WalletIcon },
    { label: "X", Icon: XIcon },
] as const;

function PrimitiveExample({
    name,
    description,
    children,
}: {
    name: string;
    description: string;
    children: ReactNode;
}) {
    return (
        <Surface
            variant="panel"
            className="grid gap-4 md:grid-cols-[minmax(0,0.85fr)_minmax(220px,1.15fr)] md:items-center"
        >
            <div>
                <h3 className="font-bold">{name}</h3>
                <p className="mt-1 text-sm leading-6 text-theme-text-soft">
                    {description}
                </p>
            </div>
            <div className="min-w-0">{children}</div>
        </Surface>
    );
}

function PrimitivesPage() {
    const [activePrimitiveTab, setActivePrimitiveTab] = useState("md-image");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [dialogSize, setDialogSize] =
        useState<(typeof CONTROL_SIZES)[number]>("md");
    const [switchOn, setSwitchOn] = useState(true);
    const [sliderValue, setSliderValue] = useState(60);
    const { isDark } = useColorMode();

    return (
        <>
            <PageIntro>
                Primitives are the smallest building blocks — single-purpose
                elements like buttons, inputs, chips, and text. They carry no
                app logic; everything else is built from them.
            </PageIntro>

            <section>
                <div className="grid gap-3">
                    <PrimitiveExample
                        name="Typography"
                        description="Minimal type roles: section headings, readable body/help text, and compact metadata labels."
                    >
                        <div className="flex flex-col gap-3">
                            <Heading as="h3" size="section">
                                Section heading
                            </Heading>
                            <Text size="sm" tone="soft">
                                Use body or small text for explanatory copy.
                                Keep labels rare and compact.
                            </Text>
                            <div className="flex flex-wrap items-center gap-2">
                                <Text as="span" size="xs" tone="muted">
                                    Metadata label
                                </Text>
                                <Text as="span" size="xs" tone="strong">
                                    1,284 requests
                                </Text>
                            </div>
                        </div>
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="Button"
                        description="Primary command element with theme and size variants."
                    >
                        <div className="flex flex-wrap gap-2">
                            {CONTROL_SIZES.map((size) => (
                                <Button key={size} size={size}>
                                    {size}
                                </Button>
                            ))}
                            <Button intent="danger" size="md">
                                danger
                            </Button>
                        </div>
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="IconButton"
                        description="Compact icon-only command for toolbars and dense controls."
                    >
                        <IconButton title="Copy" onClick={() => undefined}>
                            <ClipboardIcon className="h-3.5 w-3.5" />
                        </IconButton>
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="Icons"
                        description="Exported UI icons, including the shared chevron used by collapsibles and menus."
                    >
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                            {ICON_PREVIEWS.map(({ label, Icon }) => (
                                <div
                                    key={label}
                                    className="flex items-center gap-2 rounded-lg bg-theme-bg-pale px-2 py-2 text-sm text-theme-text-soft"
                                >
                                    <Icon className="h-4 w-4 shrink-0 text-theme-text-strong" />
                                    <span className="truncate">{label}</span>
                                </div>
                            ))}
                        </div>
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="Chip"
                        description="Short status, tag, or metadata label."
                    >
                        <div className="flex flex-col gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                                {CONTROL_SIZES.map((size) => (
                                    <Chip key={size} size={size}>
                                        {size}
                                    </Chip>
                                ))}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <Chip intent="neutral">neutral</Chip>
                                <Chip intent="success">success</Chip>
                                <Chip intent="warning">warning</Chip>
                                <Chip intent="danger">danger</Chip>
                            </div>
                        </div>
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="InlineLink"
                        description="Text link with Pollinations underline, focus, and external icon rules."
                    >
                        <p className="text-sm text-theme-text-soft">
                            Read the{" "}
                            <InlineLink href="https://pollinations.ai">
                                API guide
                            </InlineLink>
                            .
                        </p>
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="Input"
                        description="Single-line text entry with the app's control styling."
                    >
                        <Input placeholder="Describe an image" />
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="Field"
                        description="Accessible field wrapper for labels, helper text, and validation text."
                    >
                        <Field.Root className="flex flex-col gap-1">
                            <Field.Label className="text-xs font-bold uppercase tracking-wide text-theme-text-muted">
                                Endpoint
                                <Field.RequiredIndicator className="ml-1 text-intent-danger-text">
                                    *
                                </Field.RequiredIndicator>
                            </Field.Label>
                            <Input placeholder="/v1/chat/completions" />
                            <Field.HelperText className="text-xs text-theme-text-soft">
                                Used for API calls.
                            </Field.HelperText>
                        </Field.Root>
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="Textarea"
                        description="Multi-line prompt, message, and note entry."
                    >
                        <Textarea
                            rows={4}
                            placeholder="A precise, minimal interface for exploring model output"
                        />
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="Slider"
                        description="Range input with themed progress styling."
                    >
                        <div className="flex items-center gap-3">
                            <Slider
                                min={0}
                                max={100}
                                value={sliderValue}
                                onChange={(event) =>
                                    setSliderValue(
                                        Number(event.currentTarget.value),
                                    )
                                }
                            />
                            <span className="w-10 text-sm tabular-nums text-theme-text-soft">
                                {sliderValue}
                            </span>
                        </div>
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="Switch"
                        description="Theme-independent binary toggle with on, off, and invalid states."
                    >
                        <div className="flex items-center gap-3">
                            <Switch
                                checked={switchOn}
                                onChange={setSwitchOn}
                                ariaLabel="Toggle preview"
                            />
                            <Switch
                                checked
                                status="invalid"
                                onChange={() => undefined}
                                ariaLabel="Invalid toggle preview"
                            />
                        </div>
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="ColorModeToggle"
                        description="Light/dark switch that flips the whole design system. A two-state choice (not on/off), self-wired via the useColorMode hook and kept in sync across every instance and browser tab."
                    >
                        <div className="flex items-center gap-3">
                            <ColorModeToggle />
                            <span className="text-sm text-theme-text-soft">
                                Currently{" "}
                                <span className="font-semibold text-theme-text-strong">
                                    {isDark ? "dark" : "light"}
                                </span>
                            </span>
                        </div>
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="ButtonGroup + TabButton"
                        description="ButtonGroup and TabButton used together for mutually-exclusive modes."
                    >
                        <div className="flex flex-col gap-2">
                            {TAB_SIZES.map((size) => (
                                <ButtonGroup
                                    key={size}
                                    aria-label={`${size} primitive media type`}
                                >
                                    {["image", "text", "audio"].map((item) => (
                                        <TabButton
                                            key={item}
                                            active={
                                                activePrimitiveTab ===
                                                `${size}-${item}`
                                            }
                                            size={size}
                                            onClick={() =>
                                                setActivePrimitiveTab(
                                                    `${size}-${item}`,
                                                )
                                            }
                                        >
                                            {item}
                                        </TabButton>
                                    ))}
                                </ButtonGroup>
                            ))}
                        </div>
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="Dropdown + DropdownItem"
                        description="Small menu surface anchored to a trigger."
                    >
                        <Dropdown
                            trigger={(open) => (
                                <Button type="button">
                                    {open ? "Close menu" : "Open menu"}
                                </Button>
                            )}
                        >
                            {(close) => (
                                <div className="min-w-40 p-2">
                                    <DropdownItem onClick={close}>
                                        Text model
                                    </DropdownItem>
                                    <DropdownItem onClick={close}>
                                        Image model
                                    </DropdownItem>
                                </div>
                            )}
                        </Dropdown>
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="Dialog + DialogTitle"
                        description="Modal shell for focused confirmation or setup tasks."
                    >
                        <div className="flex flex-wrap gap-2">
                            {CONTROL_SIZES.map((size) => (
                                <Button
                                    key={size}
                                    type="button"
                                    size={size}
                                    onClick={() => {
                                        setDialogSize(size);
                                        setDialogOpen(true);
                                    }}
                                >
                                    {size}
                                </Button>
                            ))}
                        </div>
                        <Dialog
                            open={dialogOpen}
                            onOpenChange={setDialogOpen}
                            title={`Primitive dialog (${dialogSize})`}
                            size={dialogSize}
                        >
                            <div className="flex flex-col gap-4 p-6">
                                <p className="text-sm leading-6 text-theme-text-soft">
                                    Dialog content stays focused and short.
                                </p>
                                <div className="flex justify-end">
                                    <Button
                                        type="button"
                                        size="sm"
                                        onClick={() => setDialogOpen(false)}
                                    >
                                        Close
                                    </Button>
                                </div>
                            </div>
                        </Dialog>
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="Table primitives"
                        description="Structured rows for comparison and compact data scans."
                    >
                        <Table>
                            <TableHead>
                                <tr>
                                    <TableHeaderCell>Type</TableHeaderCell>
                                    <TableHeaderCell>Status</TableHeaderCell>
                                </tr>
                            </TableHead>
                            <TableBody>
                                <TableRow>
                                    <TableCell>Image</TableCell>
                                    <TableCell muted>Ready</TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="Surface"
                        description="Theme-aware container primitive for panels and cards."
                    >
                        <div className="grid gap-2 sm:grid-cols-2">
                            <Surface variant="card" className="text-sm">
                                Card surface
                            </Surface>
                            <Surface variant="card-themed" className="text-sm">
                                Themed card
                            </Surface>
                        </div>
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="ScrollArea"
                        description="Subtle themed scrolling for overflow content."
                    >
                        <ScrollArea
                            axis="y"
                            className="h-40 rounded-lg border border-theme-border bg-theme-bg-pale p-3"
                        >
                            <div className="flex flex-col gap-2">
                                {SCROLL_AREA_ITEMS.map((item, index) => (
                                    <div
                                        key={item}
                                        className="flex items-center justify-between rounded-lg bg-theme-bg-subtle px-3 py-2 text-sm"
                                    >
                                        <span>{item}</span>
                                        <Chip size="sm">
                                            {String(index + 1).padStart(2, "0")}
                                        </Chip>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="Tooltip"
                        description="Small contextual detail attached to a focused control."
                    >
                        <Tooltip
                            content="Copied values stay local."
                            triggerAs="span"
                        >
                            <Button size="sm">Hover</Button>
                        </Tooltip>
                    </PrimitiveExample>
                </div>
            </section>
        </>
    );
}

function CompositionsPage() {
    const [activeNavItem, setActiveNavItem] =
        useState<(typeof NAV_ITEM_OPTIONS)[number]>("Models");
    const [collapsibleOpen, setCollapsibleOpen] = useState(true);
    const [selectedModalities, setSelectedModalities] = useState([
        "text",
        "image",
    ]);
    const [period, setPeriod] = useState<PeriodSelection>(() =>
        currentPeriod(),
    );
    const [files, setFiles] = useState<File[]>([]);

    return (
        <>
            <PageIntro>
                Compositions combine primitives into reusable patterns with
                their own state and behavior — a copy button, a file uploader, a
                period picker.
            </PageIntro>

            <section>
                <div className="grid gap-3">
                    <PrimitiveExample
                        name="ExternalLinkButton"
                        description="Button-styled link for leaving the current app surface."
                    >
                        <div className="flex flex-wrap gap-2">
                            {CONTROL_SIZES.map((size) => (
                                <ExternalLinkButton
                                    key={size}
                                    href="https://pollinations.ai"
                                    size={size}
                                >
                                    {size}
                                </ExternalLinkButton>
                            ))}
                        </div>
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="CopyButton"
                        description="Clipboard helper with copied state and caller-owned visual styling."
                    >
                        <CopyButton
                            value="pollinations"
                            className={(copied) =>
                                `rounded-full px-3 py-1.5 text-sm font-medium ${
                                    copied
                                        ? "bg-intent-success-bg-light text-intent-success-text"
                                        : "bg-theme-bg-active text-theme-text-strong"
                                }`
                            }
                        >
                            {(copied) => (copied ? "Copied" : "Copy value")}
                        </CopyButton>
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="LinkCard"
                        description="Clickable card composition for grouped navigation targets."
                    >
                        <LinkCard href="https://pollinations.ai">
                            <p className="font-semibold">Documentation</p>
                            <p className="text-sm text-theme-text-soft">
                                Open the public docs.
                            </p>
                        </LinkCard>
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="NavItem"
                        description="Themed pill for navigation and section lists."
                    >
                        <div className="flex flex-wrap gap-2">
                            {NAV_ITEM_OPTIONS.map((item) => (
                                <NavItem
                                    key={item}
                                    type="button"
                                    icon={NAV_ITEM_ICONS[item]}
                                    active={activeNavItem === item}
                                    onClick={() => setActiveNavItem(item)}
                                >
                                    {item}
                                </NavItem>
                            ))}
                        </div>
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="MultiSelect"
                        description="Compact multi-choice control for tags and filters."
                    >
                        <MultiSelect
                            options={[
                                { value: "text", label: "Text" },
                                { value: "image", label: "Image" },
                                { value: "video", label: "Video" },
                                { value: "audio", label: "Audio" },
                            ]}
                            selected={selectedModalities}
                            onChange={setSelectedModalities}
                            label="Types"
                            placeholder="All"
                        />
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="PeriodPicker"
                        description="Preset time-window selector for dashboards and usage views."
                    >
                        <PeriodPicker value={period} onChange={setPeriod} />
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="Collapsible"
                        description="Inline disclosure for optional nested content."
                    >
                        <Collapsible
                            label={
                                <span className="font-semibold">
                                    Advanced settings
                                </span>
                            }
                            expanded={collapsibleOpen}
                            onToggle={() =>
                                setCollapsibleOpen((current) => !current)
                            }
                            wrapperClassName="border-theme-border bg-theme-bg-pale"
                        >
                            <p className="text-sm text-theme-text-soft">
                                Optional controls can live behind this row.
                            </p>
                        </Collapsible>
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="Alert"
                        description="Inline feedback for informational, warning, and error states."
                    >
                        <Alert title="Synced">Settings are up to date.</Alert>
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="StatCard"
                        description="Labeled value display for dense metrics and facts."
                    >
                        <StatCard
                            label="Requests"
                            value="1,284"
                            detail="last 24 hours"
                        />
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="Section"
                        description="Reusable page section wrapper with optional framed content and action slot."
                    >
                        <Section
                            title="Section title"
                            framed
                            intro="Intro copy belongs to the section API."
                            action={<Button size="sm">Action</Button>}
                        >
                            <Text size="sm" tone="soft">
                                Framed section content.
                            </Text>
                        </Section>
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="InfoTip"
                        description="Small information badge backed by the tooltip primitive."
                    >
                        <p className="inline-flex items-center text-sm text-theme-text-soft">
                            Request cost
                            <InfoTip text="Costs vary by selected model." />
                        </p>
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="Markdown"
                        description="Compact markdown rendering for cards and snippets."
                    >
                        <Markdown className="text-sm text-theme-text-soft">
                            {
                                '**Generation note**\n\n- Use `model: "openai"` for text\n- Add **image input** when available\n- See [API docs](https://pollinations.ai)'
                            }
                        </Markdown>
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="Prose"
                        description="Document-style markdown rendering for longer content."
                    >
                        <Prose className="text-sm">
                            {"### Heading\nParagraph text with **emphasis**."}
                        </Prose>
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="CodeBlock"
                        description="Themed code surface; copy actions stay separate."
                    >
                        <CodeBlock
                            code={
                                'await generateText("Hello", { model: "openai" });'
                            }
                        />
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="FileUpload"
                        description="File import recipe with validation, rejected file feedback, and remove actions."
                    >
                        <FileUpload
                            value={files}
                            onChange={setFiles}
                            maxFiles={2}
                        />
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="MediaPlaceholder"
                        description="Empty output state for generated image, video, or audio surfaces."
                    >
                        <MediaPlaceholder
                            icon={<ImageIcon className="h-5 w-5" />}
                            label="Output preview"
                            detail="Generated media appears here."
                        />
                    </PrimitiveExample>
                </div>
            </section>
        </>
    );
}

// --- Colors tab ------------------------------------------------------------
// A self-contained color story. The picker sets data-theme on ONLY the themed
// preview region, so the rest of the app stays neutral. The themed ramp + live
// components re-resolve to the picked theme; the structural and semantic
// colors are theme-independent and shown once. All class strings are literal
// (the app compiles Tailwind from source, so dynamic class names won't emit).

// [name, swatch fill class, canonical usage class]
const THEMED_TOKENS = [
    ["bg-pale", "bg-theme-bg-pale", "bg-theme-bg-pale"],
    ["bg-subtle", "bg-theme-bg-subtle", "bg-theme-bg-subtle"],
    ["bg-active", "bg-theme-bg-active", "bg-theme-bg-active"],
    ["bg-hover", "bg-theme-bg-hover", "bg-theme-bg-hover"],
    ["border", "bg-theme-border", "border-theme-border"],
    ["text-soft", "bg-theme-text-soft", "text-theme-text-soft"],
] as const;

const STRUCTURAL_TOKENS = [
    ["app-bg", "bg-app-bg", "bg-app-bg"],
    ["surface-opaque", "bg-surface-opaque", "bg-surface-opaque"],
    ["divider", "bg-divider", "border-divider"],
    ["text-strong", "bg-theme-text-strong", "text-theme-text-strong"],
    ["text-base", "bg-theme-text-base", "text-theme-text-base"],
    ["text-muted", "bg-theme-text-muted", "text-theme-text-muted"],
] as const;

// [name, pill classes (literal so Tailwind emits them)]
const INTENT_TOKENS = [
    ["danger", "bg-intent-danger-bg-light text-intent-danger-text"],
    ["success", "bg-intent-success-bg-light text-intent-success-text"],
    ["warning", "bg-intent-warning-bg-light text-intent-warning-text"],
    ["news", "bg-intent-news-bg-light text-intent-news-text"],
    ["alpha", "bg-intent-alpha-bg-light text-intent-alpha-text"],
] as const;

const MODALITIES = [
    "text",
    "image",
    "video",
    "audio",
    "realtime",
    "embedding",
] as const;

// [name, coin color var] — the wallet credit coins (from the wallet module).
const WALLET_SWATCHES = [
    ["pollen", "var(--polli-color-tier-soft)"],
    ["pollen+", "var(--polli-color-paid-soft)"],
] as const;

function Swatch({
    name,
    fill,
    usage,
}: {
    name: string;
    fill: string;
    usage: string;
}) {
    return (
        <div className="flex items-center gap-3 rounded-lg bg-surface-opaque p-2.5">
            <span
                className={`h-9 w-9 shrink-0 rounded-md border border-divider ${fill}`}
            />
            <span className="min-w-0">
                <span className="block text-sm font-semibold text-theme-text-strong">
                    {name}
                </span>
                <code className="block truncate text-xs text-theme-text-muted">
                    {usage}
                </code>
            </span>
        </div>
    );
}

function ColorsPage() {
    return (
        <>
            <PageIntro>
                One app accent drives all chrome — set once via{" "}
                <code>--polli-hue</code> (currently hue 85, an amber). The
                multi-hue palette is reserved for dedicated roles: per-modality
                dots, the wallet coins, and the fixed status/label intents. Flip
                the light/dark toggle in the header to see each token adapt.
            </PageIntro>

            <section className="flex flex-col gap-4">
                <SectionHeader title="Accent">
                    The single app accent. Every themed token — bg-theme-*,
                    border-theme-border, text-theme-text-soft — resolves to it;
                    no per-page hue.
                </SectionHeader>
                <Surface variant="panel" className="flex flex-col gap-4">
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-2.5">
                        {THEMED_TOKENS.map(([name, fill, usage]) => (
                            <Swatch
                                key={name}
                                name={name}
                                fill={fill}
                                usage={usage}
                            />
                        ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 border-t border-divider pt-4">
                        <Button size="sm">Button</Button>
                        <Chip size="sm">Chip</Chip>
                        <TabButton active onClick={() => undefined}>
                            Active tab
                        </TabButton>
                        <TabButton active={false} onClick={() => undefined}>
                            Tab
                        </TabButton>
                        <Input
                            className="w-40"
                            placeholder="Input"
                            aria-label="Accent input preview"
                        />
                    </div>
                </Surface>
            </section>

            <section className="flex flex-col gap-4">
                <SectionHeader title="Modality">
                    A fixed color per model modality — as a dot, a chip, or a
                    filter tab. Decoupled from the accent; identical wherever a
                    modality appears.
                </SectionHeader>
                <Surface variant="panel" className="flex flex-col gap-4">
                    <div className="flex flex-wrap gap-x-5 gap-y-3">
                        {MODALITIES.map((m) => (
                            <span
                                key={m}
                                className="inline-flex items-center gap-2 text-sm font-medium capitalize text-theme-text-base"
                            >
                                <ModalityDot modality={m} />
                                {m}
                            </span>
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {MODALITIES.map((m) => (
                            <ModalityChip
                                key={m}
                                modality={m}
                                className="capitalize"
                            >
                                {m}
                            </ModalityChip>
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {MODALITIES.map((m, i) => (
                            <ModalityTab
                                key={m}
                                modality={m}
                                active={i === 0}
                                onClick={() => undefined}
                                className="capitalize"
                            >
                                {m}
                            </ModalityTab>
                        ))}
                    </div>
                </Surface>
            </section>

            <section className="flex flex-col gap-4">
                <SectionHeader title="Wallet">
                    Two honey coins for the credit system — pollen and pollen+.
                </SectionHeader>
                <Surface variant="panel" className="flex flex-wrap gap-2.5">
                    {WALLET_SWATCHES.map(([name, color]) => (
                        <div
                            key={name}
                            className="flex items-center gap-3 rounded-lg bg-surface-opaque p-2.5"
                        >
                            <span
                                className="h-9 w-9 shrink-0 rounded-full border border-divider"
                                style={{ backgroundColor: color }}
                            />
                            <span className="text-sm font-semibold text-theme-text-strong">
                                {name}
                            </span>
                        </div>
                    ))}
                </Surface>
            </section>

            <section className="flex flex-col gap-4">
                <SectionHeader title="Structural">
                    Neutral, theme-independent surfaces and text — identical in
                    every theme; only light/dark changes them.
                </SectionHeader>
                <Surface
                    variant="panel"
                    className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-2.5"
                >
                    {STRUCTURAL_TOKENS.map(([name, fill, usage]) => (
                        <Swatch
                            key={name}
                            name={name}
                            fill={fill}
                            usage={usage}
                        />
                    ))}
                </Surface>
            </section>

            <section className="flex flex-col gap-4">
                <SectionHeader title="Status &amp; labels">
                    Intent colors, independent of the accent. Status
                    (danger/success/warning) is the traffic-light trio; labels
                    (news/alpha) are their own system.
                </SectionHeader>
                <Surface variant="panel" className="flex flex-wrap gap-2">
                    {INTENT_TOKENS.map(([name, pill]) => (
                        <span
                            key={name}
                            className={`rounded-full px-3 py-1 text-sm font-semibold capitalize ${pill}`}
                        >
                            {name}
                        </span>
                    ))}
                </Surface>
            </section>
        </>
    );
}

function DebugShowcase({
    activeView,
    onSelectView,
}: {
    activeView: AppView;
    onSelectView: (view: AppView) => void;
}) {
    return (
        <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-app-bg">
            <ShellHeader activeView={activeView} onSelectView={onSelectView} />
            <Suspense fallback={null}>
                <DesignShowcase hideHeader />
            </Suspense>
        </div>
    );
}

export default function App() {
    const { activeView, selectView } = useAppView();

    if (activeView === "showcase") {
        return (
            <DebugShowcase activeView={activeView} onSelectView={selectView} />
        );
    }

    return (
        <PolliProvider appKey={APP_KEY} permissions={["profile"]}>
            <AppShell activeView={activeView} onSelectView={selectView} />
        </PolliProvider>
    );
}
