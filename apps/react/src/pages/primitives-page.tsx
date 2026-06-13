import {
    AppIcon,
    AudioIcon,
    BeakerIcon,
    BookIcon,
    Button,
    ButtonGroup,
    CardIcon,
    ChatIcon,
    CheckIcon,
    ChevronIcon,
    Chip,
    ClipboardIcon,
    ClockIcon,
    CodeIcon,
    ColorModeToggle,
    DatabaseIcon,
    Dialog,
    DiscordIcon,
    DownloadIcon,
    Dropdown,
    DropdownItem,
    ExternalLinkIcon,
    EyeIcon,
    Field,
    GenApiIcon,
    GitHubIcon,
    GlobeIcon,
    Heading,
    IconButton,
    ImageIcon,
    InlineLink,
    Input,
    KeyIcon,
    LockIcon,
    MailIcon,
    McpIcon,
    MenuIcon,
    MicIcon,
    MoonIcon,
    NewspaperIcon,
    PencilIcon,
    PlusIcon,
    ReasoningIcon,
    ScrollArea,
    SearchIcon,
    Slider,
    SpeakerIcon,
    SproutIcon,
    SunIcon,
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
    VideoIcon,
    WalletIcon,
    XIcon,
} from "@pollinations/ui";
import { useState } from "react";
import { CONTROL_SIZES, PageIntro, PrimitiveExample } from "./reference-layout";

const TAB_SIZES = ["sm", "md"] as const;
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
const ICON_GROUPS = [
    {
        group: "Brand",
        icons: [
            { label: "Discord", Icon: DiscordIcon },
            { label: "GitHub", Icon: GitHubIcon },
            { label: "Gen API", Icon: GenApiIcon },
            { label: "MCP", Icon: McpIcon },
        ],
    },
    {
        group: "Modality",
        icons: [
            { label: "Chat", Icon: ChatIcon },
            { label: "Image", Icon: ImageIcon },
            { label: "Eye", Icon: EyeIcon },
            { label: "Video", Icon: VideoIcon },
            { label: "Mic", Icon: MicIcon },
            { label: "Speaker", Icon: SpeakerIcon },
            { label: "Audio", Icon: AudioIcon },
        ],
    },
    {
        group: "Capability",
        icons: [
            { label: "Reasoning", Icon: ReasoningIcon },
            { label: "Search", Icon: SearchIcon },
            { label: "Code", Icon: CodeIcon },
        ],
    },
    {
        group: "Billing",
        icons: [
            { label: "Card", Icon: CardIcon },
            { label: "Sprout", Icon: SproutIcon },
            { label: "Wallet", Icon: WalletIcon },
            { label: "Tokens", Icon: TokensIcon },
        ],
    },
    {
        group: "Actions",
        icons: [
            { label: "Check", Icon: CheckIcon },
            { label: "X", Icon: XIcon },
            { label: "Plus", Icon: PlusIcon },
            { label: "Pencil", Icon: PencilIcon },
            { label: "Download", Icon: DownloadIcon },
            { label: "Clipboard", Icon: ClipboardIcon },
            { label: "External", Icon: ExternalLinkIcon },
        ],
    },
    {
        group: "Navigation",
        icons: [
            { label: "Menu", Icon: MenuIcon },
            { label: "Chevron", Icon: ChevronIcon },
            { label: "Trend", Icon: TrendUpIcon },
        ],
    },
    {
        group: "Objects",
        icons: [
            { label: "App", Icon: AppIcon },
            { label: "Beaker", Icon: BeakerIcon },
            { label: "Book", Icon: BookIcon },
            { label: "Clock", Icon: ClockIcon },
            { label: "Database", Icon: DatabaseIcon },
            { label: "Globe", Icon: GlobeIcon },
            { label: "Key", Icon: KeyIcon },
            { label: "Lock", Icon: LockIcon },
            { label: "Mail", Icon: MailIcon },
            { label: "Moon", Icon: MoonIcon },
            { label: "Newspaper", Icon: NewspaperIcon },
            { label: "Sun", Icon: SunIcon },
            { label: "Terminal", Icon: TerminalIcon },
        ],
    },
] as const;

export function PrimitivesPage() {
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
                        description="Every exported UI icon, grouped by purpose — including the shared chevron used by collapsibles and menus."
                    >
                        <div className="flex flex-col gap-4">
                            {ICON_GROUPS.map(({ group, icons }) => (
                                <div
                                    key={group}
                                    className="flex flex-col gap-2"
                                >
                                    <span className="text-xs font-semibold uppercase tracking-wide text-theme-text-muted">
                                        {group}
                                    </span>
                                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                                        {icons.map(({ label, Icon }) => (
                                            <div
                                                key={label}
                                                className="flex items-center gap-2 rounded-lg bg-theme-bg-pale px-2 py-2 text-sm text-theme-text-soft"
                                            >
                                                <Icon className="h-4 w-4 shrink-0 text-theme-text-strong" />
                                                <span className="truncate">
                                                    {label}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
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
