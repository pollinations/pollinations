import {
    CheckIcon,
    ClipboardIcon,
    CopyButton,
    Text,
    Tooltip,
} from "@pollinations/ui";

const SECTION_STYLE = {
    base: "text-theme-text-strong",
    endpoint:
        "box-decoration-clone bg-[light-dark(#ede9fe,#302447)] py-0.5 text-theme-text-strong",
    input: "box-decoration-clone bg-[light-dark(#dff3ef,#123a34)] py-0.5 text-theme-text-strong",
    key: "box-decoration-clone bg-[light-dark(#fff0ce,#443514)] py-0.5 text-theme-text-strong",
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
            <div className="flex items-center gap-2">
                <Text size="sm" weight="bold">
                    API URL
                </Text>
                <Tooltip
                    ariaLabel="About API URL"
                    tapEnabled
                    content={
                        fields
                            ? "Use this endpoint with the POST fields shown below to generate or process media with Pollinations. Provide your API key in the Authorization header."
                            : "Open this URL to generate or retrieve this media with Pollinations. Replace YOUR_API_KEY with your own API key in the URL. After generation, the URL includes the inputs used for that result."
                    }
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-theme-border text-xs text-theme-text-muted"
                >
                    ?
                </Tooltip>
            </div>
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
                    <pre className="whitespace-pre-wrap break-all font-mono text-xs leading-6 text-theme-text-strong">
                        {JSON.stringify(fields, null, 2)}
                    </pre>
                </div>
            )}
        </section>
    );
}
