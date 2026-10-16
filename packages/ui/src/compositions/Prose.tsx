import Markdown, { type Components } from "react-markdown";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { cn } from "../lib/cn.ts";
import { InlineLink } from "../primitives/InlineLink.tsx";
import { headingClassName } from "../primitives/Typography.tsx";
import { MarkdownCodeBlock } from "./Markdown.tsx";

export type ProseProps = {
    children: string;
    className?: string;
};

const components: Components = {
    h1: ({ node, ...props }) => (
        <h1
            className={headingClassName("title", "polli:mt-0 polli:mb-5")}
            {...props}
        />
    ),
    h2: ({ node, ...props }) => (
        <h2
            className={headingClassName("section", "polli:mt-8 polli:mb-3")}
            {...props}
        />
    ),
    h3: ({ node, ...props }) => (
        <h3
            className={headingClassName("subsection", "polli:mt-6 polli:mb-2")}
            {...props}
        />
    ),
    p: ({ node, ...props }) => (
        <p className="polli:my-4 polli:leading-relaxed" {...props} />
    ),
    a: ({ node, ...props }) => <InlineLink {...props} />,
    ul: ({ node, ...props }) => (
        <ul
            className="polli:my-4 polli:list-disc polli:pl-6 polli:leading-relaxed"
            {...props}
        />
    ),
    ol: ({ node, ...props }) => (
        <ol
            className="polli:my-4 polli:list-decimal polli:pl-6 polli:leading-relaxed"
            {...props}
        />
    ),
    blockquote: ({ node, ...props }) => (
        <blockquote
            className="polli:my-4 polli:border-l-4 polli:border-theme-border polli:pl-4 polli:text-theme-text-soft"
            {...props}
        />
    ),
    // Code reads like Markdown's: quiet inline chips and copyable panels.
    code: ({ node, ...props }) => (
        <code
            className="polli:break-words polli:rounded polli:bg-theme-bg-subtle polli:px-1 polli:py-0.5 polli:font-mono polli:text-[0.875em]"
            {...props}
        />
    ),
    pre: ({ children }) => <MarkdownCodeBlock>{children}</MarkdownCodeBlock>,
    img: ({ node, alt, ...props }) => (
        <img
            alt={alt ?? ""}
            loading="lazy"
            className="polli:my-4 polli:max-w-full polli:rounded-lg"
            {...props}
        />
    ),
    // Wide tables scroll inside their own box instead of widening the page.
    table: ({ node, ...props }) => (
        <div className="polli:my-4 polli:max-w-full polli:overflow-x-auto">
            <table
                className="polli:w-full polli:border-collapse polli:text-sm"
                {...props}
            />
        </div>
    ),
    th: ({ node, ...props }) => (
        <th
            className="polli:border polli:border-theme-border polli:px-3 polli:py-2 polli:text-left polli:font-semibold"
            {...props}
        />
    ),
    td: ({ node, ...props }) => (
        <td
            className="polli:border polli:border-theme-border polli:px-3 polli:py-2"
            {...props}
        />
    ),
    hr: ({ node, ...props }) => (
        <hr className="polli:my-6 polli:border-theme-border" {...props} />
    ),
};

export function Prose({ children, className }: ProseProps) {
    return (
        <div
            className={cn(
                "polli:font-body polli:text-theme-text-base polli:leading-relaxed",
                className,
            )}
        >
            <Markdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeSlug]}
                components={components}
            >
                {children}
            </Markdown>
        </div>
    );
}
