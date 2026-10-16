import {
    BeakerIcon,
    BookIcon,
    BotIcon,
    BrandMark,
    BugIcon,
    ChatIcon,
    CheckIcon,
    Chip,
    ClipboardIcon,
    ClockIcon,
    CodeBlock,
    ColorModeToggle,
    CopyButton,
    CubeIcon,
    cn,
    DatabaseIcon,
    DiscordIcon,
    Drawer,
    ExternalLinkButton,
    ExternalLinkIcon,
    Eyebrow,
    GitHubIcon,
    Heading,
    IconButton,
    ImageIcon,
    KeyIcon,
    LoadingStatus,
    LockIcon,
    McpIcon,
    MenuIcon,
    MicIcon,
    NavItem,
    RobotIcon,
    ScrollArea,
    Section,
    SparklesIcon,
    SpeakerIcon,
    SproutIcon,
    Surface,
    TabButton,
    TerminalIcon,
    TokensIcon,
    ToolIcon,
    TrendUpIcon,
    VideoIcon,
    WalletIcon,
    WarningIcon,
    XIcon,
} from "@pollinations/ui";
import { Prose } from "@pollinations/ui/markdown";
import {
    type ComponentProps,
    type ComponentType,
    type FC,
    type RefObject,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { createRoot } from "react-dom/client";
import {
    type Block,
    buildDocs,
    type Docs,
    type Field,
    type Operation,
    type Page,
    SCHEMA_URL,
    tagId,
} from "./model.ts";
import "./style.css";

type Icon = ComponentType<{ className?: string }>;

const icons: Record<string, Icon> = {
    "Quick Start": SproutIcon,
    Authentication: LockIcon,
    "Connect User Wallets": WalletIcon,
    "Publish an Agent": RobotIcon,
    "Publish a Model": BeakerIcon,
    Sandboxes: TerminalIcon,
    "Coding Harnesses": ToolIcon,
    "MCP Servers": McpIcon,
    CLI: TerminalIcon,
    Text: ChatIcon,
    Image: ImageIcon,
    Video: VideoIcon,
    Jobs: ClockIcon,
    Realtime: MicIcon,
    "3D": CubeIcon,
    Audio: SpeakerIcon,
    Embeddings: TokensIcon,
    Models: BeakerIcon,
    "Community Models": BeakerIcon,
    "Community Agents": BotIcon,
    Quests: SparklesIcon,
    "Media Storage": DatabaseIcon,
    Account: KeyIcon,
    Safety: CheckIcon,
    Errors: WarningIcon,
    "Public Stats": TrendUpIcon,
};

// Older links the current docs keep working.
const aliases: Record<string, string> = {
    "tag/byop": tagId("Connect User Wallets"),
};

// Screenshots keep the width the GitHub guides give them.
const proseClass = "min-w-0 [&_img]:max-w-[min(100%,26rem)]";
// Short fragments (a type, one sentence) without paragraph spacing.
const compactProse = "min-w-0 [&_p]:my-0";
// Examples keep their line breaks and scroll sideways instead of wrapping.
const exampleClass =
    "overflow-x-auto whitespace-pre [overflow-wrap:normal] break-normal";

/** Every page in menu order: they all render, one after another. */
const allPages = (docs: Docs): Page[] => [
    docs.introduction,
    ...docs.groups.flatMap((group) => group.pages),
];

/** The page an anchor belongs to: its own id, or one nested under it. */
const pageOfAnchor = (pages: Page[], id?: string) =>
    pages.find((page) => id === page.id || id?.startsWith(`${page.id}/`));

/**
 * Scrolls to the linked card. Cards around it take their real height a frame
 * or two after they come near, which moves it, so it realigns until it has
 * stayed put for three frames.
 */
function scrollToHash() {
    const hash = decodeURIComponent(window.location.hash.slice(1));
    const target = document.getElementById(aliases[hash] ?? hash);
    if (!target) return;
    let settled = Number.NaN;
    let still = 0;
    let frames = 0;
    const step = () => {
        if (target.getBoundingClientRect().top === settled) {
            still++;
        } else {
            target.scrollIntoView({ block: "start" });
            settled = target.getBoundingClientRect().top;
            still = 0;
        }
        if (still < 3 && ++frames < 60) requestAnimationFrame(step);
    };
    step();
}

// Methods keep the current docs' colours: GET blue, POST green, DELETE red.
const methodIntent: Record<string, ComponentProps<typeof Chip>["intent"]> = {
    GET: "info",
    POST: "success",
    PUT: "warning",
    PATCH: "warning",
    DELETE: "danger",
};

// Off-screen cards skip layout and paint until they scroll near.
const lazyCard =
    "[content-visibility:auto] [contain-intrinsic-size:auto_640px]";

function App() {
    const [docs, setDocs] = useState<Docs>();
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        fetch(SCHEMA_URL)
            .then((response) => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json();
            })
            .then((schema) => setDocs(buildDocs(schema)))
            .catch(() => setFailed(true));
    }, []);

    return docs ? <Shell docs={docs} /> : <Loading failed={failed} />;
}

