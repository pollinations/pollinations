import {
    Alert,
    AppIcon,
    Field as ArkField,
    BeakerIcon,
    BookIcon,
    Button,
    ButtonGroup,
    CheckIcon,
    ChevronIcon,
    Chip,
    ClipboardIcon,
    ClockIcon,
    Collapsible,
    CopyButton,
    currentPeriod,
    Dialog,
    DialogTitle,
    DiscordIcon,
    DownloadIcon,
    Dropdown,
    ExternalLinkButton,
    ExternalLinkIcon,
    GenApiIcon,
    GitHubIcon,
    IconButton,
    type IconProps,
    ImageIcon,
    InfoTip,
    Input,
    LockIcon,
    MailIcon,
    McpIcon,
    MenuIcon,
    MultiSelect,
    PeriodPicker,
    type PeriodSelection,
    Section as PrimitiveSection,
    ScrollArea,
    Slider,
    StatCard,
    Surface,
    Switch,
    type SwitchStatus,
    TabButton,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
    TerminalIcon,
    type ThemeName,
    TokensIcon,
    Tooltip,
    TrendUpIcon,
    themes,
    WalletIcon,
    XIcon,
} from "@pollinations/ui";
import { AuthInfoCard, ErrorBanner } from "@pollinations/ui/auth";
import { getModalityColors } from "@pollinations/ui/modality";
import {
    formatPollen,
    PaidChip,
    TierChip,
    WalletBalanceCard,
    WalletDot,
} from "@pollinations/ui/wallet";
import {
    type ComponentType,
    type FC,
    type ReactNode,
    useEffect,
    useState,
} from "react";

/**
 * App-owned design primitive showcase.
 *
 * This demo composes public @pollinations/ui exports only; it is deliberately
 * kept outside the package so the published library stays primitive/module-only.
 */
export type DesignShowcaseProps = {
    headerSlot?: ReactNode;
    hideHeader?: boolean;
    hideThemeTabs?: boolean;
    theme?: ThemeName;
    onThemeChange?: (theme: ThemeName) => void;
};

export const DesignShowcase: FC<DesignShowcaseProps> = ({
    headerSlot,
    hideHeader = false,
    hideThemeTabs = false,
    theme: controlledTheme,
    onThemeChange,
}) => {
    const [internalTheme, setInternalTheme] = useState<ThemeName>("amber");
    const theme = controlledTheme ?? internalTheme;
    const setTheme = onThemeChange ?? setInternalTheme;

    useEffect(() => {
        document.documentElement.classList.add("polli-ui-root");
        document.documentElement.classList.add("polli-ui-shell");
        document.body.classList.add("polli-ui-shell");
        return () => {
            document.documentElement.classList.remove("polli-ui-root");
            document.documentElement.classList.remove("polli-ui-shell");
            document.body.classList.remove("polli-ui-shell");
        };
    }, []);

    return (
        <ScrollArea
            theme={theme}
            data-theme={theme}
            className={`w-full overflow-x-hidden bg-emerald-100 text-theme-text-base ${
                hideHeader ? "min-h-0 flex-1" : "h-dvh"
            }`}
        >
            {hideHeader && (headerSlot || !hideThemeTabs) ? (
                <div className="mx-auto flex w-full max-w-[1220px] flex-col gap-4 px-5 pt-8">
                    {headerSlot ? headerSlot : null}
                    {!hideThemeTabs ? (
                        <ThemeTabs
                            value={theme}
                            options={themes}
                            onChange={setTheme}
                        />
                    ) : null}
                </div>
            ) : !hideHeader ? (
                <Header
                    theme={theme}
                    onThemeChange={setTheme}
                    headerSlot={headerSlot}
                />
            ) : null}
            <div className="mx-auto flex w-full max-w-[1220px] flex-col gap-8 px-5 pt-8 pb-10">
                <main className="flex min-w-0 flex-col gap-10">
                    <CoverageDemo />
                    <TypographyDemo />
                    <ThemeDemo theme={theme} onThemeChange={setTheme} />
                    <TokensDemo />
                    <IconsDemo />
                    <ButtonsDemo theme={theme} />
                    <InputsDemo />
                    <SelectionDemo theme={theme} />
                    <OverlaysDemo theme={theme} />
                    <LayoutDemo theme={theme} />
                    <FeedbackDemo />
                    <ModuleRecipesDemo />
                </main>
            </div>
        </ScrollArea>
    );
};

type HeaderProps = {
    theme: ThemeName;
    onThemeChange: (theme: ThemeName) => void;
    headerSlot?: ReactNode;
};

