import { CheckIcon, ClipboardIcon, CopyButton, Text } from "@pollinations/ui";

function shellQuote(value: string): string {
    return `'${value.replace(/'/g, "'\\''")}'`;
}

export function apiExample(
    url: string,
    fields?: Record<string, string | number>,
): string {
    if (!fields) return url;

    const command = [
        `curl ${shellQuote(url)}`,
        `  -H ${shellQuote("Authorization: Bearer YOUR_API_KEY")}`,
    ];
    if (url.endsWith("/v1/audio/speech")) {
        command.push(
            `  -H ${shellQuote("Content-Type: application/json")}`,
            `  -d ${shellQuote(JSON.stringify(fields))}`,
        );
    } else {
        command.push(
            ...Object.entries(fields).map(
                ([name, value]) =>
                    `  -F ${shellQuote(`${name}=${name === "file" ? `@${value}` : value}`)}`,
            ),
        );
    }
    if (!url.endsWith("/v1/audio/transcriptions")) {
        command.push("  -o output.mp3");
    }
    return command.join(" \\\n");
}

export function ApiUrlCard({
    url,
    fields,
}: {
    url: string;
    fields?: Record<string, string | number>;
}) {
    const example = apiExample(url, fields);

    return (
        <section aria-label="API quickstart" className="min-w-0 space-y-2">
            <Text size="sm" weight="bold">
                API quickstart
            </Text>
            <CopyButton
                value={example}
                tooltip={null}
                aria-label="Copy API example"
                className="polli-surface-card relative block w-full min-w-0 select-none rounded-card bg-surface-opaque min-h-16 p-3.5 pr-16 text-left transition-colors hover:bg-surface-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-text-soft sm:p-4 sm:pr-16"
            >
                {(copied) => (
                    <>
                        <code className="block whitespace-pre-wrap break-all font-mono text-sm leading-7 text-theme-text-strong">
                            {example}
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
                        <output className="sr-only">
                            {copied ? "Copied" : ""}
                        </output>
                    </>
                )}
            </CopyButton>
        </section>
    );
}
