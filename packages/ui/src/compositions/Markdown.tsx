import { isValidElement, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "../lib/cn.ts";
import { CodeBlock } from "./CodeBlock.tsx";

export type MarkdownProps = {
    children: string;
    className?: string;
};

function textContent(value: ReactNode): string {
    if (typeof value === "string" || typeof value === "number") {
        return String(value);
    }
    if (Array.isArray(value)) return value.map(textContent).join("");
    if (isValidElement<{ children?: ReactNode }>(value)) {
        return textContent(value.props.children);
    }
    return "";
}

const VIDEO_EXTENSIONS = new Set(["m4v", "mov", "mp4", "webm"]);
const AUDIO_EXTENSIONS = new Set([
    "aac",
    "flac",
    "m4a",
    "mp3",
    "ogg",
    "opus",
    "wav",
]);

function urlExtension(src: string): string {
    const path = src.split(/[?#]/, 1)[0];
    return path.split(".").pop()?.toLowerCase() ?? "";
}

function MarkdownCodeBlock({ children }: { children?: ReactNode }) {
    const child = isValidElement<{
        children?: ReactNode;
        className?: string;
    }>(children)
        ? children
        : null;
    const language = child?.props.className?.match(/language-([^\s]+)/)?.[1];
    const code = textContent(child?.props.children ?? children).replace(
        /\n$/,
        "",
    );

    return <CodeBlock code={code} language={language} className="polli:my-3" />;
}

const components: Components = {
    ul: ({ node, ...props }) => (
        <ul
            className="polli:flex polli:min-w-0 polli:list-disc polli:flex-col polli:gap-1 polli:pl-5 polli:marker:text-theme-text-muted"
            {...props}
        />
    ),
    ol: ({ node, ...props }) => (
        <ol
            className="polli:flex polli:min-w-0 polli:list-decimal polli:flex-col polli:gap-1 polli:pl-5 polli:marker:text-theme-text-muted"
            {...props}
        />
    ),
    p: ({ node, ...props }) => (
        <p className="polli:mb-2 polli:last:mb-0" {...props} />
    ),
    strong: ({ node, ...props }) => (
        <strong
            className="polli:font-semibold polli:text-theme-text-strong"
            {...props}
        />
    ),
    code: ({ node, ...props }) => (
        <code
            className="polli:break-words polli:rounded polli:bg-theme-bg-subtle polli:px-1 polli:py-0.5 polli:font-mono polli:text-xs"
            {...props}
        />
    ),
    pre: ({ children }) => <MarkdownCodeBlock>{children}</MarkdownCodeBlock>,
    img: ({ node, src, alt, ...props }) => {
        const extension = typeof src === "string" ? urlExtension(src) : "";
        if (typeof src === "string" && VIDEO_EXTENSIONS.has(extension)) {
            return (
                // biome-ignore lint/a11y/useMediaCaption: generated media has no caption track
                <video
                    src={src}
                    controls
                    playsInline
                    preload="metadata"
                    className="polli:max-w-full polli:rounded-lg"
                />
            );
        }
        if (typeof src === "string" && AUDIO_EXTENSIONS.has(extension)) {
            return (
                // biome-ignore lint/a11y/useMediaCaption: generated media has no caption track
                <audio
                    src={src}
                    controls
                    preload="metadata"
                    className="polli:w-full"
                />
            );
        }
        return (
            <img
                src={src}
                alt={alt}
                loading="lazy"
                className="polli:max-w-full polli:rounded-lg"
                {...props}
            />
        );
    },
    a: ({ node, href, ...props }) => {
        const external =
            typeof href === "string" &&
            !href.startsWith("#") &&
            !href.startsWith("/");
        return (
            <a
                href={href}
                target={external ? "_blank" : undefined}
                rel={external ? "noopener noreferrer" : undefined}
                className="polli-control polli:rounded-sm polli:font-medium polli:text-theme-text-strong polli:underline polli:underline-offset-2"
                {...props}
            />
        );
    },
};

/** Compact markdown for cards and snippets. Use Prose for document-style content. */
export function Markdown({ children, className }: MarkdownProps) {
    return (
        <div
            className={cn(
                "polli:min-w-0 polli:font-body polli:leading-relaxed",
                className,
            )}
        >
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                {children}
            </ReactMarkdown>
        </div>
    );
}
