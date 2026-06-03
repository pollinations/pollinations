import { cn, Prose, Surface, type ThemeName } from "@pollinations/ui";

export type DocumentPageProps = {
    markdown: string;
    theme?: ThemeName;
    className?: string;
};

export function DocumentPage({
    markdown,
    theme = "green",
    className,
}: DocumentPageProps) {
    return (
        <div
            data-theme={theme}
            className={cn(
                "mx-auto max-w-3xl px-4 py-10 sm:px-6 md:px-8",
                className,
            )}
        >
            <Surface
                theme={theme}
                variant="panel"
                className="p-5 sm:p-8 md:p-10"
            >
                <Prose>{markdown}</Prose>
            </Surface>
        </div>
    );
}
