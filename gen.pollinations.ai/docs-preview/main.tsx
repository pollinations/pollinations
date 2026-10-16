import {
    AppBrand,
    BookIcon,
    CodeIcon,
    CopyButton,
    Drawer,
    IconButton,
    InlineLink,
    MediaPlaceholder,
    MenuIcon,
    NavItem,
    ScrollArea,
    Text,
    VideoIcon,
    XIcon,
} from "@pollinations/ui";
import { Prose } from "@pollinations/ui/markdown";
import "@pollinations/ui/styles.css";
import content from "virtual:docs-preview";
import { type MouseEvent, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

const guideId = "tag/connect-user-wallets";
const operationId = "tag/text/POST/v1/chat/completions";
type Heading = { id: string; title: string };

function Preview() {
    const [open, setOpen] = useState(false);
    const [headings, setHeadings] = useState<Heading[]>([]);
    const guide = useRef<HTMLElement>(null);

    useEffect(() => {
        setHeadings(
            Array.from(
                guide.current?.querySelectorAll<HTMLHeadingElement>("h2[id]") ??
                    [],
            ).map((heading) => {
                heading.tabIndex = -1;
                return { id: heading.id, title: heading.textContent ?? "" };
            }),
        );
        const id = decodeURIComponent(window.location.hash.slice(1));
        document
            .getElementById(id === "tag/byop" ? guideId : id)
            ?.scrollIntoView();
    }, []);

    function navigate(id: string) {
        setOpen(false);
        // Navigate after the shared drawer releases its scroll lock.
        requestAnimationFrame(() => {
            window.location.hash = id;
            const target = document.getElementById(id);
            target?.scrollIntoView();
            target?.focus({ preventScroll: true });
        });
    }

    function followLink(event: MouseEvent<HTMLElement>) {
        if (
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
        )
            return;
        if (!(event.target instanceof Element)) return;
        const href = event.target.closest("a")?.getAttribute("href");
        if (!href?.startsWith("#")) return;
        event.preventDefault();
        navigate(href.slice(1));
    }

    function navigation(mobile = false) {
        return (
            // biome-ignore lint/a11y/useKeyWithClickEvents: Native links emit click for keyboard activation too.
            <nav
                aria-label="Documentation"
                className="preview-navigation"
                onClick={followLink}
            >
                <div className="preview-brand">
                    <AppBrand appName="Docs" size="sm" href={`#${guideId}`} />
                    {mobile && (
                        <IconButton
                            variant="ghost"
                            size="md"
                            aria-label="Close menu"
                            onClick={() => setOpen(false)}
                        >
                            <XIcon />
                        </IconButton>
                    )}
                </div>
                <ScrollArea className="preview-nav" scrollbar="native">
                    <div className="preview-links">
                        <Text size="xs" tone="muted">
                            Guides
                        </Text>
                        <NavItem as="a" href={`#${guideId}`} icon={BookIcon}>
                            Connect User Wallets
                        </NavItem>
                        <div className="preview-chapters">
                            {headings.map(({ id, title }) => (
                                <InlineLink
                                    key={id}
                                    href={`#${id}`}
                                    tone="quiet"
                                    showIcon={false}
                                >
                                    {title}
                                </InlineLink>
                            ))}
                        </div>
                        <Text size="xs" tone="muted">
                            API Reference
                        </Text>
                        <NavItem
                            as="a"
                            href={`#${operationId}`}
                            icon={CodeIcon}
                        >
                            Chat Completions
                        </NavItem>
                    </div>
                </ScrollArea>
                <Text size="xs" tone="muted" className="preview-note">
                    Preview
                </Text>
            </nav>
        );
    }

    return (
        <div className="preview-layout">
            <aside className="preview-sidebar">{navigation()}</aside>
            <div className="preview-mobile-menu">
                <IconButton
                    variant="ghost"
                    size="md"
                    aria-label="Open menu"
                    aria-expanded={open}
                    onClick={() => setOpen(true)}
                >
                    <MenuIcon />
                </IconButton>
            </div>
            <Drawer
                open={open}
                onOpenChange={setOpen}
                ariaLabel="Documentation"
            >
                {navigation(true)}
            </Drawer>
            <main className="preview-content">
                <section id={guideId} ref={guide} tabIndex={-1}>
                    <div className="preview-actions">
                        <Text size="sm" tone="muted">
                            Guides
                        </Text>
                        <CopyButton
                            value={content.guide}
                            variant="button"
                            tooltip={null}
                            intent="neutral"
                        >
                            {(copied) => (copied ? "Copied" : "Copy for LLMs")}
                        </CopyButton>
                    </div>
                    <Prose>{content.guide}</Prose>
                    <MediaPlaceholder
                        icon={<VideoIcon />}
                        label="Demo video"
                        className="preview-video"
                    >
                        <InlineLink href={`#${guideId}`} showIcon={false}>
                            Connect User Wallets
                        </InlineLink>
                    </MediaPlaceholder>
                </section>
                <section
                    id={operationId}
                    tabIndex={-1}
                    className="preview-operation"
                >
                    <div className="preview-actions">
                        <Text size="sm" tone="muted">
                            API Reference
                        </Text>
                        <CopyButton
                            value={content.request}
                            variant="button"
                            tooltip={null}
                            intent="neutral"
                        >
                            {(copied) => (copied ? "Copied" : "Copy request")}
                        </CopyButton>
                    </div>
                    <Prose>{content.operation}</Prose>
                </section>
            </main>
        </div>
    );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<Preview />);
