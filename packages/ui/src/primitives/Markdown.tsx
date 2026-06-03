import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "../lib/cn.ts";

export type MarkdownProps = {
    children: string;
    className?: string;
};

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
    a: ({ node, ...props }) => (
        <a
            target="_blank"
            rel="noopener noreferrer"
            className="polli:font-semibold polli:text-theme-text-strong polli:underline polli:underline-offset-2"
            {...props}
        />
    ),
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