const Loading: FC<{ failed: boolean }> = ({ failed }) => (
    <div className="flex h-dvh items-center justify-center bg-app-bg px-4 text-theme-text-strong">
        {failed ? (
            <p className="max-w-md text-center text-sm">
                The API reference could not load.{" "}
                <a className="underline" href="/docs/explorer">
                    Open the API explorer
                </a>{" "}
                instead.
            </p>
        ) : (
            <div className="flex h-10 items-center rounded-full bg-surface-menu/80 px-4 backdrop-blur-md">
                <LoadingStatus>Loading…</LoadingStatus>
            </div>
        )}
    </div>
);

const Shell: FC<{ docs: Docs }> = ({ docs }) => {
    const [menuOpen, setMenuOpen] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const pages = useMemo(() => allPages(docs), [docs]);
    const anchors = useMemo(() => pages.flatMap(pageAnchors), [pages]);

    // A layout effect runs before the scroll spy's first reading, so a shared
    // link opens in place instead of reporting the top of the page.
    useLayoutEffect(() => {
        scrollToHash();
        window.addEventListener("hashchange", scrollToHash);
        return () => window.removeEventListener("hashchange", scrollToHash);
    }, []);

    const active = useActiveAnchor(scrollRef, anchors);
    const activePage = pageOfAnchor(pages, active) ?? docs.introduction;

    // The address follows the reader, so any spot can be shared.
    useEffect(() => {
        if (!active) return;
        const { pathname, search } = window.location;
        window.history.replaceState(
            null,
            "",
            active === docs.introduction.id ? pathname + search : `#${active}`,
        );
    }, [active, docs]);

    const rail = (onNavigate?: () => void) => (
        <Rail
            docs={docs}
            activePage={activePage}
            active={active}
            onNavigate={onNavigate}
        />
    );

    return (
        <div className="flex h-dvh overflow-hidden bg-app-bg text-theme-text-strong">
            <aside
                data-theme="neutral"
                aria-label="Documentation"
                className="hidden flex-col px-2 py-4 lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-72"
            >
                <div className="flex shrink-0 flex-col gap-2 border-b border-theme-text-strong/10 pb-4 pl-1">
                    <Brand large />
                    <BrandLinks />
                </div>
                {rail()}
            </aside>
            <Drawer
                open={menuOpen}
                onOpenChange={setMenuOpen}
                ariaLabel="Documentation"
            >
                <div
                    data-theme="neutral"
                    className="flex min-h-0 flex-1 flex-col px-2 py-3"
                >
                    <div className="flex shrink-0 flex-col gap-2 border-b border-theme-text-strong/10 pb-3 pl-1">
                        <div className="flex items-center justify-between gap-2">
                            <Brand />
                            <IconButton
                                variant="ghost"
                                size="md"
                                aria-label="Close navigation"
                                onClick={() => setMenuOpen(false)}
                            >
                                <XIcon />
                            </IconButton>
                        </div>
                        <BrandLinks />
                    </div>
                    {rail(() => setMenuOpen(false))}
                </div>
            </Drawer>
            <div className="flex min-w-0 flex-1 flex-col lg:ml-72">
                {/* Outside the scroll area, so the button never covers the text. */}
                <header className="flex shrink-0 items-center gap-2 px-3 py-3 lg:hidden">
                    <button
                        type="button"
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-menu/80 text-theme-text-strong hover:bg-surface-menu"
                        onClick={() => setMenuOpen(true)}
                        aria-label="Open navigation"
                    >
                        <MenuIcon className="h-5 w-5" />
                    </button>
                    <Brand />
                </header>
                {/* relative: hidden tab labels stay inside the scroll area. */}
                <ScrollArea
                    ref={scrollRef}
                    className="relative min-h-0 min-w-0 flex-1 overscroll-contain px-0 pb-8 sm:px-4 lg:px-6 lg:pt-10"
                >
                    <div className="mx-auto flex w-full max-w-[1280px] gap-6">
                        {/* One reading sheet; lines, not cards, split it. */}
                        <Surface
                            as="main"
                            variant="panel"
                            className="flex min-w-0 flex-1 flex-col divide-y divide-theme-text-strong/10"
                        >
                            {pages.map((page) => (
                                <PageView
                                    key={page.id}
                                    page={page}
                                    copyForLlms={page === docs.introduction}
                                />
                            ))}
                        </Surface>
                        <OnThisPage page={activePage} active={active} />
                    </div>
                </ScrollArea>
            </div>
        </div>
    );
};

