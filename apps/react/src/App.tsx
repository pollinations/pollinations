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
    type ThemeName,
    TokensIcon,
    Tooltip,
    TrendUpIcon,
    WalletIcon,
    XIcon,
} from "@pollinations/ui";
import { AppUserMenu } from "@pollinations/ui/app-user-menu/sdk";
import logoWordmarkUrl from "@pollinations/ui/assets/logo-wordmark.svg";
import { WhenLoggedIn, WhenLoggedOut } from "@pollinations/ui/auth/sdk";
import { modalityTheme } from "@pollinations/ui/modality";
import {
    categoryLabel,
    ModelSelector,
    type ModelSelectorCategory,
} from "@pollinations/ui/models";
import {
    type CSSProperties,
    lazy,
    type ReactNode,
    Suspense,
    useEffect,
    useState,
} from "react";

// Publishable key for this showcase (pk_* is safe to commit).
// Created via `polli keys create --type publishable` with redirect URIs
// http://localhost:5173 and https://react.pollinations.ai.
const APP_KEY = "pk_kZRl8saq8s2h9ome";
const APP_THEME: ThemeName = "amber";
// Point the catalog at a local gen worker in dev (VITE_GEN_BASE_URL=http://localhost:8788).
// Unset falls back to the SDK default (production gen.pollinations.ai).
const GEN_BASE_URL = import.meta.env.VITE_GEN_BASE_URL || undefined;
const MODULES_CODE_SNIPPET = `import { useState } from "react";
import { PolliProvider, useModelCatalog } from "@pollinations/sdk/react";
import { AppUserMenu } from "@pollinations/ui/app-user-menu/sdk";
import { ModelSelector } from "@pollinations/ui/models";

export function App() {
  return (
    <PolliProvider appKey="pk_your_publishable_key" permissions={["profile"]}>
      <Modules />
    </PolliProvider>
  );
}

function Modules() {
  const [modelId, setModelId] = useState("");
  const { models, allowedModelIds, allowedCategories, isLoggedIn, isLoading } =
    useModelCatalog();

  const visibleModels = isLoggedIn
    ? models.filter((model) => allowedModelIds.has(model.id))
    : models;
  const category = allowedCategories[0];
  const selectedModel =
    visibleModels.find((model) => model.id === modelId) ??
    visibleModels.find((model) => model.category === category);

  if (!category) return null;

  return (
    <>
      <AppUserMenu dashboardHref="https://enter.pollinations.ai" />
      <ModelSelector
        models={visibleModels}
        category={category}
        value={selectedModel?.id ?? ""}
        isLoading={isLoading}
        onChange={setModelId}
      />
    </>
  );
}`;

const DesignShowcase = lazy(() =>
    import("./showcase/DesignShowcase").then((module) => ({
        default: module.DesignShowcase,
    })),
);

const brandWordmarkMask: CSSProperties = {
    WebkitMask: `url(${logoWordmarkUrl}) center / contain no-repeat`,
    mask: `url(${logoWordmarkUrl}) center / contain no-repeat`,
};

type PublicAppView = "primitives" | "compositions" | "modules";
type AppView = PublicAppView | "showcase";

const PUBLIC_VIEWS: { id: PublicAppView; label: string }[] = [
    { id: "primitives", label: "Primitives" },
    { id: "compositions", label: "Compositions" },
    { id: "modules", label: "Modules" },
];

