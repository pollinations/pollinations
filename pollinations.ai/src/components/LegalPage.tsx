import { Prose } from "@pollinations/ui";

export function LegalPage({ markdown }: { markdown: string }) {
    return (
        <div
            data-theme="green"
            className="polli:mx-auto polli:max-w-3xl polli:px-4 polli:py-10 sm:polli:px-6 md:polli:px-8"
        >
            <Prose>{markdown}</Prose>
        </div>
    );
}
