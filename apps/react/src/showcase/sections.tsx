import {
    Alert,
    AppIcon,
    Field as ArkField,
    AudioIcon,
    BeakerIcon,
    BookIcon,
    Button,
    CardIcon,
    ChatIcon,
    CheckIcon,
    ChevronIcon,
    Chip,
    ClipboardIcon,
    ClockIcon,
    CodeIcon,
    Collapsible,
    ColorModeToggle,
    Section as CompositionSection,
    CopyButton,
    currentPeriod,
    DatabaseIcon,
    Dialog,
    DialogTitle,
    DiscordIcon,
    DownloadIcon,
    Dropdown,
    DropdownItem,
    ExternalLinkButton,
    ExternalLinkIcon,
    EyeIcon,
    FieldStack,
    FileUpload,
    GenApiIcon,
    GitHubIcon,
    GlobeIcon,
    Heading,
    IconButton,
    type IconProps,
    ImageIcon,
    InfoTip,
    Input,
    KeyIcon,
    LockIcon,
    MailIcon,
    McpIcon,
    MenuIcon,
    MicIcon,
    MoonIcon,
    MultiSelect,
    NewspaperIcon,
    PencilIcon,
    PeriodPicker,
    type PeriodSelection,
    PlusIcon,
    Prose,
    ReasoningIcon,
    ScrollArea,
    SearchIcon,
    Slider,
    SpeakerIcon,
    SproutIcon,
    StatCard,
    SunIcon,
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
    Text,
    Textarea,
    TokensIcon,
    Tooltip,
    TrendUpIcon,
    VideoIcon,
    WalletIcon,
    XIcon,
} from "@pollinations/ui";
import { AuthInfoCard, ErrorBanner } from "@pollinations/ui/auth";
import {
    getModalityKey,
    ModalityChip,
    ModalityDot,
    ModalityTab,
} from "@pollinations/ui/gen";
import {
    formatPollen,
    PaidChip,
    TierChip,
    WalletBalanceCard,
    WalletKindIcon,
} from "@pollinations/ui/wallet";
import { type ComponentType, type FC, type ReactNode, useState } from "react";

type HeaderProps = {
    headerSlot?: ReactNode;
};

