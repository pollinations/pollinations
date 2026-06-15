import { cn, Prose, Surface } from "@pollinations/ui";

export type DocumentPageProps = {
    markdown: string;
    className?: string;
};

export function DocumentPage({ markdown, className }: DocumentPageProps) {
    return (
        <div
            className={cn(
                "mx-auto max-w-3xl px-4 py-10 sm:px-6 md:px-8",
                className,
            )}
        >
            <Surface variant="panel" className="p-5 sm:p-8 md:p-10">
                <Prose>{markdown}</Prose>
            </Surface>
        </div>
    );
}