function readAppView(): AppView {
    if (typeof window === "undefined") return "primitives";
    const view = new URLSearchParams(window.location.search).get("view");
    if (view === "showcase") return "showcase";
    if (
        view === "primitives" ||
        view === "compositions" ||
        view === "modules"
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

function BrandMark() {
    return (
        <a
            href="https://pollinations.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center text-theme-text-strong"
            aria-label="Pollinations"
        >
            <span className="sr-only">Pollinations</span>
            <span
                aria-hidden="true"
                className="block h-7 w-[220px] max-w-full bg-current"
                style={brandWordmarkMask}
            />
        </a>
    );
}

function ShellHeader({
    activeView,
    onSelectView,
}: {
    activeView: AppView;
    onSelectView: (view: AppView) => void;
}) {
    return (
        <header className="sticky top-0 z-30 border-b border-theme-border bg-surface-white px-5 py-4 backdrop-blur">
            <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <BrandMark />
                <nav
                    aria-label="React app views"
                    className="flex min-w-0 flex-wrap gap-2"
                >
                    {PUBLIC_VIEWS.map((view) => (
                        <TabButton
                            key={view.id}
                            theme={APP_THEME}
                            active={activeView === view.id}
                            onClick={() => onSelectView(view.id)}
                        >
                            {view.label}
                        </TabButton>
                    ))}
                </nav>
            </div>
        </header>
    );
}

function AppShell({
    activeView,
    onSelectView,
}: {
    activeView: AppView;
    onSelectView: (view: AppView) => void;
}) {
    return (
        <div
            data-theme={APP_THEME}
            className="min-h-screen overflow-x-hidden bg-surface-white text-theme-text-strong"
        >
            <ShellHeader activeView={activeView} onSelectView={onSelectView} />
            <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-12 px-5 py-8 sm:py-10">
                {activeView === "primitives" ? (
                    <PrimitivesPage />
                ) : activeView === "compositions" ? (
                    <CompositionsPage />
                ) : activeView === "modules" ? (
                    <ModulesPage />
                ) : null}
            </main>
        </div>
    );
}

function PageTitle({ children }: { children: ReactNode }) {
    return (
        <section className="border-b border-theme-border pb-5">
            <h1 className="font-serif text-3xl font-black tracking-tight text-theme-text-strong">
                {children}
            </h1>
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
        <Chip key={category} theme={modalityTheme(category)} size="sm">
            {categoryLabel(category)} {count}
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
    const categoryTheme = activeCategory
        ? modalityTheme(activeCategory)
        : APP_THEME;
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
            <section className="border-b border-theme-border pb-7">
                <p className="max-w-3xl text-base leading-7 text-theme-text-base">
                    A compact pass through the SDK-backed UI modules:
                    authenticate, inspect access, choose a modality and model,
                    then prepare a generation.
                </p>
            </section>

            <section>
                <SectionHeader title="Auth + Wallet" />
                <Surface
                    variant="panel"
                    className="flex flex-col items-start gap-4"
                >
                    <AppUserMenu dashboardHref={enterUrl} />
                    <div className="w-full">
                        <WhenLoggedOut>
                            <Chip>Authorize first</Chip>
                        </WhenLoggedOut>
                        <WhenLoggedIn>
                            <div className="grid w-full gap-2 lg:grid-cols-2">
                                <AccountSummaryItem label="Username">
                                    <AccountSummaryText
                                        value={
                                            profile.data?.githubUsername ?? null
                                        }
                                        isLoading={profile.isLoading}
                                        fallback="Not available"
                                    />
                                </AccountSummaryItem>
                                <AccountSummaryItem label="Key budget">
                                    <AccountSummaryText
                                        value={formatPollenAmount(
                                            accountKey.data?.pollenBudget,
                                        )}
                                        isLoading={accountKey.isLoading}
                                        fallback="No cap"
                                    />
                                </AccountSummaryItem>
                                <AccountSummaryItem label="Key expires">
                                    <AccountSummaryText
                                        value={formatExpiry(
                                            accountKey.data?.expiresAt,
                                        )}
                                        isLoading={accountKey.isLoading}
                                        fallback="No expiry"
                                    />
                                </AccountSummaryItem>
                                <AccountSummaryItem label="Name">
                                    <AccountSummaryText
                                        value={profile.data?.name}
                                        isLoading={profile.isLoading}
                                    />
                                </AccountSummaryItem>
                                <AccountSummaryItem label="Email">
                                    <AccountSummaryText
                                        value={profile.data?.email}
                                        isLoading={profile.isLoading}
                                    />
                                </AccountSummaryItem>
                                <AccountSummaryItem label="Usage">
                                    <AccountSummaryText
                                        value={formatUsageCount(
                                            keyUsage.data?.count,
                                        )}
                                        isLoading={keyUsage.isLoading}
                                    />
                                </AccountSummaryItem>
                                <AccountSummaryItem label="Models and Modalities">
                                    <ModelCountChips
                                        counts={modelCounts}
                                        isLoading={isLoading}
                                    />
                                </AccountSummaryItem>
                                <AccountSummaryItem label="Earn">
                                    <Chip intent="success" size="sm">
                                        20% of pollen spent in-app
                                    </Chip>
                                </AccountSummaryItem>
                            </div>
                        </WhenLoggedIn>
                    </div>
                </Surface>
            </section>

            {activeCategory ? (
                <>
                    <section>
                        <SectionHeader title="Modality + Models" />
                        <Surface
                            variant="panel"
                            theme={categoryTheme}
                            className="flex flex-col gap-5"
                        >
                            <ButtonGroup aria-label="Modality">
                                {categories.map((item) => (
                                    <TabButton
                                        key={item}
                                        active={activeCategory === item}
                                        theme={modalityTheme(item)}
                                        onClick={() => setCategory(item)}
                                    >
                                        {categoryLabel(item)}
                                    </TabButton>
                                ))}
                            </ButtonGroup>

                            <ModelSelector
                                models={visibleModels}
                                category={activeCategory}
                                value={selectedModelId}
                                isLoading={isLoading}
                                onChange={(modelId) =>
                                    setSelectedByCategory((current) => ({
                                        ...current,
                                        [activeCategory]: modelId,
                                    }))
                                }
                            />

                            {error ? (
                                <Alert intent="warning">
                                    Model catalog unavailable: {error.message}
                                </Alert>
                            ) : null}

                            {selectedModel ? (
                                <div className="grid gap-3 md:grid-cols-3">
                                    <div className="rounded-lg border border-theme-border bg-theme-bg-pale p-3">
                                        <Text
                                            size="micro"
                                            tone="muted"
                                            weight="bold"
                                        >
                                            ID
                                        </Text>
                                        <p className="mt-1 break-all font-mono text-sm">
                                            {selectedModel.id}
                                        </p>
                                    </div>
                                    <div className="rounded-lg border border-theme-border bg-theme-bg-pale p-3">
                                        <Text
                                            size="micro"
                                            tone="muted"
                                            weight="bold"
                                        >
                                            Input
                                        </Text>
                                        <p className="mt-1 text-sm">
                                            {formatList(
                                                selectedModel.inputModalities,
                                            )}
                                        </p>
                                    </div>
                                    <div className="rounded-lg border border-theme-border bg-theme-bg-pale p-3">
                                        <Text
                                            size="micro"
                                            tone="muted"
                                            weight="bold"
                                        >
                                            Output
                                        </Text>
                                        <p className="mt-1 text-sm">
                                            {formatList(
                                                selectedModel.outputModalities,
                                            )}
                                        </p>
                                    </div>
                                    <div className="rounded-lg border border-theme-border bg-theme-bg-pale p-3">
                                        <Text
                                            size="micro"
                                            tone="muted"
                                            weight="bold"
                                        >
                                            Limit
                                        </Text>
                                        <p className="mt-1 text-sm">
                                            {formatModelLimit(selectedModel)}
                                        </p>
                                    </div>
                                    <div className="rounded-lg border border-theme-border bg-theme-bg-pale p-3 md:col-span-2">
                                        <Text
                                            size="micro"
                                            tone="muted"
                                            weight="bold"
                                        >
                                            Access
                                        </Text>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            <Chip
                                                intent={
                                                    selectedModelAccess ===
                                                    "Not allowed"
                                                        ? "warning"
                                                        : "success"
                                                }
                                                theme={categoryTheme}
                                            >
                                                {selectedModelAccess}
                                            </Chip>
                                            {selectedModel.paidOnly ? (
                                                <Chip theme={categoryTheme}>
                                                    paid
                                                </Chip>
                                            ) : null}
                                        </div>
                                    </div>
                                    <div className="rounded-lg border border-theme-border bg-theme-bg-pale p-3 md:col-span-3">
                                        <Text
                                            size="micro"
                                            tone="muted"
                                            weight="bold"
                                        >
                                            Pricing
                                        </Text>
                                        <p className="mt-1 text-sm">
                                            {formatPricing(selectedModel)}
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <Text size="sm" tone="soft">
                                    {isLoading
                                        ? "Loading models..."
                                        : "No model available for this modality."}
                                </Text>
                            )}
                        </Surface>
                    </section>

                    <section>
                        <SectionHeader title="Try It Out" />
                        <Surface
                            variant="panel"
                            theme={categoryTheme}
                            className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]"
                        >
                            <div className="flex flex-col gap-4">
                                <Textarea
                                    rows={5}
                                    placeholder={`Describe a ${categoryLabel(activeCategory).toLowerCase()} output`}
                                />
                                <div className="flex justify-end">
                                    <Button theme={categoryTheme}>
                                        Generate
                                    </Button>
                                </div>
                            </div>
                            <MediaPlaceholder
                                icon={<ImageIcon className="h-5 w-5" />}
                                label={`${categoryLabel(activeCategory)} output`}
                                detail={
                                    selectedModel
                                        ? selectedModel.id
                                        : "Select a model"
                                }
                            />
                        </Surface>
                    </section>
                </>
            ) : (
                <section>
                    <SectionHeader title="Modality + Models" />
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

            <section>
                <SectionHeader title="Code" />
                <Surface
                    variant="panel"
                    theme={APP_THEME}
                    className="flex flex-col gap-3"
                >
                    <div className="flex justify-end">
                        <CopyButton
                            value={MODULES_CODE_SNIPPET}
                            data-theme={APP_THEME}
                            className={(copied) =>
                                `inline-flex items-center gap-2 rounded-full px-3 pt-1.5 pb-2 text-sm font-medium transition-colors ${
                                    copied
                                        ? "bg-intent-success-bg-light text-intent-success-text"
                                        : "bg-theme-bg-active text-theme-text-base hover:bg-theme-bg-hover"
                                }`
                            }
                        >
                            {(copied) =>
                                copied ? (
                                    <>
                                        <CheckIcon className="h-4 w-4" />
                                        Copied
                                    </>
                                ) : (
                                    <>
                                        <ClipboardIcon className="h-4 w-4" />
                                        Copy code
                                    </>
                                )
                            }
                        </CopyButton>
                    </div>
                    <CodeBlock code={MODULES_CODE_SNIPPET} theme={APP_THEME} />
                </Surface>
            </section>
        </>
    );
}

const CONTROL_SIZES = ["sm", "md", "lg"] as const;
const TAB_SIZES = ["sm", "md"] as const;
const NAV_ITEM_OPTIONS = ["Models", "Usage", "Keys", "Billing"] as const;
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

    return (
        <>
            <PageTitle>Primitives</PageTitle>

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
                                <Button
                                    key={size}
                                    theme={APP_THEME}
                                    size={size}
                                >
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
                                    <Chip
                                        key={size}
                                        size={size}
                                        theme={APP_THEME}
                                    >
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
                            <InlineLink
                                href="https://pollinations.ai"
                                theme={APP_THEME}
                            >
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
                                            theme={APP_THEME}
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
                            theme={APP_THEME}
                            trigger={(open) => (
                                <Button type="button" theme={APP_THEME}>
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
                                    theme={APP_THEME}
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
                            theme={APP_THEME}
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
                                        theme={APP_THEME}
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
                            <Surface
                                variant="card-themed"
                                theme={APP_THEME}
                                className="text-sm"
                            >
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
                            theme={APP_THEME}
                            className="h-40 rounded-lg border border-theme-border bg-theme-bg-pale p-3"
                        >
                            <div className="flex flex-col gap-2">
                                {SCROLL_AREA_ITEMS.map((item, index) => (
                                    <div
                                        key={item}
                                        className="flex items-center justify-between rounded-lg bg-theme-bg-subtle px-3 py-2 text-sm"
                                    >
                                        <span>{item}</span>
                                        <Chip size="sm" theme={APP_THEME}>
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
                            <Button size="sm" theme={APP_THEME}>
                                Hover
                            </Button>
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
            <PageTitle>Compositions</PageTitle>

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
                                    theme={APP_THEME}
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
                        <LinkCard
                            href="https://pollinations.ai"
                            theme={APP_THEME}
                        >
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
                                    active={activeNavItem === item}
                                    theme={
                                        item === "Billing" ? "teal" : APP_THEME
                                    }
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
                            theme={APP_THEME}
                        />
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="PeriodPicker"
                        description="Preset time-window selector for dashboards and usage views."
                    >
                        <PeriodPicker
                            value={period}
                            onChange={setPeriod}
                            theme={APP_THEME}
                        />
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
                            theme={APP_THEME}
                            framed
                            intro="Intro copy belongs to the section API."
                            action={
                                <Button size="sm" theme={APP_THEME}>
                                    Action
                                </Button>
                            }
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
                            theme={APP_THEME}
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
                            theme={APP_THEME}
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

function DebugShowcase({
    activeView,
    onSelectView,
}: {
    activeView: AppView;
    onSelectView: (view: AppView) => void;
}) {
    return (
        <div
            data-theme={APP_THEME}
            className="flex h-dvh min-h-0 flex-col overflow-hidden bg-surface-white"
        >
            <ShellHeader activeView={activeView} onSelectView={onSelectView} />
            <Suspense fallback={null}>
                <DesignShowcase hideHeader hideThemeTabs theme={APP_THEME} />
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
