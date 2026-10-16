import content from "virtual:docs-preview";
import {
    BrandMark,
    CheckIcon,
    Chip,
    ClipboardIcon,
    CodeBlock,
    CodeIcon,
    ColorModeToggle,
    CopyButton,
    cn,
    DiscordIcon,
    Drawer,
    GitHubIcon,
    Heading,
    IconButton,
    MediaPlaceholder,
    MenuIcon,
    NavItem,
    ScrollArea,
    Section,
    VideoIcon,
    WalletIcon,
    XIcon,
} from "@pollinations/ui";
import { Prose } from "@pollinations/ui/markdown";
import {
    type ComponentType,
    type FC,
    type RefObject,
    useEffect,
    useRef,
    useState,
} from "react";
import { createRoot } from "react-dom/client";
import type { Parameter } from "./content.ts";
import "./style.css";

const { guide, operation } = content;

type Page = {
    id: string;
    group: "Guides" | "API reference";
    label: string;
    icon: ComponentType<{ className?: string }>;
};

// Ids keep the current docs' links working (`#tag/connect-user-wallets`).
const pages: readonly Page[] = [
    {
        id: "tag/connect-user-wallets",
        group: "Guides",
        label: guide.title,
        icon: WalletIcon,
    },
    {
        id: `tag/text/${operation.method}${operation.path}`,
        group: "API reference",
        label: operation.summary,
        icon: CodeIcon,
    },
];
const aliases: Record<string, string> = { "tag/byop": pages[0].id };
const groups = ["Guides", "API reference"] as const;
const guideSections = [
    { id: "overview", title: guide.title },
    ...guide.sections,
];

// Screenshots keep the width the GitHub guide gives them.
const proseClass = "min-w-0 [&_img]:max-w-[min(100%,26rem)]";
// Examples keep their line breaks and scroll sideways instead of wrapping.
const exampleClass =
    "overflow-x-auto whitespace-pre [overflow-wrap:normal] break-normal";
// Short fragments (a type, one sentence) without paragraph spacing.
const compactProse = "min-w-0 [&_p]:my-0";

type Route = { page: Page; section?: string };

function readRoute(): Route {
    const hash = decodeURIComponent(window.location.hash.slice(1));
    const id = aliases[hash] ?? hash;
    const page =
        pages.find((p) => id === p.id || id.startsWith(`${p.id}/`)) ?? pages[0];
    const section = id.startsWith(`${page.id}/`)
        ? id.slice(page.id.length + 1)
        : undefined;
    return { page, section };
}

function App() {
    const [route, setRoute] = useState(readRoute);
    const [menuOpen, setMenuOpen] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const activeSection = useActiveSection(scrollRef, route.page);

    useEffect(() => {
        const onHashChange = () => setRoute(readRoute());
        window.addEventListener("hashchange", onHashChange);
        return () => window.removeEventListener("hashchange", onHashChange);
    }, []);

    useEffect(() => {
        document.title = `${route.page.label} | Pollinations Docs`;
        const target = route.section && document.getElementById(route.section);
        if (target) target.scrollIntoView({ block: "start" });
        else scrollRef.current?.scrollTo({ top: 0 });
    }, [route]);

    return (
        <div className="flex h-dvh overflow-hidden bg-app-bg text-theme-text-strong">
            <aside
                data-theme="neutral"
                aria-label="Documentation"
                className="hidden flex-col px-2 py-4 lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-60"
            >
                <div className="flex shrink-0 flex-col gap-2 border-b border-theme-text-strong/10 pb-4 pl-1">
                    <Brand />
                    <BrandLinks />
                </div>
                <Rail activePage={route.page.id} />
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
                    <Rail
                        activePage={route.page.id}
                        onNavigate={() => setMenuOpen(false)}
                    />
                </div>
            </Drawer>
            <div className="flex min-w-0 flex-1 flex-col lg:ml-60">
                <button
                    type="button"
                    className="fixed top-3 left-3 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-surface-menu/80 text-theme-text-strong backdrop-blur-md hover:bg-surface-menu lg:hidden"
                    onClick={() => setMenuOpen(true)}
                    aria-label="Open navigation"
                >
                    <MenuIcon className="h-5 w-5" />
                </button>
                <ScrollArea
                    ref={scrollRef}
                    className="min-h-0 min-w-0 flex-1 overscroll-contain px-0 pt-16 pb-8 sm:px-4 lg:px-6 lg:pt-10"
                >
                    {route.page.group === "Guides" ? (
                        <GuidePage
                            pageId={route.page.id}
                            activeSection={activeSection}
                        />
                    ) : (
                        <OperationPage />
                    )}
                </ScrollArea>
            </div>
        </div>
    );
}

