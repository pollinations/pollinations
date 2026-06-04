import { fetchModelCatalog, type ModelCatalogItem } from "@pollinations/sdk";
import { PolliProvider, useAuthActions } from "@pollinations/sdk/react";
import {
    Alert,
    BeakerIcon,
    Button,
    ButtonGroup,
    Chip,
    ClipboardIcon,
    ClockIcon,
    currentPeriod,
    ExternalLinkButton,
    GenApiIcon,
    IconButton,
    ImageIcon,
    Input,
    Markdown,
    MultiSelect,
    PeriodPicker,
    type PeriodSelection,
    ScrollArea,
    Slider,
    StatCard,
    Switch,
    TabButton,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
    Textarea,
    type ThemeName,
    Tooltip,
    TrendUpIcon,
} from "@pollinations/ui";
import logoWordmarkUrl from "@pollinations/ui/assets/logo-wordmark.svg";
import {
    LoginButton,
    LogoutButton,
    UserAvatar,
    UserEmail,
    UserName,
    WhenLoggedIn,
    WhenLoggedOut,
} from "@pollinations/ui/auth/sdk";
import { AppUserMenu } from "@pollinations/ui/compositions/app-user";
import {
    ModelSelector,
    type ModelSelectorCategory,
    type ModelSelectorItem,
} from "@pollinations/ui/models";
import {
    Balance,
    KeyBudget,
    KeyExpiry,
    KeyModels,
    KeyPrefix,
} from "@pollinations/ui/wallet/sdk";
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
const APP_THEME: ThemeName = "blue";

const DesignShowcase = lazy(() =>
    import("./showcase/DesignShowcase").then((module) => ({
        default: module.DesignShowcase,
    })),
);

const brandWordmarkMask: CSSProperties = {
    WebkitMask: `url(${logoWordmarkUrl}) center / contain no-repeat`,
    mask: `url(${logoWordmarkUrl}) center / contain no-repeat`,
};

type PublicAppView = "models" | "primitives" | "compositions";
type AppView = PublicAppView | "showcase";

const PUBLIC_VIEWS: { id: PublicAppView; label: string }[] = [
    { id: "models", label: "Models" },
    { id: "primitives", label: "Primitives" },
    { id: "compositions", label: "Compositions" },
];

function readAppView(): AppView {
    if (typeof window === "undefined") return "models";
    const view = new URLSearchParams(window.location.search).get("view");
    if (view === "showcase") return "showcase";
    if (view === "primitives" || view === "compositions") return view;
    if (view === "react" || view === "modules") return "compositions";
    return "models";
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
        if (view === "models") {
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
            className="inline-flex shrink-0 items-center text-green-950"
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
        <header className="sticky top-0 z-30 border-b border-green-950/10 bg-[#f7fbf5]/95 px-5 py-4 backdrop-blur">
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
            className="min-h-screen overflow-x-hidden bg-[#f7fbf5] text-slate-950"
        >
            <ShellHeader activeView={activeView} onSelectView={onSelectView} />
            <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-12 px-5 py-8 sm:py-10">
                {activeView === "primitives" ? (
                    <PrimitivesPage />
                ) : activeView === "compositions" ? (
                    <CompositionsPage />
                ) : (
                    <ModelsPage />
                )}
            </main>
        </div>
    );
}

function PageIntro({
    eyebrow,
    title,
    children,
    action,
}: {
    eyebrow: string;
    title: string;
    children: ReactNode;
    action?: ReactNode;
}) {
    return (
        <section className="grid gap-5 border-b border-slate-200 pb-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div className="max-w-3xl">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-green-700">
                    {eyebrow}
                </p>
                <h1 className="font-serif text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">
                    {title}
                </h1>
                <p className="mt-4 text-base leading-7 text-slate-700">
                    {children}
                </p>
            </div>
            {action ? (
                <div className="flex justify-start md:justify-end">
                    {action}
                </div>
            ) : null}
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
            <h2 className="font-serif text-2xl font-black text-slate-950">
                {title}
            </h2>
            {children ? (
                <p className="text-sm leading-6 text-slate-600">{children}</p>
            ) : null}
        </div>
    );
}

