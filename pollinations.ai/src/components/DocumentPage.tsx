import { cn, Prose, type ThemeName } from "@pollinations/ui";

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
            <Prose>{markdown}</Prose>
        </div>
    );
}
