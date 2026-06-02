import { ExternalLinkIcon, Surface, type ThemeName } from "@pollinations/ui";
import { Markdown } from "../Markdown.tsx";
import type { ToolboxItem } from "./copy.ts";

/** Rotating accent theme so the grid alternates colors (legacy did i % 4). */
const ACCENTS: ThemeName[] = ["green", "blue", "pink", "violet"];

export function ToolboxCard({
    item,
    index,
}: {
    item: ToolboxItem;
    index: number;
}) {
    const theme = ACCENTS[index % ACCENTS.length];
    return (
        <Surface
            theme={theme}
            variant="card-themed"
            className="flex flex-col gap-3 p-5"
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
