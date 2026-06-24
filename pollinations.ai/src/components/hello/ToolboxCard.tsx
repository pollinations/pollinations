import { InlineLink, Markdown, Surface } from "@pollinations/ui";
import type { ToolboxItem } from "./copy.ts";

export function ToolboxCard({ item }: { item: ToolboxItem }) {
    const Icon = item.icon;

    return (
        <Surface
            variant="card"
            className="flex flex-col gap-3 bg-surface-white p-5 transition-colors hover:bg-surface-white"
        >
            <div className="flex items-center gap-2">
                <span
                    aria-hidden="true"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-theme-bg-active text-theme-text-strong"
                >
                    <Icon className="h-5 w-5" />
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