const Header: FC<HeaderProps> = ({ theme, onThemeChange, headerSlot }) => (
    <header className="sticky top-0 z-20 border-b border-green-950/10 bg-emerald-100 px-5 py-4 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1220px] min-w-0 flex-col items-start gap-4">
            <div className="flex w-full min-w-0 flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                    <h1 className="font-serif text-2xl font-black text-theme-text-strong">
                        Design Showcase
                    </h1>
                    <p className="max-w-3xl text-sm leading-6 text-theme-text-soft">
                        Package primitives, icons, tokens, and SDK-free recipes.
                    </p>
                </div>
                {headerSlot ? (
                    <div className="w-full md:w-auto">{headerSlot}</div>
                ) : null}
            </div>
            <ThemeTabs
                value={theme}
                options={themes}
                onChange={onThemeChange}
            />
        </div>
    </header>
);

type ThemeTabsProps = {
    value: ThemeName;
    options: readonly ThemeName[];
    onChange: (value: ThemeName) => void;
};

const ThemeTabs: FC<ThemeTabsProps> = ({ value, options, onChange }) => (
    <div className="flex min-w-0 max-w-full flex-col items-start gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-theme-text-strong">
            Theme
        </span>
        <div className="flex w-full max-w-full flex-wrap gap-1.5">
            {options.map((option) => (
                <TabButton
                    key={option}
                    active={value === option}
                    onClick={() => onChange(option)}
                    theme={option}
                    size="small"
                >
                    <span className="capitalize">{option}</span>
                </TabButton>
            ))}
        </div>
    </div>
);

type ShowcaseSectionProps = {
    id: string;
    title: string;
    caption: string;
    children: ReactNode;
};

const ShowcaseSection: FC<ShowcaseSectionProps> = ({
    id,
    title,
    caption,
    children,
}) => (
    <section
        id={id}
        className="flex w-full min-w-0 scroll-mt-24 flex-col gap-3"
    >
        <div className="flex flex-col gap-1">
            <h2 className="font-serif text-2xl font-black text-theme-text-strong">
                {title}
            </h2>
            <p className="max-w-3xl break-words text-sm leading-6 text-theme-text-soft [overflow-wrap:anywhere]">
                {caption}
            </p>
        </div>
        {children}
    </section>
);

const Row: FC<{ label: string; children: ReactNode }> = ({
    label,
    children,
}) => (
    <Surface
        variant="card-themed"
        className="flex flex-wrap items-center gap-3"
    >
        <span className="w-44 shrink-0 text-xs font-semibold uppercase tracking-wide text-theme-text-strong">
            {label}
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            {children}
        </div>
    </Surface>
);

const ControlGroup: FC<{ label: string; children: ReactNode }> = ({
    label,
    children,
}) => (
    <div className="flex min-w-0 flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-theme-text-strong">
            {label}
        </span>
        {children}
    </div>
);

const primitiveNames = [
    "Alert",
    "Button",
    "ButtonGroup",
    "ChevronIcon",
    "Chip",
    "Collapsible",
    "CopyButton",
    "Dialog",
    "DialogTitle",
    "Dropdown",
    "ExternalLinkButton",
    "Field",
    "IconButton",
    "InfoTip",
    "Input",
    "MultiSelect",
    "PeriodPicker",
    "ScrollArea",
    "Section",
    "Slider",
    "StatCard",
    "Surface",
    "Switch",
    "TabButton",
    "Table",
    "TableBody",
    "TableCell",
    "TableHead",
    "TableHeaderCell",
    "TableRow",
    "Tooltip",
] as const;

const moduleNames = [
    "AuthInfoCard",
    "ErrorBanner",
    "getModalityColors",
    "PaidChip",
    "TierChip",
    "WalletBalanceCard",
    "WalletDot",
    "formatPollen",
] as const;

const CoverageDemo: FC = () => (
    <ShowcaseSection
        id="coverage"
        title="Coverage"
        caption="Every SDK-free primitive exported from the package appears below, plus the icon set and reusable module recipes."
    >
        <Surface
            variant="panel"
            className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3"
        >
            <StatCard
                label="Primitives"
                value={primitiveNames.length}
                detail="Buttons, inputs, overlays, layout, and feedback."
                className="rounded-xl bg-surface-white p-4"
            />
            <StatCard
                label="Icons"
                value={iconItems.length + 1}
                detail="All exported icons plus the canonical chevron."
                className="rounded-xl bg-surface-white p-4"
            />
            <StatCard
                label="Recipes"
                value={moduleNames.length}
                detail="Auth, wallet, and modality pieces without SDK state."
                className="rounded-xl bg-surface-white p-4"
            />
            <Surface className="col-span-full flex flex-wrap gap-2">
                {primitiveNames.map((name) => (
                    <Chip key={name} size="sm">
                        {name}
                    </Chip>
                ))}
            </Surface>
        </Surface>
    </ShowcaseSection>
);

