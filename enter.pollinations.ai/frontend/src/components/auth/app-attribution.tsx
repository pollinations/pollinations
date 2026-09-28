import { InlineLink, Surface, Text } from "@pollinations/ui";

type Attribution = {
    appName?: string;
    githubUsername?: string;
};

type AppAttributionProps = {
    attribution: Attribution | null;
    redirectHostname: string;
};

/**
 * The requesting app, shown the same way before and after sign-in: its name
 * as a name plate in the pixel face, the owner with their GitHub avatar, the
 * redirect host on the right.
 */
export function AppAttribution({
    attribution,
    redirectHostname,
}: AppAttributionProps) {
    // A redirect hostname identifies the destination, not the app. Keep it in
    // the details row even when lookup has not supplied an app name.
    const unknown = !attribution?.appName;
    const displayName = attribution?.appName || "Unknown app";
    const owner = attribution?.githubUsername;
    return (
        <Surface>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <Text
                        size="body"
                        tone="strong"
                        className="break-words font-pixel tracking-wide"
                    >
                        {displayName}
                    </Text>
                    {owner && (
                        <Text
                            size="sm"
                            tone="muted"
                            className="mt-1.5 flex items-center gap-1.5"
                        >
                            <span>by</span>
                            <InlineLink
                                href={`https://github.com/${owner}`}
                                className="inline-flex items-center gap-1.5"
                            >
                                <img
                                    src={`https://github.com/${owner}.png?size=40`}
                                    alt=""
                                    width={20}
                                    height={20}
                                    loading="lazy"
                                    referrerPolicy="no-referrer"
                                    className="h-5 w-5 shrink-0 rounded-full bg-theme-bg-subtle object-cover"
                                />
                                <span className="underline">@{owner}</span>
                            </InlineLink>
                        </Text>
                    )}
                </div>
                {redirectHostname && !unknown && (
                    <Text size="xs" tone="muted" className="shrink-0 font-mono">
                        {redirectHostname}
                    </Text>
                )}
            </div>
            {redirectHostname && unknown && (
                <Text
                    size="sm"
                    tone="strong"
                    className="mt-2 break-all font-mono"
                >
                    {redirectHostname}
                </Text>
            )}
        </Surface>
    );
}