function QuietPanel({
    children,
    className = "",
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={`min-w-0 rounded-lg border border-slate-200 bg-white/80 p-5 ${className}`}
        >
            {children}
        </div>
    );
}

function CopySnippetButton({
    text,
    children = "Copy",
}: {
    text: string;
    children?: ReactNode;
}) {
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!copied) return;
        const timer = setTimeout(() => setCopied(false), 1400);
        return () => clearTimeout(timer);
    }, [copied]);

    return (
        <Button
            type="button"
            theme="teal"
            size="sm"
            onClick={() => {
                void navigator.clipboard
                    .writeText(text)
                    .then(() => {
                        setCopied(true);
                    })
                    .catch(() => {
                        // Clipboard access can be denied outside secure contexts.
                    });
            }}
        >
            {copied ? "Copied" : children}
        </Button>
    );
}

function CodePanel({
    title,
    code,
    caption,
}: {
    title: string;
    code: string;
    caption?: string;
}) {
    return (
        <div className="flex min-w-0 flex-col gap-4 rounded-lg border border-slate-800 bg-slate-950 p-5 text-white">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <p className="text-sm font-semibold">{title}</p>
                    {caption ? (
                        <p className="mt-1 text-xs text-slate-300">{caption}</p>
                    ) : null}
                </div>
                <CopySnippetButton text={code}>Copy</CopySnippetButton>
            </div>
            <pre className="overflow-x-auto rounded bg-black/25 p-4 text-xs leading-6 text-slate-100">
                <code>{code}</code>
            </pre>
        </div>
    );
}

const MODEL_GROUPS = [
    {
        id: "text",
        label: "Text",
        theme: "blue" as ThemeName,
        Icon: GenApiIcon,
        summary: "Chat, structured output, tools, streaming, and vision input.",
        examples: ["openai", "claude", "gemini", "minimax-m3"],
        capabilities: ["chat", "stream", "json", "vision"],
    },
    {
        id: "image",
        label: "Image",
        theme: "pink" as ThemeName,
        Icon: ImageIcon,
        summary: "Generation, editing, references, transparency, and batches.",
        examples: ["zimage", "flux", "kontext", "nanobanana"],
        capabilities: ["generate", "edit", "reference", "transparent"],
    },
    {
        id: "video",
        label: "Video",
        theme: "teal" as ThemeName,
        Icon: TrendUpIcon,
        summary: "Prompt to video and image to video with duration controls.",
        examples: ["veo", "seedance", "wan", "ltx-2"],
        capabilities: ["prompt", "image input", "duration", "audio"],
    },
    {
        id: "audio",
        label: "Audio",
        theme: "violet" as ThemeName,
        Icon: ClockIcon,
        summary: "Text to speech, music generation, voices, and transcription.",
        examples: ["elevenlabs", "elevenmusic", "acestep", "whisper"],
        capabilities: ["speech", "music", "voices", "transcribe"],
    },
    {
        id: "embedding",
        label: "Embeddings",
        theme: "amber" as ThemeName,
        Icon: BeakerIcon,
        summary: "Vector representations for retrieval, search, and ranking.",
        examples: ["gemini-2", "openai-3-small", "openai-3-large"],
        capabilities: ["text", "image", "audio", "video"],
    },
    {
        id: "realtime",
        label: "Realtime",
        theme: "green" as ThemeName,
        Icon: ClockIcon,
        summary: "Low-latency voice and multimodal sessions over WebSocket.",
        examples: ["gpt-realtime-2"],
        capabilities: ["voice", "websocket", "tools", "reasoning"],
    },
] as const;

