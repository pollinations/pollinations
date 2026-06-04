import Markdown, { type Components } from "react-markdown";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { cn } from "../lib/cn.ts";

export type ProseProps = {
    children: string;
    className?: string;
};

const components: Components = {
    h1: ({ node, ...props }) => (
        <h1
            className="polli:mt-0 polli:mb-5 polli:break-words polli:font-heading polli:text-4xl polli:leading-none polli:text-theme-text-strong"
            {...props}
        />
    ),
    h2: ({ node, ...props }) => (
        <h2
            className="polli:mt-8 polli:mb-3 polli:break-words polli:font-subheading polli:text-2xl polli:leading-tight polli:text-theme-text-strong"
            {...props}
        />
    ),
    h3: ({ node, ...props }) => (
        <h3
            className="polli:mt-6 polli:mb-2 polli:break-words polli:font-subheading polli:text-xl polli:leading-tight polli:text-theme-text-strong"
            {...props}
        />
    ),
    p: ({ node, ...props }) => (
        <p className="polli:my-4 polli:leading-relaxed" {...props} />
    ),
    a: ({ node, ...props }) => (
        <a
            className="polli-control polli:rounded-sm polli:font-semibold polli:text-theme-text-strong polli:underline polli:decoration-theme-border polli:decoration-2 polli:underline-offset-3 polli:hover:decoration-theme-text-soft"
            {...props}
        />
    ),
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
    code: ({ node, ...props }) => (
        <code
            className="polli:rounded polli:bg-theme-bg-active polli:px-1 polli:py-0.5 polli:font-pixel polli:text-sm"
            {...props}
        />
    ),
    pre: ({ node, ...props }) => (
        <pre
            className="polli:my-4 polli:overflow-x-auto polli:rounded-lg polli:bg-theme-bg-active polli:p-4"
            {...props}
        />
    ),
    table: ({ node, ...props }) => (
        <table
            className="polli:my-4 polli:w-full polli:border-collapse polli:text-sm"
            {...props}
        />
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