const typographyRows = [
    {
        label: "Heading",
        className: "font-heading text-4xl",
        sample: "Pollinations",
    },
    {
        label: "Subheading",
        className: "font-subheading text-3xl",
        sample: "Reusable UI",
    },
    {
        label: "Body",
        className: "font-body text-base",
        sample: "Clear defaults for product surfaces.",
    },
    {
        label: "Pixel",
        className: "font-pixel text-base",
        sample: "API 200 OK",
    },
    {
        label: "Micro",
        className: "font-body text-micro uppercase",
        sample: "Status label",
    },
] as const;

const textRows = [
    ["strong", "text-theme-text-strong"],
    ["base", "text-theme-text-base"],
    ["soft", "text-theme-text-soft"],
    ["muted", "text-theme-text-muted"],
] as const;

const TypographyDemo: FC = () => (
    <ShowcaseSection
        id="type"
        title="Typography"
        caption="Font, size, and semantic text color utilities backed by package tokens."
    >
        <Surface variant="panel" className="flex flex-col gap-3">
            {typographyRows.map((row) => (
                <div
                    key={row.label}
                    className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-theme-border pb-3 last:border-b-0 last:pb-0"
                >
                    <span
                        className={`w-80 shrink-0 text-theme-text-strong ${row.className}`}
                    >
                        {row.sample}
                    </span>
                    <code className="w-36 shrink-0 font-mono text-xs text-theme-text-strong">
                        {row.label}
                    </code>
                    <span className="min-w-0 flex-1 text-xs text-theme-text-soft">
                        {row.className}
                    </span>
                </div>
            ))}
            <div className="flex flex-wrap gap-2 pt-1">
                {textRows.map(([label, className]) => (
                    <span
                        key={label}
                        className={`rounded-lg bg-theme-bg-pale px-3 py-1 text-sm ${className}`}
                    >
                        text-{label}
                    </span>
                ))}
            </div>
        </Surface>
    </ShowcaseSection>
);

const ThemeDemo: FC<HeaderProps> = ({ theme, onThemeChange }) => (
    <ShowcaseSection
        id="themes"
        title="Themes"
        caption="The theme cascade is driven by data-theme on any ancestor or by component theme props."
    >
        <Surface
            variant="panel"
            className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3"
        >
            {themes.map((item) => (
                <button
                    key={item}
                    type="button"
                    data-theme={item}
                    aria-pressed={theme === item}
                    onClick={() => onThemeChange(item)}
                    className="flex min-w-0 flex-col gap-2 rounded-xl border border-theme-border bg-theme-bg-subtle p-3 text-left transition-colors hover:bg-theme-bg-pale"
                >
                    <span className="text-sm font-bold capitalize text-theme-text-strong">
                        {item}
                    </span>
                    <span className="flex h-8 overflow-hidden rounded-lg">
                        <span className="flex-1 bg-theme-bg-subtle" />
                        <span className="flex-1 bg-theme-bg-active" />
                        <span className="flex-1 bg-theme-bg-hover" />
                        <span className="flex-1 bg-theme-bg-pale" />
                    </span>
                    <span className="text-xs text-theme-text-soft">
                        {theme === item ? "Selected" : "Preview"}
                    </span>
                </button>
            ))}
        </Surface>
    </ShowcaseSection>
);

const tokenRows = [
    ["text-base", "var(--polli-color-text-base)", "bg-theme-text-base"],
    ["text-strong", "var(--polli-color-text-strong)", "bg-theme-text-strong"],
    ["text-soft", "var(--polli-color-text-soft)", "bg-theme-text-soft"],
    ["text-muted", "var(--polli-color-text-muted)", "bg-theme-text-muted"],
    ["border", "var(--polli-color-border)", "bg-theme-border"],
    ["bg-subtle", "var(--polli-color-bg-subtle)", "bg-theme-bg-subtle"],
    ["bg-active", "var(--polli-color-bg-active)", "bg-theme-bg-active"],
    ["bg-hover", "var(--polli-color-bg-hover)", "bg-theme-bg-hover"],
    ["bg-pale", "var(--polli-color-bg-pale)", "bg-theme-bg-pale"],
    [
        "danger-bg",
        "var(--polli-color-danger-bg-light)",
        "bg-intent-danger-bg-light",
    ],
    [
        "success-bg",
        "var(--polli-color-success-bg-light)",
        "bg-intent-success-bg-light",
    ],
    [
        "warning-bg",
        "var(--polli-color-warning-bg-light)",
        "bg-intent-warning-bg-light",
    ],
] as const;