export const Header: FC<HeaderProps> = ({ headerSlot }) => (
    <header className="sticky top-0 z-20 border-b border-theme-text-strong/10 bg-theme-bg-pale px-5 py-4 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1220px] min-w-0 flex-col items-start gap-4">
            <div className="flex w-full min-w-0 flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                    <Heading as="h1" size="section">
                        Design Showcase
                    </Heading>
                    <p className="max-w-3xl text-sm leading-6 text-theme-text-soft">
                        Package primitives, icons, tokens, and SDK-free recipes.
                    </p>
                </div>
                {headerSlot ? (
                    <div className="w-full md:w-auto">{headerSlot}</div>
                ) : null}
            </div>
        </div>
    </header>
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
            <Heading as="h2" size="section">
                {title}
            </Heading>
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

const typographyRows = [
    {
        label: 'Heading size="title"',
        sample: (
            <Heading as="h3" size="title">
                Pollinations
            </Heading>
        ),
    },
    {
        label: 'Heading size="section"',
        sample: (
            <Heading as="h3" size="section">
                Reusable UI
            </Heading>
        ),
    },
    {
        label: 'Text size="body"',
        sample: <Text>Clear defaults for product surfaces.</Text>,
    },
    {
        label: 'Text size="sm" tone="soft"',
        sample: (
            <Text size="sm" tone="soft">
                Supporting copy with calmer emphasis.
            </Text>
        ),
    },
    {
        label: 'Text size="micro"',
        sample: (
            <Text
                as="span"
                size="micro"
                tone="muted"
                weight="bold"
                className="uppercase tracking-wide"
            >
                Status label
            </Text>
        ),
    },
] as const;

const textRows = [
    ["strong", "text-theme-text-strong"],
    ["base", "text-theme-text-base"],
    ["soft", "text-theme-text-soft"],
    ["muted", "text-theme-text-muted"],
] as const;

export const TypographyDemo: FC = () => (
    <ShowcaseSection
        id="type"
        title="Typography"
        caption="Typography primitives for heading levels, body copy, labels, and semantic text tones."
    >
        <Surface variant="panel" className="flex flex-col gap-3">
            {typographyRows.map((row) => (
                <div
                    key={row.label}
                    className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-theme-border pb-3 last:border-b-0 last:pb-0"
                >
                    <div className="w-80 shrink-0 text-theme-text-strong">
                        {row.sample}
                    </div>
                    <code className="w-36 shrink-0 font-mono text-xs text-theme-text-strong">
                        {row.label}
                    </code>
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

const proseSample = [
    "# Prose composition",
    "",
    "Renders **markdown** through `react-markdown` + `remark-gfm` + `rehype-slug`,",
    "mapping every element to package theme tokens and fonts.",
    "",
    "- Themed headings, body, and lists",
    "- GFM tables and inline `code`",
    "- Links like [pollinations.ai](https://pollinations.ai)",
    "",
    "| Plugin      | Purpose            |",
    "| ----------- | ------------------ |",
    "| remark-gfm  | tables, task lists |",
    "| rehype-slug | heading anchors    |",
].join("\n");

export const ProseDemo: FC = () => (
    <ShowcaseSection
        id="prose"
        title="Prose"
        caption="Markdown rendering composition backed by react-markdown with GFM and heading slugs, themed via package tokens."
    >
        <Surface variant="panel">
            <Prose>{proseSample}</Prose>
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
        "success-bright",
        "var(--polli-color-success-bright)",
        "bg-intent-success-bg-bright",
    ],
    [
        "warning-bg",
        "var(--polli-color-warning-bg-light)",
        "bg-intent-warning-bg-light",
    ],
] as const;

export const TokensDemo: FC = () => (
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
    { name: "AudioIcon", Icon: AudioIcon },
    { name: "BeakerIcon", Icon: BeakerIcon },
    { name: "BookIcon", Icon: BookIcon },
    { name: "CardIcon", Icon: CardIcon },
    { name: "ChatIcon", Icon: ChatIcon },
    { name: "CheckIcon", Icon: CheckIcon },
    { name: "ClipboardIcon", Icon: ClipboardIcon },
    { name: "ClockIcon", Icon: ClockIcon },
    { name: "CodeIcon", Icon: CodeIcon },
    { name: "DatabaseIcon", Icon: DatabaseIcon },
    { name: "DiscordIcon", Icon: DiscordIcon },
    { name: "DownloadIcon", Icon: DownloadIcon },
    { name: "ExternalLinkIcon", Icon: ExternalLinkIcon },
    { name: "EyeIcon", Icon: EyeIcon },
    { name: "GenApiIcon", Icon: GenApiIcon },
    { name: "GitHubIcon", Icon: GitHubIcon },
    { name: "GlobeIcon", Icon: GlobeIcon },
    { name: "ImageIcon", Icon: ImageIcon },
    { name: "KeyIcon", Icon: KeyIcon },
    { name: "LockIcon", Icon: LockIcon },
    { name: "MailIcon", Icon: MailIcon },
    { name: "McpIcon", Icon: McpIcon },
    { name: "MenuIcon", Icon: MenuIcon },
    { name: "MicIcon", Icon: MicIcon },
    { name: "MoonIcon", Icon: MoonIcon },
    { name: "NewspaperIcon", Icon: NewspaperIcon },
    { name: "PencilIcon", Icon: PencilIcon },
    { name: "PlusIcon", Icon: PlusIcon },
    { name: "ReasoningIcon", Icon: ReasoningIcon },
    { name: "SearchIcon", Icon: SearchIcon },
    { name: "SpeakerIcon", Icon: SpeakerIcon },
    { name: "SproutIcon", Icon: SproutIcon },
    { name: "SunIcon", Icon: SunIcon },
    { name: "TerminalIcon", Icon: TerminalIcon },
    { name: "TokensIcon", Icon: TokensIcon },
    { name: "TrendUpIcon", Icon: TrendUpIcon },
    { name: "VideoIcon", Icon: VideoIcon },
    { name: "WalletIcon", Icon: WalletIcon },
    { name: "XIcon", Icon: XIcon },
];

export const IconsDemo: FC = () => (
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

export const ButtonsDemo: FC = () => (
    <ShowcaseSection
        id="buttons"
        title="Buttons"
        caption="Button, link, icon, copy, chip, and tab affordances in their supported states."
    >
        <div className="flex flex-col gap-3">
            <Row label="Button">
                <Button>Default</Button>
                <Button size="sm">Small</Button>
                <Button size="lg">Large</Button>
                <Button disabled>Disabled</Button>
                <Button intent="danger">Delete</Button>
            </Row>
            <Row label="External link">
                <ExternalLinkButton href="https://pollinations.ai">
                    Pollinations
                </ExternalLinkButton>
                <ExternalLinkButton href="https://pollinations.ai" size="sm">
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
                    className="inline-flex h-8 items-center gap-2 rounded-full bg-theme-bg-active px-3 text-sm font-medium text-theme-text-strong transition-colors"
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
                <Chip intent="warning">Warning</Chip>
                <Chip intent="danger">Danger</Chip>
            </Row>
        </div>
    </ShowcaseSection>
);

export const InputsDemo: FC = () => {
    const [sliderValue, setSliderValue] = useState(35);
    const [switches, setSwitches] = useState<Record<SwitchStatus, boolean>>({
        off: false,
        on: true,
        invalid: true,
    });
    const [files, setFiles] = useState<File[]>([]);
    const [rejectedCount, setRejectedCount] = useState(0);

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
                <ControlGroup label="Textarea">
                    <Textarea placeholder="Describe an image" rows={3} />
                </ControlGroup>
                <ControlGroup label="Textarea error">
                    <Textarea placeholder="Invalid" rows={3} error />
                </ControlGroup>
                <ControlGroup label="Textarea disabled">
                    <Textarea placeholder="Disabled" rows={3} disabled />
                </ControlGroup>
                <div className="col-span-full">
                    <FieldStack label="FieldStack" className="max-w-xl">
                        <Input placeholder="Project name" />
                        <Text size="xs" tone="soft">
                            Package-owned label stack for common app forms.
                        </Text>
                    </FieldStack>
                </div>
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
                            className="rounded-lg border border-intent-danger-border bg-surface-opaque px-3 py-2 text-sm"
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
                    <div className="flex flex-col gap-1">
                        <span className="text-xs font-semibold uppercase tracking-wide text-theme-text-strong">
                            color mode
                        </span>
                        <ColorModeToggle />
                    </div>
                </div>
                <div className="col-span-full">
                    <ControlGroup label="FileUpload (max 3 images)">
                        <FileUpload
                            value={files}
                            onChange={(next) => {
                                setFiles(next);
                                setRejectedCount(0);
                            }}
                            onReject={(rejected) =>
                                setRejectedCount(rejected.length)
                            }
                            maxFiles={3}
                        />
                        {rejectedCount > 0 ? (
                            <span className="text-xs text-intent-danger-text">
                                {rejectedCount} file(s) rejected — wrong type,
                                too large, or over the limit.
                            </span>
                        ) : null}
                    </ControlGroup>
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

export const SelectionDemo: FC = () => {
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
                                        <DropdownItem
                                            key={item}
                                            onClick={close}
                                        >
                                            {item}
                                        </DropdownItem>
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
                        />
                        <MultiSelect
                            options={[]}
                            selected={[]}
                            onChange={noopSelected}
                            placeholder="All"
                            disabled
                            disabledText="Unavailable"
                            label="Disabled"
                        />
                    </div>
                </ControlGroup>
                <ControlGroup label="PeriodPicker">
                    <PeriodPicker value={period} onChange={setPeriod} />
                </ControlGroup>
            </Surface>
        </ShowcaseSection>
    );
};

export const OverlaysDemo: FC = () => {
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
                                    size="sm"
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
                            <Button size="sm">Nested action</Button>
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

export const LayoutDemo: FC = () => (
    <ShowcaseSection
        id="layout"
        title="Layout"
        caption="Surface, ScrollArea, and Table primitives, plus StatCard and Section compositions for page structure."
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
            <CompositionSection
                title="Composition section"
                framed
                action={<Button size="sm">Action</Button>}
            >
                <p className="text-sm text-theme-text-soft">
                    Section combines semantic layout with the Surface primitive.
                    The app owns the action and content.
                </p>
            </CompositionSection>
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
                        className="rounded-lg bg-theme-bg-subtle p-3"
                    >
                        <div className="flex w-max gap-2">
                            {scrollRows.slice(0, 16).map((row) => (
                                <Chip key={row}>item {row}</Chip>
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
                                        <Chip
                                            intent={tableStatusChipIntent(
                                                row.intent,
                                            )}
                                            size="sm"
                                        >
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
        intent: "default" as const,
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

function tableStatusChipIntent(intent: (typeof tableRows)[number]["intent"]) {
    return intent === "default" ? "neutral" : intent;
}

export const FeedbackDemo: FC = () => (
    <ShowcaseSection
        id="feedback"
        title="Feedback"
        caption="Alert, Tooltip, InfoTip, and formatted value examples for compact product UI."
    >
        <Surface variant="panel" className="flex flex-col gap-3">
            <Row label="Alert">
                <div className="grid min-w-0 flex-1 grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-2">
                    <Alert title="Info">Catalog metadata is synced.</Alert>
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

export const ModuleRecipesDemo: FC = () => {
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
                        <WalletKindIcon kind="paid" />
                        paid balance
                    </span>
                    <span className="inline-flex items-center gap-2 text-sm text-theme-text-strong">
                        <WalletKindIcon kind="tier" />
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
                                <span className="font-medium text-theme-text-muted">
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
                                <span className="font-medium text-theme-text-muted">
                                    / 7d
                                </span>
                            </>
                        }
                        info={<InfoTip content="Tier allowance balance." />}
                    />
                </div>
                <Row label="ModalityDot">
                    {modalities.map((modality) => (
                        <span
                            key={modality}
                            className="inline-flex items-center gap-1.5 text-sm text-theme-text-strong"
                        >
                            <ModalityDot modality={modality} />
                            {modality}
                        </span>
                    ))}
                    <span className="inline-flex items-center gap-1.5 text-sm text-theme-text-soft">
                        <ModalityDot modality="unknown" />
                        {getModalityKey("unknown") ?? "unknown (no dot)"}
                    </span>
                </Row>
                <Row label="ModalityChip">
                    {modalities.map((modality) => (
                        <ModalityChip
                            key={modality}
                            modality={modality}
                            className="capitalize"
                        >
                            {modality}
                        </ModalityChip>
                    ))}
                </Row>
                <Row label="ModalityTab">
                    {modalities.map((modality, i) => (
                        <ModalityTab
                            key={modality}
                            active={i === 0}
                            onClick={() => undefined}
                            className="capitalize"
                        >
                            {modality}
                        </ModalityTab>
                    ))}
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