const DEFAULT_MODEL_BY_CATEGORY: Record<ModelSelectorCategory, string> = {
    text: "openai",
    image: "zimage",
    video: "veo",
    audio: "elevenlabs",
    embedding: "openai-3-small",
    realtime: "gpt-realtime-2",
};

const MODEL_SELECTOR_CATEGORIES: ModelSelectorCategory[] = [
    "text",
    "image",
    "video",
    "audio",
    "embedding",
    "realtime",
];

const PROMPT_COMPOSER_CATEGORIES: ModelSelectorCategory[] = [
    "image",
    "text",
    "video",
    "audio",
];

const MODEL_SNIPPET = `import { fetchModelCatalog, generateText, generateImage } from "@pollinations/sdk";

const catalog = await fetchModelCatalog();
const textModels = catalog.models.filter((model) => model.category === "text");
const realtimeModels = catalog.models.filter((model) => model.category === "realtime");
const firstTextPrice = textModels[0]?.pricing?.promptTextTokens;

const answer = await generateText("Summarize this file", {
    model: "openai",
});

const image = await generateImage("A clean product dashboard", {
    model: "zimage",
    width: 1024,
    height: 1024,
});`;

function useModelCatalog() {
    const [models, setModels] = useState<ModelCatalogItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        setIsLoading(true);
        setError(null);

        fetchModelCatalog({ signal: controller.signal })
            .then((catalog) => setModels(catalog.models))
            .catch((reason: unknown) => {
                if (controller.signal.aborted) return;
                setError(
                    reason instanceof Error
                        ? reason.message
                        : "Could not load model catalog",
                );
            })
            .finally(() => {
                if (!controller.signal.aborted) setIsLoading(false);
            });

        return () => controller.abort();
    }, []);

    return { models, isLoading, error };
}

function displayCatalogName(model: ModelCatalogItem | undefined): string {
    return model?.name || model?.id || "";
}

function toModelSelectorItem(model: ModelCatalogItem): ModelSelectorItem {
    return {
        id: model.id,
        name: model.name,
        description: model.description,
        category: model.category,
        paidOnly: model.paid_only,
    };
}