const TokensDemo: FC = () => (
    <ShowcaseSection
        id="tokens"
        title="Tokens"
        caption="Public CSS variables and utility bridges used by the primitives."
    >
        <Surface
            variant="panel"
            className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-3"
        >
            {tokenRows.map(([name, variable, swatchClass]) => (
                <Surface key={name} className="flex items-center gap-3">
                    <span
                        className={`h-10 w-10 shrink-0 rounded-lg border border-theme-border ${swatchClass}`}
                    />
                    <span className="min-w-0">
                        <span className="block text-sm font-bold text-theme-text-strong">
                            {name}
                        </span>
                        <code className="block truncate text-xs text-theme-text-soft">
                            {variable}
                        </code>
                    </span>
                </Surface>
            ))}
        </Surface>
    </ShowcaseSection>
);

type IconItem = {
    name: string;
    Icon: ComponentType<IconProps>;
};

const iconItems: readonly IconItem[] = [
    { name: "AppIcon", Icon: AppIcon },
    { name: "BeakerIcon", Icon: BeakerIcon },
    { name: "BookIcon", Icon: BookIcon },
    { name: "CheckIcon", Icon: CheckIcon },
    { name: "ClipboardIcon", Icon: ClipboardIcon },
    { name: "ClockIcon", Icon: ClockIcon },
    { name: "DiscordIcon", Icon: DiscordIcon },
    { name: "DownloadIcon", Icon: DownloadIcon },
    { name: "ExternalLinkIcon", Icon: ExternalLinkIcon },
    { name: "GenApiIcon", Icon: GenApiIcon },
    { name: "GitHubIcon", Icon: GitHubIcon },
    { name: "ImageIcon", Icon: ImageIcon },
    { name: "LockIcon", Icon: LockIcon },
    { name: "MailIcon", Icon: MailIcon },
    { name: "McpIcon", Icon: McpIcon },
    { name: "MenuIcon", Icon: MenuIcon },
    { name: "TerminalIcon", Icon: TerminalIcon },
    { name: "TokensIcon", Icon: TokensIcon },
    { name: "TrendUpIcon", Icon: TrendUpIcon },
    { name: "WalletIcon", Icon: WalletIcon },
    { name: "XIcon", Icon: XIcon },
];

const IconsDemo: FC = () => (
    <ShowcaseSection
        id="icons"
        title="Icons"
        caption="Every exported SVG icon appears here with the same currentColor contract used by buttons and links."
    >
        <Surface
            variant="panel"
            className="grid gap-3"
            style={{
                gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
            }}
        >
            {iconItems.map(({ name, Icon }) => (
                <Surface key={name} className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-theme-bg-pale text-theme-text-strong">
                        <Icon className="h-5 w-5" />
                    </span>
                    <code className="min-w-0 whitespace-nowrap text-xs text-theme-text-strong">
                        {name}
                    </code>
                </Surface>
            ))}
            <Surface className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-theme-bg-pale text-theme-text-strong">
                    <ChevronIcon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                    <code className="block whitespace-nowrap text-xs text-theme-text-strong">
                        ChevronIcon
                    </code>
                    <span className="mt-1 flex gap-2 text-theme-text-soft">
                        <ChevronIcon />
                        <ChevronIcon expanded />
                    </span>
                </span>
            </Surface>
        </Surface>
    </ShowcaseSection>
);

const ButtonsDemo: FC<{ theme: ThemeName }> = ({ theme }) => (
    <ShowcaseSection
        id="buttons"
        title="Buttons"
        caption="Button, link, icon, copy, chip, and tab affordances in their supported states."
    >
        <div className="flex flex-col gap-3">
            <Row label="Button">
                <Button>Default</Button>
                <Button size="small">Small</Button>
                <Button size="large">Large</Button>
                <Button theme="blue">Theme prop</Button>
                <Button disabled>Disabled</Button>
                <Button intent="danger">Delete</Button>
            </Row>
            <Row label="External link">
                <ExternalLinkButton
                    theme={theme}
                    href="https://pollinations.ai"
                >
                    Pollinations
                </ExternalLinkButton>
                <ExternalLinkButton
                    theme={theme}
                    href="https://pollinations.ai"
                    size="small"
                >
                    Small link
                </ExternalLinkButton>
            </Row>
            <Row label="Icon button">
                <IconButton title="Copy" onClick={noop}>
                    <ClipboardIcon className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton title="Open" onClick={noop}>
                    <ExternalLinkIcon className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton title="Delete" intent="danger" onClick={noop}>
                    <XIcon className="h-3.5 w-3.5" />
                </IconButton>
            </Row>
            <Row label="Copy button">
                <CopyButton
                    value="pk_showcase_123"
                    className={(copied) =>
                        `inline-flex h-8 items-center gap-2 rounded-full px-3 text-sm font-medium transition-colors ${
                            copied
                                ? "bg-green-100 text-green-800"
                                : "bg-theme-bg-active text-theme-text-strong"
                        }`
                    }
                >
                    {(copied) => (
                        <>
                            {copied ? (
                                <CheckIcon className="h-4 w-4" />
                            ) : (
                                <ClipboardIcon className="h-4 w-4" />
                            )}
                            {copied ? "Copied" : "Copy key"}
                        </>
                    )}
                </CopyButton>
            </Row>
            <Row label="Tab button">
                <TabButton active onClick={noop}>
                    Active
                </TabButton>
                <TabButton active={false} onClick={noop}>
                    Inactive
                </TabButton>
                <TabButton active={false} disabled onClick={noop}>
                    Disabled
                </TabButton>
            </Row>
            <Row label="Chip">
                <Chip>Default</Chip>
                <Chip size="sm">Small</Chip>
                <Chip size="lg">Large</Chip>
                <Chip intent="news">NEW</Chip>
                <Chip intent="alpha">ALPHA</Chip>
                <Chip intent="neutral">Neutral</Chip>
                <Chip intent="success">Success</Chip>
                <Chip intent="warning">Warning</Chip>
                <Chip intent="danger">Danger</Chip>
                {themes.map((theme) => (
                    <Chip key={theme} theme={theme}>
                        {theme}
                    </Chip>
                ))}
            </Row>
        </div>
    </ShowcaseSection>
);