type Anchor = { id: string; title: string };

function pageAnchors(page: Page): Anchor[] {
    return [
        { id: page.id, title: "Overview" },
        ...page.sections.map(({ id, title }) => ({ id, title })),
        ...page.operations.map(({ id, summary }) => ({ id, title: summary })),
    ];
}

/** The last anchor above a line near the top of the scrolled content. */
function useActiveAnchor(
    scrollRef: RefObject<HTMLDivElement | null>,
    anchors: Anchor[],
): string | undefined {
    const [active, setActive] = useState<string>();

    useEffect(() => {
        const scroller = scrollRef.current;
        if (!scroller) return;
        let frame = 0;
        const update = () => {
            frame = 0;
            const line = scroller.getBoundingClientRect().top + 96;
            let current = anchors[0]?.id;
            // Anchors are in page order, so stop at the first one below.
            for (const { id } of anchors) {
                const top = document
                    .getElementById(id)
                    ?.getBoundingClientRect().top;
                if (top === undefined) continue;
                if (top > line) break;
                current = id;
            }
            setActive(current);
        };
        const onScroll = () => {
            frame ||= requestAnimationFrame(update);
        };
        update();
        scroller.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            cancelAnimationFrame(frame);
            scroller.removeEventListener("scroll", onScroll);
        };
    }, [scrollRef, anchors]);

    return active;
}

// The dashboard's lockup, then "Docs" in the package's pixel label.
const Brand: FC<{ large?: boolean }> = ({ large = false }) => (
    <span className="flex items-center gap-3">
        <a
            href="https://pollinations.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-current"
            aria-label="Pollinations"
        >
            <BrandMark
                variant="lockup"
                className={large ? "h-6 w-[195px]" : "h-5 w-[162px]"}
            />
        </a>
        <span aria-hidden="true" className="h-4 w-px bg-theme-text-strong/20" />
        <Eyebrow size="page" data-theme="accent">
            Docs
        </Eyebrow>
    </span>
);

const brandLinks = [
    {
        href: "https://github.com/pollinations/pollinations",
        label: "Pollinations on GitHub",
        icon: GitHubIcon,
        text: "github",
        count: "5k",
    },
    {
        href: "https://discord.gg/k9F7SyTgqn",
        label: "Discord community",
        icon: DiscordIcon,
        text: "discord",
        count: "19k",
    },
] as const;

// The dashboard's help links: its support channel and the issue tracker.
const helpLinks = [
    {
        href: "https://discord.com/channels/885844321461485618/889573359111774329",
        label: "Need help?",
        icon: DiscordIcon,
    },
    {
        href: "https://github.com/pollinations/pollinations/issues",
        label: "Found a bug?",
        icon: BugIcon,
    },
] as const;

