import { Prose } from "@pollinations/ui";

export function LegalPage({ markdown }: { markdown: string }) {
    return (
        <div
            data-theme="green"
            className="mx-auto max-w-3xl px-4 py-10 sm:px-6 md:px-8"
        >
            <Prose>{markdown}</Prose>
        </div>
    );
}
