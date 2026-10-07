import { CheckIcon, ClipboardIcon, CopyButton, Text } from "@pollinations/ui";

const SECTION_STYLE = {
    base: "text-theme-text-muted",
    endpoint: "text-[light-dark(#6d28d9,#c4b5fd)]",
    input: "text-[light-dark(#115e59,#5eead4)]",
    key: "text-[light-dark(#92400e,#fcd34d)]",
};

export function ApiUrlCard({
    url,
    fields,
}: {
    url: string;
    fields?: Record<string, string | number>;
}) {
    const parsed = new URL(url);
    const path = parsed.pathname.split("/");
    const hasDescription = ["image", "video", "audio"].includes(path[1]);
    const endpoint = hasDescription ? `/${path[1]}/` : parsed.pathname;
    const description = hasDescription ? path.slice(2).join("/") : "";
    const parameters = [...parsed.searchParams];

    return (
        <section aria-label="API request" className="min-w-0 space-y-2">
            <Text size="sm" weight="bold">
                API URL
            </Text>
            <CopyButton
                value={url}
                tooltip={null}
                aria-label="Copy API URL"
                className="polli-surface-card relative block w-full min-w-0 select-none rounded-card bg-surface-opaque min-h-16 p-3.5 pr-16 text-left transition-colors hover:bg-surface-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-text-soft sm:p-4 sm:pr-16"
            >
                {(copied) => (
                    <>
                        <code className="block break-all font-mono text-sm leading-7">
                            <span className={SECTION_STYLE.base}>
                                {parsed.origin}
                            </span>
                            <span className={SECTION_STYLE.endpoint}>
                                {endpoint}
                            </span>
                            <span className={SECTION_STYLE.input}>
                                {description}
                            </span>
                            {parameters.map(([name, value], index) => (
                                <span
                                    key={name}
                                    className={
                                        name === "key"
                                            ? SECTION_STYLE.key
                                            : SECTION_STYLE.input
                                    }
                                >
                                    {index === 0 ? "?" : "&"}
                                    {new URLSearchParams([
                                        [name, value],
                                    ]).toString()}
                                </span>
                            ))}
                        </code>
                        <span
                            aria-hidden="true"
                            className="absolute bottom-3 right-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-theme-bg-active text-theme-text-strong"
                        >
                            {copied ? (
                                <CheckIcon className="h-4 w-4" />
                            ) : (
                                <ClipboardIcon className="h-4 w-4" />
                            )}
                        </span>
                        <span className="sr-only" role="status">
                            {copied ? "Copied" : ""}
                        </span>
                    </>
                )}
            </CopyButton>
            {fields && (
                <div className="space-y-2">
                    <Text size="xs" tone="muted">
                        POST fields · use{" "}
                        <span className={SECTION_STYLE.key}>
                            Authorization: Bearer YOUR_API_KEY
                        </span>
                    </Text>
                    <pre
                        className={`whitespace-pre-wrap break-all font-mono text-xs leading-6 ${SECTION_STYLE.input}`}
                    >
                        {JSON.stringify(fields, null, 2)}
                    </pre>
                </div>
            )}
        </section>
    );
}