// The dashboard's community links, so both sites open the same way.
const BrandLinks: FC = () => (
    <div className="flex items-center gap-1.5">
        {brandLinks.map(({ href, label, icon: LinkIcon, text, count }) => (
            <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className="inline-flex items-center gap-1.5 rounded-full border border-transparent bg-surface-opaque/55 py-[3px] pr-[10px] pl-[7px] text-micro leading-none font-medium text-theme-text-strong/80 transition-colors hover:border-theme-text-strong/15 hover:bg-surface-opaque hover:text-theme-text-strong"
            >
                <LinkIcon className="h-[11px] w-[11px]" />
                <span className="-translate-y-px">{text}</span>
                <span className="ml-0.5 border-l border-theme-text-strong/15 pl-1.5 font-mono text-micro text-theme-text-muted">
                    {count}
                </span>
            </a>
        ))}
    </div>
);

const Rail: FC<{
    docs: Docs;
    activePage: Page;
    active?: string;
    onNavigate?: () => void;
}> = ({ docs, activePage, active, onNavigate }) => (
    <>
        <ScrollArea className="-mr-2 min-h-0 flex-1 pt-1">
            <nav className="flex flex-col gap-0.5">
                <NavItem
                    as="a"
                    href={`#${docs.introduction.id}`}
                    data-theme="accent"
                    size="sm"
                    icon={BookIcon}
                    active={activePage === docs.introduction}
                    onClick={onNavigate}
                >
                    Introduction
                </NavItem>
                {docs.groups.map((group) => (
                    <div key={group.name} className="flex flex-col gap-0.5">
                        {/* Amber group names split the menu into its parts. */}
                        <span
                            data-theme="accent"
                            className="px-3 pt-4 pb-1 text-xs font-semibold text-theme-text-soft"
                        >
                            {group.name}
                        </span>
                        {group.pages.map((page) => (
                            <div
                                key={page.id}
                                className="flex flex-col gap-0.5"
                            >
                                <NavItem
                                    as="a"
                                    href={`#${page.id}`}
                                    data-theme="accent"
                                    size="sm"
                                    icon={icons[page.title] ?? BookIcon}
                                    active={activePage === page}
                                    onClick={onNavigate}
                                >
                                    {page.title}
                                </NavItem>
                                {activePage === page &&
                                    page.operations.length > 0 && (
                                        <div className="ml-5 flex flex-col gap-0.5 border-l border-theme-text-strong/10 py-1 pl-2">
                                            {page.operations.map((op) => (
                                                <a
                                                    key={op.id}
                                                    href={`#${op.id}`}
                                                    onClick={onNavigate}
                                                    aria-current={
                                                        active === op.id
                                                            ? "location"
                                                            : undefined
                                                    }
                                                    className={cn(
                                                        "flex items-center justify-between gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                                                        active === op.id
                                                            ? "bg-theme-bg-subtle text-theme-text-strong"
                                                            : "text-theme-text-muted hover:text-theme-text-strong",
                                                    )}
                                                >
                                                    <span className="min-w-0">
                                                        {op.summary}
                                                    </span>
                                                    <Chip
                                                        intent={
                                                            methodIntent[
                                                                op.method
                                                            ] ?? "neutral"
                                                        }
                                                        size="sm"
                                                        className="font-mono"
                                                    >
                                                        {op.method}
                                                    </Chip>
                                                </a>
                                            ))}
                                        </div>
                                    )}
                            </div>
                        ))}
                    </div>
                ))}
            </nav>
        </ScrollArea>
        <div className="flex shrink-0 flex-col gap-3 border-t border-theme-text-strong/10 pt-3">
            <div className="flex flex-col gap-0.5">
                {helpLinks.map(({ href, label, icon }) => (
                    <NavItem
                        key={href}
                        as="a"
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        size="sm"
                        icon={icon}
                    >
                        {label}
                        <ExternalLinkIcon className="ml-auto h-3.5 w-3.5 text-theme-text-muted" />
                    </NavItem>
                ))}
            </div>
            <div
                data-theme="accent"
                className="flex items-center justify-between gap-2 pl-1"
            >
                <ExternalLinkButton
                    href="https://enter.pollinations.ai"
                    size="sm"
                >
                    Dashboard
                </ExternalLinkButton>
                <ColorModeToggle />
            </div>
        </div>
    </>
);