const InputsDemo: FC = () => {
    const [sliderValue, setSliderValue] = useState(35);
    const [switches, setSwitches] = useState<Record<SwitchStatus, boolean>>({
        off: false,
        on: true,
        invalid: true,
    });

    return (
        <ShowcaseSection
            id="inputs"
            title="Inputs"
            caption="Text, number, field composition, range, and binary toggle primitives."
        >
            <Surface
                variant="panel"
                className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4"
            >
                <ControlGroup label="Input">
                    <Input placeholder="Name" />
                </ControlGroup>
                <ControlGroup label="Number">
                    <Input type="number" placeholder="100" hideNumberSteppers />
                </ControlGroup>
                <ControlGroup label="Error">
                    <Input placeholder="Invalid" error />
                </ControlGroup>
                <ControlGroup label="Disabled">
                    <Input placeholder="Disabled" disabled />
                </ControlGroup>
                <div className="col-span-full">
                    <ArkField.Root
                        invalid
                        className="flex max-w-xl flex-col gap-1"
                    >
                        <ArkField.Label className="text-xs font-semibold uppercase tracking-wide text-theme-text-strong">
                            Field
                            <ArkField.RequiredIndicator className="ml-1 text-intent-danger-text" />
                        </ArkField.Label>
                        <ArkField.Input
                            placeholder="email@example.com"
                            className="rounded-lg border border-intent-danger-border bg-white px-3 py-2 text-sm"
                        />
                        <ArkField.HelperText className="text-xs text-theme-text-soft">
                            Exported Ark field namespace with package styling.
                        </ArkField.HelperText>
                        <ArkField.ErrorText className="text-xs font-medium text-intent-danger-text">
                            Enter a valid email address.
                        </ArkField.ErrorText>
                    </ArkField.Root>
                </div>
                <div className="col-span-full">
                    <ControlGroup label={`Slider ${sliderValue}`}>
                        <Slider
                            min={0}
                            max={100}
                            value={sliderValue}
                            aria-label="Slider"
                            onChange={(event) =>
                                setSliderValue(
                                    Number(event.currentTarget.value),
                                )
                            }
                        />
                    </ControlGroup>
                </div>
                <div className="col-span-full flex flex-wrap gap-5">
                    {switchStatuses.map((status) => (
                        <div key={status} className="flex flex-col gap-1">
                            <span className="text-xs font-semibold uppercase tracking-wide text-theme-text-strong">
                                {status}
                            </span>
                            <Switch
                                checked={switches[status]}
                                status={status}
                                ariaLabel={`${status} switch`}
                                onChange={(checked) =>
                                    setSwitches((current) => ({
                                        ...current,
                                        [status]: checked,
                                    }))
                                }
                            />
                        </div>
                    ))}
                    <div className="flex flex-col gap-1">
                        <span className="text-xs font-semibold uppercase tracking-wide text-theme-text-strong">
                            disabled
                        </span>
                        <Switch
                            checked
                            disabled
                            status="on"
                            ariaLabel="Disabled switch"
                            onChange={noopSwitch}
                        />
                    </div>
                </div>
            </Surface>
        </ShowcaseSection>
    );
};

const switchStatuses: readonly SwitchStatus[] = ["off", "on", "invalid"];

const selectionOptions = [
    { value: "images", label: "Images" },
    { value: "text", label: "Text" },
    { value: "audio", label: "Audio" },
    { value: "video", label: "Video" },
    { value: "embeddings", label: "Embeddings" },
    { value: "tools", label: "Tools" },
    { value: "agents", label: "Agents" },
    { value: "apps", label: "Apps" },
] as const;

