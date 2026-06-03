import { ExternalLinkIcon, Markdown, Surface } from "@pollinations/ui";
import type { ToolboxItem } from "./copy.ts";

export function ToolboxCard({ item }: { item: ToolboxItem }) {
    return (
        <Surface
            variant="card"
            className="flex flex-col gap-3 bg-white/80 p-5 transition-colors hover:bg-white/90"
        >
            <div className="flex items-center gap-2">
                <span aria-hidden className="text-2xl">
                    {item.emoji}
                </span>
                <h3 className="font-subheading text-lg text-theme-text-strong">
                    {item.title}
                </h3>
            </div>
            <Markdown className="text-sm text-theme-text-base">
                {item.desc}
            </Markdown>
            {item.link && (
                <a
                    href={item.link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-theme-text-strong hover:underline"
                >
                    {item.link.text}
                    <ExternalLinkIcon className="h-3.5 w-3.5" />
                </a>
            )}
        </Surface>
    );
}