// Copies the full plain-text docs, like the current docs' button.
const CopyForLlms: FC = () => (
    <CopyButton
        value={async () => (await fetch("/docs/llm.txt")).text()}
        variant="button"
        tooltip={null}
    >
        {(copied) => (
            <span className="flex items-center gap-1.5">
                {copied ? (
                    <CheckIcon className="h-3.5 w-3.5" />
                ) : (
                    <ClipboardIcon className="h-3.5 w-3.5" />
                )}
                {copied ? "Copied" : "Copy for LLMs"}
            </span>
        )}
    </CopyButton>
);

const Blocks: FC<{ blocks: Block[] }> = ({ blocks }) => (
    <>
        {blocks.map((block, index) =>
            block.kind === "video" ? (
                <video
                    key={index}
                    src={block.src}
                    controls
                    muted
                    loop
                    playsInline
                    className="w-full max-w-[720px] rounded-lg"
                />
            ) : (
                <Prose key={index} face="plain" className={proseClass}>
                    {block.text}
                </Prose>
            ),
        )}
    </>
);

// Flat blocks with room above and below; the sheet draws a line between them.
const block = "py-10 first:pt-2";
// Guide text keeps a readable line length.
const reading = "flex max-w-3xl min-w-0 flex-col";

const PageView: FC<{ page: Page; copyForLlms: boolean }> = ({
    page,
    copyForLlms,
}) => (
    <div className="flex flex-col divide-y divide-theme-text-strong/10">
        <Section
            id={page.id}
            title={page.title}
            framed={false}
            face="plain"
            className={block}
            action={copyForLlms ? <CopyForLlms /> : undefined}
        >
            <div className={reading}>
                <Blocks blocks={page.intro} />
            </div>
        </Section>
        {page.sections.map((section) => (
            <Section
                key={section.id}
                id={section.id}
                title={section.title}
                framed={false}
                face="plain"
                titleSize="subsection"
                className={cn(block, lazyCard)}
            >
                <div className={reading}>
                    <Blocks blocks={section.blocks} />
                </div>
            </Section>
        ))}
        {page.operations.map((op) => (
            <OperationView key={op.id} op={op} />
        ))}
    </div>
);

/** The sections of the page being read, beside it on wide screens. */
const OnThisPage: FC<{ page: Page; active?: string }> = ({ page, active }) => {
    const anchors = pageAnchors(page);
    return (
        <aside
            aria-label="On this page"
            className="hidden w-52 shrink-0 2xl:block"
        >
            {anchors.length > 1 && (
                <nav className="sticky top-0 flex max-h-dvh flex-col gap-0.5 overflow-y-auto pb-10">
                    <span className="px-3 pb-1 text-xs font-medium text-theme-text-muted">
                        On this page
                    </span>
                    {anchors.map(({ id, title }) => (
                        <a
                            key={id}
                            href={`#${id}`}
                            aria-current={
                                active === id ? "location" : undefined
                            }
                            className={cn(
                                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                                active === id
                                    ? "bg-theme-bg-subtle text-theme-text-strong"
                                    : "text-theme-text-muted hover:text-theme-text-strong",
                            )}
                        >
                            {title}
                        </a>
                    ))}
                </nav>
            )}
        </aside>
    );
};