function formatCatalogKey(value: string): string {
    return value.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

function formatList(values: readonly string[] | undefined): string {
    return values?.length ? values.join(", ") : "Not listed";
}

function formatModelLimit(model: ModelCatalogItem | undefined): string {
    if (model?.maxInputChars) {
        return `${model.maxInputChars.toLocaleString()} chars`;
    }
    if (model?.context_length) {
        return `${model.context_length.toLocaleString()} context`;
    }
    return "Not listed";
}

function formatPricing(model: ModelCatalogItem | undefined): string {
    const entries = Object.entries(model?.pricing ?? {}).filter(
        ([key]) => key !== "currency",
    );
    if (!entries.length) return "Not listed";

    return entries
        .map(([key, value]) => `${formatCatalogKey(key)}: ${value} pollen`)
        .join(", ");
}

function selectedCatalogModel(
    models: readonly ModelCatalogItem[],
    category: ModelSelectorCategory,
    selectedModelId: string,
): ModelCatalogItem | undefined {
    return (
        models.find((model) => model.id === selectedModelId) ??
        models.find((model) => model.category === category)
    );
}

function CatalogFact({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                {label}
            </p>
            <p className="mt-1 break-words text-sm leading-6 text-slate-700">
                {value}
            </p>
        </div>
    );
}

function ModelsPage() {
    const { models, isLoading, error } = useModelCatalog();
    const [category, setCategory] = useState<ModelSelectorCategory>("text");
    const [selectedByCategory, setSelectedByCategory] = useState(
        DEFAULT_MODEL_BY_CATEGORY,
    );
    const requestedModelId = selectedByCategory[category];
    const selectedModel = selectedCatalogModel(
        models,
        category,
        requestedModelId,
    );
    const selectedModelId = selectedModel?.id ?? requestedModelId;
    const categoryModels = models.filter(
        (model) => model.category === category,
    );
    const selectorModels = models.map(toModelSelectorItem);

    return (
        <>
            <PageIntro
                eyebrow="Catalog"
                title="Models"
                action={
                    <div className="flex flex-wrap justify-start gap-2 md:justify-end">
                        <ExternalLinkButton
                            theme={APP_THEME}
                            href="https://gen.pollinations.ai/models"
                        >
                            All
                        </ExternalLinkButton>
                        <ExternalLinkButton
                            theme={APP_THEME}
                            href="https://gen.pollinations.ai/text/models"
                        >
                            Text
                        </ExternalLinkButton>
                        <ExternalLinkButton
                            theme={APP_THEME}
                            href="https://gen.pollinations.ai/image/models"
                        >
                            Image/Video
                        </ExternalLinkButton>
                        <ExternalLinkButton
                            theme={APP_THEME}
                            href="https://gen.pollinations.ai/audio/models"
                        >
                            Audio
                        </ExternalLinkButton>
                        <ExternalLinkButton
                            theme={APP_THEME}
                            href="https://gen.pollinations.ai/embeddings/models"
                        >
                            Embeddings
                        </ExternalLinkButton>
                    </div>
                }
            >
                A compact view of Pollinations model families and the model
                selection primitives apps need before they generate text, image,
                video, audio, or embeddings.
            </PageIntro>

            <section>
                <SectionHeader title="Capabilities">
                    Start with the media types developers actually choose
                    between, then expose the selectors and SDK calls behind
                    them.
                </SectionHeader>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    {MODEL_GROUPS.map(({ Icon, ...group }) => (
                        <QuietPanel
                            key={group.id}
                            className="flex h-full flex-col gap-4"
                        >
                            <div
                                data-theme={group.theme}
                                className="flex items-center gap-3"
                            >
                                <span className="flex h-10 w-10 items-center justify-center rounded bg-theme-bg-active text-theme-text-strong">
                                    <Icon className="h-5 w-5" />
                                </span>
                                <h3 className="text-lg font-bold">
                                    {group.label}
                                </h3>
                            </div>
                            <p className="text-sm leading-6 text-slate-600">
                                {group.summary}
                            </p>
                            <div className="mt-auto flex flex-wrap gap-1.5">
                                {group.capabilities.map((capability) => (
                                    <Chip
                                        key={capability}
                                        theme={group.theme}
                                        size="sm"
                                    >
                                        {capability}
                                    </Chip>
                                ))}
                            </div>
                            <p className="text-xs leading-5 text-slate-500">
                                {group.examples.join(", ")}
                            </p>
                        </QuietPanel>
                    ))}
                </div>
            </section>

            <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
                <div className="min-w-0">
                    <SectionHeader title="Selector Pattern">
                        Use one selector component across media types. The same
                        state shape can drive prompt composers, settings panels,
                        and app defaults.
                    </SectionHeader>
                    <QuietPanel className="flex flex-col gap-5">
                        <ButtonGroup aria-label="Model category">
                            {MODEL_SELECTOR_CATEGORIES.map((item) => (
                                <TabButton
                                    key={item}
                                    active={category === item}
                                    theme={
                                        MODEL_GROUPS.find(
                                            (group) => group.id === item,
                                        )?.theme ?? APP_THEME
                                    }
                                    onClick={() => setCategory(item)}
                                >
                                    {item}
                                </TabButton>
                            ))}
                        </ButtonGroup>

                        {error ? (
                            <Alert intent="warning">
                                Model catalog unavailable: {error}
                            </Alert>
                        ) : null}

                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                    Selected model
                                </p>
                                <h3 className="mt-1 text-2xl font-bold">
                                    {displayCatalogName(selectedModel) ||
                                        selectedModelId}
                                </h3>
                                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
                                    {selectedModel?.description ??
                                        "Choose a model for this media type."}
                                </p>
                            </div>
                            <ModelSelector
                                models={selectorModels}
                                category={category}
                                value={selectedModelId}
                                isLoading={isLoading}
                                onChange={(modelId) =>
                                    setSelectedByCategory((current) => ({
                                        ...current,
                                        [category]: modelId,
                                    }))
                                }
                            />
                        </div>

                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <CatalogFact
                                label="input"
                                value={formatList(
                                    selectedModel?.input_modalities,
                                )}
                            />
                            <CatalogFact
                                label="output"
                                value={formatList(
                                    selectedModel?.output_modalities,
                                )}
                            />
                            <CatalogFact
                                label="limit"
                                value={formatModelLimit(selectedModel)}
                            />
                            <CatalogFact
                                label="pricing"
                                value={formatPricing(selectedModel)}
                            />
                        </div>

                        <ScrollArea axis="x">
                            <Table className="min-w-[860px]">
                                <TableHead>
                                    <tr>
                                        <TableHeaderCell>Model</TableHeaderCell>
                                        <TableHeaderCell>Input</TableHeaderCell>
                                        <TableHeaderCell>
                                            Output
                                        </TableHeaderCell>
                                        <TableHeaderCell>Limit</TableHeaderCell>
                                        <TableHeaderCell>
                                            Pricing
                                        </TableHeaderCell>
                                    </tr>
                                </TableHead>
                                <TableBody>
                                    {categoryModels.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} muted>
                                                {isLoading
                                                    ? "Loading catalog..."
                                                    : "No models listed for this category."}
                                            </TableCell>
                                        </TableRow>
                                    ) : null}
                                    {categoryModels.map((model) => (
                                        <TableRow key={model.id}>
                                            <TableCell>
                                                <span className="font-semibold">
                                                    {displayCatalogName(model)}
                                                </span>
                                                {model.paid_only ? (
                                                    <Chip
                                                        size="sm"
                                                        className="ml-2"
                                                    >
                                                        paid
                                                    </Chip>
                                                ) : null}
                                            </TableCell>
                                            <TableCell muted>
                                                {formatList(
                                                    model.input_modalities,
                                                )}
                                            </TableCell>
                                            <TableCell muted>
                                                {formatList(
                                                    model.output_modalities,
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {formatModelLimit(model)}
                                            </TableCell>
                                            <TableCell>
                                                {formatPricing(model)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                    </QuietPanel>
                </div>
                <CodePanel
                    title="SDK first, React where it helps"
                    caption="The catalog can show both API and React usage."
                    code={MODEL_SNIPPET}
                />
            </section>
        </>
    );
}

const PRIMITIVE_GROUPS = [
    {
        title: "Actions",
        description:
            "Buttons, chips, links, icon buttons, and copy affordances.",
    },
    {
        title: "Inputs",
        description: "Text, textarea, sliders, switches, and grouped fields.",
    },
    {
        title: "Selection",
        description: "Tabs, multiselects, dropdowns, and period ranges.",
    },
    {
        title: "Data",
        description: "Tables, stats, alerts, tooltips, and scroll containers.",
    },
] as const;

function PrimitivesPage() {
    const [selected, setSelected] = useState(["text", "image"]);
    const [slider, setSlider] = useState(48);
    const [enabled, setEnabled] = useState(true);
    const [period, setPeriod] = useState<PeriodSelection>(() =>
        currentPeriod(),
    );

    return (
        <>
            <PageIntro eyebrow="UI System" title="Primitives">
                Curated building blocks for Pollinations apps: actions, inputs,
                selection controls, feedback, and dense data surfaces.
            </PageIntro>

            <section>
                <SectionHeader title="Primitive Families">
                    The essentials stay grouped by workflow instead of exposed
                    as a raw export inventory.
                </SectionHeader>
                <div className="grid gap-3 md:grid-cols-4">
                    {PRIMITIVE_GROUPS.map((group) => (
                        <QuietPanel key={group.title}>
                            <h3 className="font-bold">{group.title}</h3>
                            <p className="mt-2 text-sm leading-6 text-slate-600">
                                {group.description}
                            </p>
                        </QuietPanel>
                    ))}
                </div>
            </section>

            <section className="grid gap-5 lg:grid-cols-2">
                <div>
                    <SectionHeader title="Controls">
                        The examples stay close to product screens: prompt
                        input, model settings, and compact actions.
                    </SectionHeader>
                    <QuietPanel className="flex flex-col gap-5">
                        <div className="grid gap-4 md:grid-cols-2">
                            <label
                                className="flex flex-col gap-1"
                                htmlFor="primitive-prompt"
                            >
                                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                    Prompt
                                </span>
                                <Input
                                    id="primitive-prompt"
                                    placeholder="Describe an image"
                                />
                            </label>
                            <label
                                className="flex flex-col gap-1"
                                htmlFor="primitive-seed"
                            >
                                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                    Seed
                                </span>
                                <Input
                                    id="primitive-seed"
                                    type="number"
                                    hideNumberSteppers
                                    placeholder="12345"
                                />
                            </label>
                        </div>
                        <label
                            className="flex flex-col gap-1"
                            htmlFor="primitive-system-prompt"
                        >
                            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                System prompt
                            </span>
                            <Textarea
                                id="primitive-system-prompt"
                                rows={4}
                                placeholder="You are a direct assistant."
                            />
                        </label>
                        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
                            <div>
                                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                                    Quality {slider}
                                </p>
                                <Slider
                                    min={0}
                                    max={100}
                                    value={slider}
                                    aria-label="Quality"
                                    onChange={(event) =>
                                        setSlider(
                                            Number(event.currentTarget.value),
                                        )
                                    }
                                />
                            </div>
                            <div className="flex items-center gap-3">
                                <Switch
                                    checked={enabled}
                                    status={enabled ? "on" : "off"}
                                    ariaLabel="Private generation"
                                    onChange={setEnabled}
                                />
                                <span className="text-sm font-medium">
                                    Private
                                </span>
                            </div>
                        </div>
                        <ButtonGroup aria-label="Actions">
                            <Button>Generate</Button>
                            <Button theme="teal">Save preset</Button>
                            <IconButton title="Copy" onClick={() => undefined}>
                                <ClipboardIcon className="h-3.5 w-3.5" />
                            </IconButton>
                            <Tooltip content="Ready to run" triggerAs="span">
                                <Chip intent="success">Ready</Chip>
                            </Tooltip>
                        </ButtonGroup>
                    </QuietPanel>
                </div>

                <div>
                    <SectionHeader title="Selection and Feedback">
                        Dense controls should feel calm when they appear inside
                        real generation and account surfaces.
                    </SectionHeader>
                    <QuietPanel className="flex flex-col gap-5">
                        <div>
                            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                                Modalities
                            </p>
                            <MultiSelect
                                options={[
                                    { value: "text", label: "Text" },
                                    { value: "image", label: "Image" },
                                    { value: "video", label: "Video" },
                                    { value: "audio", label: "Audio" },
                                ]}
                                selected={selected}
                                onChange={setSelected}
                                label="Types"
                                placeholder="All"
                                theme={APP_THEME}
                            />
                        </div>
                        <div>
                            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                                Period
                            </p>
                            <PeriodPicker
                                value={period}
                                onChange={setPeriod}
                                theme={APP_THEME}
                            />
                        </div>
                        <Alert title="Synced">
                            Model metadata and account state share the same
                            compact feedback primitives.
                        </Alert>
                        <div className="grid gap-3 sm:grid-cols-3">
                            <StatCard
                                label="Requests"
                                value="22.1k"
                                detail="last 7 days"
                                className="rounded-lg bg-slate-50 p-4"
                            />
                            <StatCard
                                label="Success"
                                value="99.9%"
                                detail="healthy"
                                className="rounded-lg bg-slate-50 p-4"
                            />
                            <StatCard
                                label="Latency"
                                value="1.2s"
                                detail="median"
                                className="rounded-lg bg-slate-50 p-4"
                            />
                        </div>
                    </QuietPanel>
                </div>
            </section>
        </>
    );
}

function DashboardLink() {
    const { enterUrl } = useAuthActions();
    return (
        <ExternalLinkButton theme={APP_THEME} href={enterUrl}>
            Dashboard
        </ExternalLinkButton>
    );
}

function AccountComposition() {
    const { enterUrl } = useAuthActions();

    return (
        <QuietPanel className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h3 className="font-bold">Auth and account menu</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                        Live SDK wrappers plus a compact signed-in preview.
                    </p>
                </div>
                <AppUserMenu dashboardHref={enterUrl} />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                        Live state
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                        <WhenLoggedOut>
                            <LoginButton theme={APP_THEME}>
                                Log in with Pollinations
                            </LoginButton>
                        </WhenLoggedOut>
                        <WhenLoggedIn>
                            <DashboardLink />
                            <LogoutButton theme={APP_THEME} intent="danger">
                                Log out
                            </LogoutButton>
                        </WhenLoggedIn>
                    </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                        Signed-in shape
                    </p>
                    <div className="flex items-center gap-3">
                        <UserAvatar size="md" />
                        <div className="min-w-0">
                            <WhenLoggedIn>
                                <UserName className="block truncate font-semibold" />
                                <UserEmail className="block truncate text-sm text-slate-500" />
                            </WhenLoggedIn>
                            <WhenLoggedOut>
                                <p className="font-semibold">
                                    Pollinations user
                                </p>
                                <p className="text-sm text-slate-500">
                                    user@example.com
                                </p>
                            </WhenLoggedOut>
                        </div>
                    </div>
                </div>
            </div>
        </QuietPanel>
    );
}

function PromptComposerComposition() {
    const { models, isLoading } = useModelCatalog();
    const [category, setCategory] = useState<ModelSelectorCategory>("image");
    const [selectedByCategory, setSelectedByCategory] = useState(
        DEFAULT_MODEL_BY_CATEGORY,
    );
    const requestedModelId = selectedByCategory[category];
    const selectedModelId =
        selectedCatalogModel(models, category, requestedModelId)?.id ??
        requestedModelId;
    const selectorModels = models.map(toModelSelectorItem);

    return (
        <QuietPanel className="flex flex-col gap-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h3 className="font-bold">Prompt composer</h3>
                    <p className="mt-1 max-w-xl text-sm leading-6 text-slate-600">
                        A reusable composition for model selection, prompt
                        input, settings, and generation action.
                    </p>
                </div>
                <ModelSelector
                    models={selectorModels}
                    category={category}
                    value={selectedModelId}
                    isLoading={isLoading}
                    onChange={(modelId) =>
                        setSelectedByCategory((current) => ({
                            ...current,
                            [category]: modelId,
                        }))
                    }
                />
            </div>

            <ButtonGroup aria-label="Composer media type">
                {PROMPT_COMPOSER_CATEGORIES.map((item) => (
                    <TabButton
                        key={item}
                        active={category === item}
                        theme={
                            MODEL_GROUPS.find((group) => group.id === item)
                                ?.theme ?? APP_THEME
                        }
                        onClick={() => setCategory(item)}
                    >
                        {item}
                    </TabButton>
                ))}
            </ButtonGroup>

            <Textarea
                rows={5}
                placeholder="A precise, minimal interface for exploring model output"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                    <Chip theme="pink">reference image</Chip>
                    <Chip theme="teal">16:9</Chip>
                    <Chip theme="amber">seeded</Chip>
                </div>
                <Button theme={APP_THEME}>Generate</Button>
            </div>
        </QuietPanel>
    );
}

function UsageComposition() {
    return (
        <QuietPanel className="flex flex-col gap-5">
            <div>
                <h3 className="font-bold">Wallet and access summary</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                    This is where auth, billing, access, and usage primitives
                    become a useful product surface.
                </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                        Balance
                    </p>
                    <WhenLoggedIn>
                        <Balance className="mt-3" />
                    </WhenLoggedIn>
                    <WhenLoggedOut>
                        <p className="mt-3 text-2xl font-bold">24.8 Pollen</p>
                    </WhenLoggedOut>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                        Key
                    </p>
                    <WhenLoggedIn>
                        <KeyPrefix className="mt-3" />
                    </WhenLoggedIn>
                    <WhenLoggedOut>
                        <p className="mt-3 font-mono text-lg font-bold">
                            sk_live...
                        </p>
                    </WhenLoggedOut>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                        Remaining
                    </p>
                    <WhenLoggedIn>
                        <KeyBudget className="mt-3" />
                    </WhenLoggedIn>
                    <WhenLoggedOut>
                        <p className="mt-3 text-2xl font-bold">183.4</p>
                    </WhenLoggedOut>
                </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                        Access
                    </p>
                    <WhenLoggedIn>
                        <KeyModels />
                    </WhenLoggedIn>
                    <WhenLoggedOut>
                        <div className="flex flex-wrap gap-2">
                            {["openai", "zimage", "flux", "veo"].map(
                                (model) => (
                                    <Chip key={model} size="sm">
                                        {model}
                                    </Chip>
                                ),
                            )}
                        </div>
                    </WhenLoggedOut>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                        Expires
                    </p>
                    <WhenLoggedIn>
                        <KeyExpiry />
                    </WhenLoggedIn>
                    <WhenLoggedOut>
                        <p className="text-sm text-slate-600">
                            No expiration on this app key.
                        </p>
                    </WhenLoggedOut>
                </div>
            </div>
        </QuietPanel>
    );
}

const COMPOSITION_SNIPPET = `import "@pollinations/ui/styles.css";
import { fetchModelCatalog } from "@pollinations/sdk";
import { PolliProvider } from "@pollinations/sdk/react";
import { ModelSelector } from "@pollinations/ui/models";
import { LoginButton, WhenLoggedOut } from "@pollinations/ui/auth/sdk";

const catalog = await fetchModelCatalog();
const models = catalog.models.map((model) => ({
    id: model.id,
    name: model.name,
    description: model.description,
    category: model.category,
    paidOnly: model.paid_only,
}));

export function App() {
    return (
        <PolliProvider appKey="pk_your_key" permissions={["profile"]}>
            <WhenLoggedOut>
                <LoginButton>Authorize app</LoginButton>
            </WhenLoggedOut>
            <ModelSelector
                models={models}
                category="image"
                value={model}
                onChange={setModel}
            />
        </PolliProvider>
    );
}`;

function CompositionsPage() {
    return (
        <>
            <PageIntro eyebrow="Product Patterns" title="Compositions">
                Compositions show how primitives, models, auth, and wallet
                pieces combine into real application modules. React is a code
                path inside these modules, not a separate content silo.
            </PageIntro>

            <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
                <div className="flex min-w-0 flex-col gap-5">
                    <AccountComposition />
                    <PromptComposerComposition />
                    <UsageComposition />
                </div>
                <div className="flex min-w-0 flex-col gap-5">
                    <CodePanel
                        title="React composition"
                        caption="React usage inside the composition."
                        code={COMPOSITION_SNIPPET}
                    />
                    <QuietPanel className="flex flex-col gap-3">
                        <h3 className="font-bold">Composition Checklist</h3>
                        <Markdown className="text-sm text-slate-600">
                            {[
                                "- Uses package primitives for common controls",
                                "- Shows model selection before generation",
                                "- Keeps account state close to spend/access UI",
                                "- Offers copyable React and SDK code where useful",
                            ].join("\n")}
                        </Markdown>
                    </QuietPanel>
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
            className="flex h-dvh min-h-0 flex-col overflow-hidden bg-[#f7fbf5]"
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
