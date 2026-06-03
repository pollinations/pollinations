import { InlineLink, Markdown, Surface } from "@pollinations/ui";
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
                <InlineLink href={item.link.href} className="mt-auto text-sm">
                    {item.link.text}
                </InlineLink>
            )}
        </Surface>
    );
}