const OperationView: FC<{ op: Operation }> = ({ op }) => (
    <Section
        id={op.id}
        title={op.summary}
        framed={false}
        face="plain"
        titleSize="subsection"
        className={cn(block, lazyCard)}
        action={
            <ExternalLinkButton href={`/docs/explorer#${op.id}`} size="sm">
                Test Request
            </ExternalLinkButton>
        }
        intro={
            <span className="flex flex-wrap items-center gap-2">
                <Chip
                    intent={methodIntent[op.method] ?? "neutral"}
                    size="sm"
                    className="font-mono"
                >
                    {op.method}
                </Chip>
                <code className="font-mono text-sm break-all text-theme-text-strong">
                    {op.path}
                </code>
                {op.auth && (
                    <Chip intent="neutral" size="sm">
                        Auth Required
                    </Chip>
                )}
                {op.deprecated && (
                    <Chip intent="warning" size="sm">
                        Deprecated
                    </Chip>
                )}
            </span>
        }
    >
        {/* Examples stay beside the fields on wide screens. */}
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
            <div className="flex min-w-0 flex-col gap-8">
                <Blocks blocks={op.description} />
                {op.parameters.length > 0 && (
                    <FieldGroup title="Parameters" fields={op.parameters} />
                )}
                {op.body && (
                    <div className="flex flex-col gap-4">
                        <FieldGroup
                            title="Body"
                            type={op.body.type}
                            fields={op.body.fields}
                        />
                        {op.body.variants.map((variant) => (
                            <div
                                key={variant.label}
                                className="flex flex-col gap-2 pl-3"
                            >
                                <Prose
                                    className={cn(
                                        compactProse,
                                        "text-sm font-semibold",
                                    )}
                                >
                                    {variant.label}
                                </Prose>
                                <FieldList fields={variant.fields} />
                            </div>
                        ))}
                    </div>
                )}
                {op.responses.length > 0 && (
                    <div className="flex flex-col gap-3">
                        <Heading as="h3" size="card" face="plain">
                            Responses
                        </Heading>
                        <ul className="flex flex-col divide-y divide-theme-text-strong/10 border-y border-theme-text-strong/10">
                            {op.responses.map((response) => (
                                <li
                                    key={response.status}
                                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5"
                                >
                                    <code className="font-mono text-sm font-semibold">
                                        {response.status}
                                    </code>
                                    <span className="min-w-0 text-sm">
                                        {response.description}
                                    </span>
                                    {response.types.map((type) => (
                                        <Chip
                                            key={type}
                                            intent="neutral"
                                            size="sm"
                                        >
                                            {type}
                                        </Chip>
                                    ))}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
            <div className="flex min-w-0 flex-col gap-3 xl:sticky xl:top-4 xl:self-start">
                <Samples op={op} />
                {op.responseExample && (
                    <CodeBlock
                        code={op.responseExample}
                        language="Response"
                        codeClassName={exampleClass}
                    />
                )}
            </div>
        </div>
    </Section>
);

const Samples: FC<{ op: Operation }> = ({ op }) => {
    const [selected, setSelected] = useState(0);
    const sample = op.samples[selected] ?? op.samples[0];
    if (!sample) return null;
    return (
        <div className="flex min-w-0 flex-col gap-2">
            {op.samples.length > 1 && (
                <fieldset className="m-0 flex min-w-0 flex-wrap gap-1 border-0 p-0">
                    <legend className="sr-only">Example language</legend>
                    {op.samples.map((s, index) => (
                        <TabButton
                            key={s.label}
                            active={index === selected}
                            onClick={() => setSelected(index)}
                        >
                            {s.label}
                        </TabButton>
                    ))}
                </fieldset>
            )}
            <CodeBlock
                code={sample.source}
                language={sample.label}
                codeClassName={exampleClass}
            />
        </div>
    );
};

const FieldGroup: FC<{ title: string; type?: string; fields: Field[] }> = ({
    title,
    type,
    fields,
}) => (
    <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
            <Heading as="h3" size="card" face="plain">
                {title}
            </Heading>
            {type && (
                <Chip intent="neutral" size="sm">
                    {type}
                </Chip>
            )}
        </div>
        <FieldList fields={fields} />
    </div>
);

// Name and type on one line, the description below: readable in a narrow column.
const FieldList: FC<{ fields: Field[] }> = ({ fields }) => (
    <ul className="flex flex-col divide-y divide-theme-text-strong/10 border-y border-theme-text-strong/10">
        {fields.map((field) => (
            <li
                key={`${field.location ?? ""}${field.name}`}
                className="flex flex-col gap-1 py-3"
            >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <code className="font-mono text-sm font-semibold break-all text-theme-text-strong">
                        {field.name}
                    </code>
                    <Prose
                        className={cn(
                            compactProse,
                            "text-xs text-theme-text-muted",
                        )}
                    >
                        {field.type}
                    </Prose>
                    {field.location && (
                        <Chip intent="neutral" size="sm">
                            {field.location}
                        </Chip>
                    )}
                    {field.required && (
                        <Chip intent="warning" size="sm">
                            required
                        </Chip>
                    )}
                </div>
                {(field.description || field.extras.length > 0) && (
                    <Prose className={cn(compactProse, "text-sm")}>
                        {[field.description, ...field.extras]
                            .filter(Boolean)
                            .join(" · ")}
                    </Prose>
                )}
            </li>
        ))}
    </ul>
);

const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