const tabOptions = ["Request", "Pollen", "Usage"] as const;

const SelectionDemo: FC<{ theme: ThemeName }> = ({ theme }) => {
    const [activeTab, setActiveTab] =
        useState<(typeof tabOptions)[number]>("Request");
    const [selected, setSelected] = useState<string[]>(["images", "text"]);
    const [period, setPeriod] = useState<PeriodSelection>(() =>
        currentPeriod(),
    );

    return (
        <ShowcaseSection
            id="selection"
            title="Selection"
            caption="Mutually exclusive tabs, multiple selection, dropdowns, and period selection."
        >
            <Surface variant="panel" className="flex flex-col gap-4">
                <ControlGroup label="TabButton">
                    <div className="flex flex-wrap gap-1.5">
                        {tabOptions.map((option) => (
                            <TabButton
                                key={option}
                                active={activeTab === option}
                                onClick={() => setActiveTab(option)}
                            >
                                {option}
                            </TabButton>
                        ))}
                    </div>
                </ControlGroup>
                <ControlGroup label="Dropdown">
                    <Dropdown
                        theme={theme}
                        align="start"
                        className="w-56 p-2"
                        trigger={(open) => (
                            <button
                                type="button"
                                className="inline-flex min-h-8 items-center gap-2 rounded-full border border-theme-border bg-theme-bg-subtle px-3 text-sm font-medium text-theme-text-base hover:bg-theme-bg-pale"
                            >
                                Menu
                                <ChevronIcon expanded={open} />
                            </button>
                        )}
                    >
                        {(close) => (
                            <div className="flex flex-col">
                                {["Account", "Usage", "Settings"].map(
                                    (item) => (
                                        <button
                                            key={item}
                                            type="button"
                                            onClick={close}
                                            className="rounded-md px-3 py-2 text-left text-sm text-theme-text-base hover:bg-theme-bg-subtle"
                                        >
                                            {item}
                                        </button>
                                    ),
                                )}
                            </div>
                        )}
                    </Dropdown>
                </ControlGroup>
                <ControlGroup label="MultiSelect">
                    <div className="flex flex-wrap gap-3">
                        <MultiSelect
                            options={[...selectionOptions]}
                            selected={selected}
                            onChange={setSelected}
                            placeholder="All"
                            align="start"
                            label="Types"
                            theme={theme}
                        />
                        <MultiSelect
                            options={[]}
                            selected={[]}
                            onChange={noopSelected}
                            placeholder="All"
                            disabled
                            disabledText="Unavailable"
                            label="Disabled"
                            theme={theme}
                        />
                    </div>
                </ControlGroup>
                <ControlGroup label="PeriodPicker">
                    <PeriodPicker
                        value={period}
                        onChange={setPeriod}
                        theme={theme}
                    />
                </ControlGroup>
            </Surface>
        </ShowcaseSection>
    );
};

const OverlaysDemo: FC<{ theme: ThemeName }> = ({ theme }) => {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [firstOpen, setFirstOpen] = useState(false);
    const [secondOpen, setSecondOpen] = useState(true);

    return (
        <ShowcaseSection
            id="overlays"
            title="Overlays and Disclosure"
            caption="Dialog, DialogTitle, Dropdown, Collapsible, and ScrollArea share the package interaction language."
        >
            <Surface variant="panel" className="flex flex-col gap-4">
                <Row label="Dialog">
                    <Button onClick={() => setDialogOpen(true)}>
                        Open dialog
                    </Button>
                    <Dialog
                        open={dialogOpen}
                        onOpenChange={setDialogOpen}
                        labelledBy="showcase-dialog-title"
                        theme={theme}
                        size="sm"
                    >
                        <div className="p-6">
                            <DialogTitle
                                id="showcase-dialog-title"
                                className="font-subheading text-xl text-theme-text-strong"
                            >
                                DialogTitle export
                            </DialogTitle>
                            <p className="mt-2 text-sm text-theme-text-base">
                                The dialog is controlled by the host and uses
                                the same themed surface tokens.
                            </p>
                            <div className="mt-5 flex justify-end gap-2">
                                <Button
                                    size="small"
                                    onClick={() => setDialogOpen(false)}
                                >
                                    Close
                                </Button>
                            </div>
                        </div>
                    </Dialog>
                </Row>
                <Surface className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3">
                    <Collapsible
                        expanded={firstOpen}
                        onToggle={() => setFirstOpen((open) => !open)}
                        wrapperClassName="border-theme-border bg-theme-bg-pale"
                        label={
                            <span className="text-sm font-medium text-theme-text-strong">
                                Advanced settings
                            </span>
                        }
                    >
                        <p className="text-sm text-theme-text-base">
                            Body content is fully controlled by the caller.
                        </p>
                    </Collapsible>
                    <Collapsible
                        expanded={secondOpen}
                        onToggle={() => setSecondOpen((open) => !open)}
                        wrapperClassName="border-theme-border bg-theme-bg-pale"
                        label={
                            <span className="text-sm font-medium text-theme-text-strong">
                                Nested details
                            </span>
                        }
                    >
                        <div className="flex flex-col gap-2">
                            <p className="text-sm text-theme-text-base">
                                The same primitive works inside compact panels.
                            </p>
                            <Button size="small">Nested action</Button>
                        </div>
                    </Collapsible>
                    <Collapsible
                        expanded={false}
                        onToggle={noop}
                        disabled
                        wrapperClassName="border-theme-border bg-theme-bg-pale"
                        label={
                            <span className="text-sm font-medium text-theme-text-strong">
                                Disabled row
                            </span>
                        }
                    >
                        Disabled content
                    </Collapsible>
                </Surface>
            </Surface>
        </ShowcaseSection>
    );
};