/** The guide section nearest the top of the scrolled content. */
function useActiveSection(
    scrollRef: RefObject<HTMLDivElement | null>,
    page: Page,
): string | undefined {
    const [active, setActive] = useState<string>();

    useEffect(() => {
        const scroller = scrollRef.current;
        if (!scroller || page.group !== "Guides") return;
        const update = () => {
            const line = scroller.getBoundingClientRect().top + 96;
            let current = guideSections[0].id;
            for (const { id } of guideSections) {
                const top = document
                    .getElementById(id)
                    ?.getBoundingClientRect().top;
                if (top !== undefined && top <= line) current = id;
            }
            setActive(current);
        };
        update();
        scroller.addEventListener("scroll", update, { passive: true });
        return () => scroller.removeEventListener("scroll", update);
    }, [scrollRef, page]);

    return active;
}

const Brand: FC = () => (
    <span className="flex items-center gap-2">
        <a
            href="https://pollinations.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-current"
            aria-label="Pollinations"
        >
            <BrandMark variant="lockup" className="h-6 w-[162px]" />
        </a>
        <Chip intent="neutral" size="sm">
            Docs
        </Chip>
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

// The dashboard's community links, so both sites open the same way.
const BrandLinks: FC = () => (
    <div className="flex items-center gap-1.5">
        {brandLinks.map(({ href, label, icon: Icon, text, count }) => (
            <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className="inline-flex items-center gap-1.5 rounded-full border border-transparent bg-surface-opaque/55 py-[3px] pr-[10px] pl-[7px] text-micro leading-none font-medium text-theme-text-strong/80 transition-colors hover:border-theme-text-strong/15 hover:bg-surface-opaque hover:text-theme-text-strong"
            >
                <Icon className="h-[11px] w-[11px]" />
                <span className="-translate-y-px">{text}</span>
                <span className="ml-0.5 border-l border-theme-text-strong/15 pl-1.5 font-mono text-micro text-theme-text-muted">
                    {count}
                </span>
            </a>
        ))}
    </div>
);

const Rail: FC<{ activePage: string; onNavigate?: () => void }> = ({
    activePage,
    onNavigate,
}) => (
    <>
        <ScrollArea className="-mr-2 min-h-0 flex-1 pt-1">
            <nav className="flex flex-col gap-1">
                {groups.map((group) => (
                    <div key={group} className="flex flex-col gap-1">
                        <span className="px-3 pt-3 pb-1 text-xs font-medium text-theme-text-muted">
                            {group}
                        </span>
                        {pages
                            .filter((page) => page.group === group)
                            .map((page) => (
                                <NavItem
                                    as="a"
                                    key={page.id}
                                    href={`#${page.id}`}
                                    data-theme="accent"
                                    icon={page.icon}
                                    active={activePage === page.id}
                                    onClick={onNavigate}
                                >
                                    {page.label}
                                </NavItem>
                            ))}
                    </div>
                ))}
            </nav>
        </ScrollArea>
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-theme-text-strong/10 pt-4 pl-3 text-xs text-theme-text-muted">
            <a
                href="https://enter.pollinations.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-theme-text-strong"
            >
                Dashboard
            </a>
            <span data-theme="accent">
                <ColorModeToggle />
            </span>
        </div>
    </>
);

const CopyForLlms: FC<{ value: string }> = ({ value }) => (
    <CopyButton value={value} variant="button" tooltip={null}>
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

const GuidePage: FC<{ pageId: string; activeSection?: string }> = ({
    pageId,
    activeSection,
}) => (
    <div className="mx-auto flex w-full max-w-[1064px] gap-6">
        <main className="flex min-w-0 max-w-[800px] flex-1 flex-col gap-3">
            <Section
                id="overview"
                title={guide.title}
                action={<CopyForLlms value={guide.markdown} />}
            >
                <Prose className={proseClass}>{guide.intro}</Prose>
                <MediaPlaceholder
                    icon={<VideoIcon />}
                    label="Demo video"
                    className="max-w-sm"
                >
                    A short walkthrough of this guide.
                </MediaPlaceholder>
            </Section>
            {guide.sections.map((section) => (
                <Section key={section.id} id={section.id} title={section.title}>
                    <Prose className={proseClass}>{section.body}</Prose>
                </Section>
            ))}
        </main>
        <aside
            aria-label="On this page"
            className="hidden w-52 shrink-0 xl:block"
        >
            <nav className="sticky top-0 flex flex-col gap-0.5">
                <span className="px-3 pb-1 text-xs font-medium text-theme-text-muted">
                    On this page
                </span>
                {guideSections.map(({ id, title }) => (
                    <a
                        key={id}
                        href={`#${pageId}/${id}`}
                        aria-current={
                            activeSection === id ? "location" : undefined
                        }
                        className={cn(
                            "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                            activeSection === id
                                ? "bg-theme-bg-subtle text-theme-text-strong"
                                : "text-theme-text-muted hover:text-theme-text-strong",
                        )}
                    >
                        {id === "overview" ? "Overview" : title}
                    </a>
                ))}
            </nav>
        </aside>
    </div>
);

const OperationPage: FC = () => (
    <main className="mx-auto flex w-full max-w-[1064px] flex-col gap-3">
        <Section
            id="operation"
            title={operation.summary}
            action={<CopyForLlms value={operation.markdown} />}
            intro={
                <span className="flex flex-wrap items-center gap-2">
                    <Chip intent="info" size="sm">
                        {operation.method}
                    </Chip>
                    <code className="font-mono text-sm text-theme-text-strong">
                        {operation.path}
                    </code>
                </span>
            }
        >
            {/* Examples stay beside the fields on wide screens. */}
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
                <div className="flex min-w-0 flex-col gap-8">
                    <Prose className={proseClass}>
                        {operation.description}
                    </Prose>
                    {operation.parameters.length > 0 && (
                        <div className="flex flex-col gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <Heading as="h3" size="card">
                                    Request body
                                </Heading>
                                {operation.bodyType && (
                                    <Chip intent="neutral" size="sm">
                                        {operation.bodyType}
                                    </Chip>
                                )}
                            </div>
                            <ul className="flex flex-col divide-y divide-theme-text-strong/10 border-y border-theme-text-strong/10">
                                {operation.parameters.map((parameter) => (
                                    <ParameterRow
                                        key={parameter.name}
                                        {...parameter}
                                    />
                                ))}
                            </ul>
                        </div>
                    )}
                    {operation.response && (
                        <div className="flex flex-col gap-2">
                            <Heading as="h3" size="card">
                                Response
                            </Heading>
                            <Prose className={cn(proseClass, compactProse)}>
                                {operation.response}
                            </Prose>
                        </div>
                    )}
                </div>
                <div className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-4 lg:self-start">
                    <CodeBlock
                        code={operation.request}
                        language="Request · curl"
                        codeClassName={exampleClass}
                    />
                    {operation.responseExample && (
                        <CodeBlock
                            code={operation.responseExample}
                            language="Response · 200"
                            codeClassName={exampleClass}
                        />
                    )}
                </div>
            </div>
        </Section>
    </main>
);

// Name and type on one line, the description below: readable in a narrow column.
const ParameterRow: FC<Parameter> = ({ name, type, required, description }) => (
    <li className="flex flex-col gap-1 py-3">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <code className="font-mono text-sm font-semibold text-theme-text-strong">
                {name}
            </code>
            <Prose
                className={cn(compactProse, "text-xs text-theme-text-muted")}
            >
                {type}
            </Prose>
            {required && (
                <Chip intent="warning" size="sm">
                    required
                </Chip>
            )}
        </div>
        {description && (
            <Prose className={cn(compactProse, "text-sm")}>{description}</Prose>
        )}
    </li>
);

const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