const LayoutDemo: FC<{ theme: ThemeName }> = ({ theme }) => (
    <ShowcaseSection
        id="layout"
        title="Layout"
        caption="Surface, Section, StatCard, ScrollArea, and Table primitives for dense product screens."
    >
        <Surface variant="panel" className="flex flex-col gap-4">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-3">
                <Surface>
                    <h3 className="font-subheading text-xl text-theme-text-strong">
                        Surface card
                    </h3>
                    <p className="mt-1 text-sm text-theme-text-soft">
                        Neutral inner surface for dense content.
                    </p>
                </Surface>
                <Surface variant="card-themed">
                    <h3 className="font-subheading text-xl text-theme-text-strong">
                        Surface themed
                    </h3>
                    <p className="mt-1 text-sm text-theme-text-soft">
                        Themed wash for highlights and grouped state.
                    </p>
                </Surface>
                <StatCard
                    label="StatCard"
                    value={formatPollen(1234.5678)}
                    detail="Tabular value with optional detail."
                    className="rounded-xl bg-surface-white p-4"
                />
            </div>
            <PrimitiveSection
                title="Primitive section"
                theme={theme}
                framed
                action={<Button size="small">Action</Button>}
            >
                <p className="text-sm text-theme-text-soft">
                    Section owns heading layout and optional framing. The app
                    owns the content inside it.
                </p>
            </PrimitiveSection>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
                <Surface>
                    <p className="mb-2 font-mono text-xs uppercase tracking-wide text-theme-text-soft">
                        ScrollArea vertical
                    </p>
                    <ScrollArea className="h-44 rounded-lg bg-theme-bg-subtle p-3">
                        {scrollRows.map((row) => (
                            <p
                                key={row}
                                className="py-1 text-sm text-theme-text-base"
                            >
                                Row {row}
                            </p>
                        ))}
                    </ScrollArea>
                </Surface>
                <Surface>
                    <p className="mb-2 font-mono text-xs uppercase tracking-wide text-theme-text-soft">
                        ScrollArea horizontal
                    </p>
                    <ScrollArea
                        axis="x"
                        theme="violet"
                        className="rounded-lg bg-theme-bg-subtle p-3"
                    >
                        <div className="flex w-max gap-2">
                            {scrollRows.slice(0, 16).map((row) => (
                                <Chip key={row} theme="violet">
                                    item {row}
                                </Chip>
                            ))}
                        </div>
                    </ScrollArea>
                </Surface>
            </div>
            <Surface className="p-0">
                <ScrollArea axis="x">
                    <Table className="min-w-[560px]">
                        <TableHead>
                            <tr>
                                <TableHeaderCell active sortDirection="asc">
                                    Model
                                </TableHeaderCell>
                                <TableHeaderCell>Status</TableHeaderCell>
                                <TableHeaderCell align="right">
                                    Requests
                                </TableHeaderCell>
                                <TableHeaderCell align="right">
                                    Success
                                </TableHeaderCell>
                            </tr>
                        </TableHead>
                        <TableBody>
                            {tableRows.map((row) => (
                                <TableRow key={row.model} intent={row.intent}>
                                    <TableCell>
                                        <span className="font-medium text-theme-text-strong">
                                            {row.model}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <Chip intent={row.intent} size="sm">
                                            {row.status}
                                        </Chip>
                                    </TableCell>
                                    <TableCell align="right" numeric muted>
                                        {row.requests}
                                    </TableCell>
                                    <TableCell align="right" numeric>
                                        {row.success}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </ScrollArea>
            </Surface>
        </Surface>
    </ShowcaseSection>
);

const scrollRows = Array.from({ length: 28 }, (_, index) =>
    String(index + 1).padStart(2, "0"),
);

const tableRows = [
    {
        model: "nova-fast",
        status: "Healthy",
        requests: "22,115",
        success: "99.9%",
        intent: "success" as const,
    },
    {
        model: "video-large",
        status: "Degraded",
        requests: "1,024",
        success: "91.4%",
        intent: "warning" as const,
    },
    {
        model: "legacy-audio",
        status: "Offline",
        requests: "48",
        success: "0%",
        intent: "danger" as const,
    },
] as const;

const FeedbackDemo: FC = () => (
    <ShowcaseSection
        id="feedback"
        title="Feedback"
        caption="Alert, Tooltip, InfoTip, and formatted value examples for compact product UI."
    >
        <Surface variant="panel" className="flex flex-col gap-3">
            <Row label="Alert">
                <div className="grid min-w-0 flex-1 grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-2">
                    <Alert title="Info">Catalog metadata is synced.</Alert>
                    <Alert intent="success" title="Success">
                        Package assets generated.
                    </Alert>
                    <Alert intent="warning" title="Warning">
                        Fallback data is active.
                    </Alert>
                    <Alert intent="danger" title="Error">
                        Publish token is missing.
                    </Alert>
                </div>
            </Row>
            <Row label="InfoTip">
                <span className="inline-flex items-center text-sm text-theme-text-strong">
                    Pollen balance
                    <InfoTip content="A compact inline information trigger." />
                </span>
            </Row>
            <Row label="Tooltip">
                <Tooltip
                    content="Formatted with formatPollen()"
                    displayContents
                >
                    <PaidChip size="lg">
                        {formatPollen(1234.5678)} Pollen
                    </PaidChip>
                </Tooltip>
                <Tooltip
                    content="Use triggerAs='span' around inline text."
                    triggerAs="span"
                >
                    <span className="cursor-help text-sm text-theme-text-strong underline decoration-dotted">
                        inline help
                    </span>
                </Tooltip>
            </Row>
        </Surface>
    </ShowcaseSection>
);

const modalities = [
    "text",
    "image",
    "video",
    "audio",
    "realtime",
    "embedding",
] as const;

const ModuleRecipesDemo: FC = () => {
    return (
        <ShowcaseSection
            id="modules"
            title="Shared Modules"
            caption="Package-owned pieces used by product screens; host apps provide the data and flows."
        >
            <Surface variant="panel" className="flex flex-col gap-4">
                <Row label="Wallet markers">
                    <PaidChip>Paid</PaidChip>
                    <TierChip>Tier</TierChip>
                    <span className="inline-flex items-center gap-2 text-sm text-theme-text-strong">
                        <WalletDot kind="paid" />
                        paid balance
                    </span>
                    <span className="inline-flex items-center gap-2 text-sm text-theme-text-strong">
                        <WalletDot kind="tier" />
                        tier balance
                    </span>
                </Row>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
                    <WalletBalanceCard
                        kind="paid"
                        label="Paid"
                        value={formatPollen(24.812)}
                        footer={
                            <>
                                +{formatPollen(2.1)}{" "}
                                <span className="font-medium text-amber-800/70">
                                    / 7d
                                </span>
                            </>
                        }
                        info={<InfoTip content="Paid wallet balance." />}
                    />
                    <WalletBalanceCard
                        kind="tier"
                        label="Tier"
                        value={formatPollen(183.4)}
                        footer={
                            <>
                                +{formatPollen(8)}{" "}
                                <span className="font-medium text-amber-800/70">
                                    / 7d
                                </span>
                            </>
                        }
                        info={<InfoTip content="Tier allowance balance." />}
                    />
                </div>
                <Row label="ButtonGroup">
                    <ButtonGroup aria-label="Modality options">
                        {modalities.map((modality) => (
                            <Button
                                key={modality}
                                type="button"
                                size="small"
                                className={getModalityColors(modality)?.filled}
                            >
                                {modality}
                            </Button>
                        ))}
                        <Button
                            type="button"
                            size="small"
                            className="polli:bg-gray-100 polli:text-gray-600"
                        >
                            unknown
                        </Button>
                        <Button type="button" size="small" disabled>
                            disabled
                        </Button>
                    </ButtonGroup>
                </Row>
                <Surface className="flex flex-col gap-3">
                    <h3 className="font-subheading text-xl text-theme-text-strong">
                        Auth feedback
                    </h3>
                    <AuthInfoCard title="Authorize">
                        <p className="text-sm text-theme-text-base">
                            Sign in to approve this request and return to the
                            app.
                        </p>
                    </AuthInfoCard>
                    <ErrorBanner>Authorization failed. Try again.</ErrorBanner>
                </Surface>
            </Surface>
        </ShowcaseSection>
    );
};

const noop = () => undefined;
const noopSwitch = (_checked: boolean) => undefined;
const noopSelected = (_selected: string[]) => undefined;
