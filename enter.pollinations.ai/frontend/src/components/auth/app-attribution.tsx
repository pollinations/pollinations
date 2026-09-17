import { Chip, SproutIcon, Surface, Text } from "@pollinations/ui";

type Attribution = {
    appName?: string;
    githubUsername?: string;
    found?: boolean;
    earningsEnabled?: boolean;
};

type AppAttributionProps = {
    attribution: Attribution | null;
    redirectHostname: string;
};

/**
 * The requesting app, shown the same way before and after sign-in: its name
 * as a name plate in the pixel face, the owner with their GitHub avatar, the
 * callback host and the earnings chip on the right.
 */
export function AppAttribution({
    attribution,
    redirectHostname,
}: AppAttributionProps) {
    // A callback hostname identifies the destination, not the app. Keep it in
    // the details row even when lookup has not supplied an app name.
    const displayName = attribution?.appName || "This app";
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
                            className="mt-1.5 flex items-center gap-2"
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
                            <span>
                                by{" "}
                                <a
                                    href={`https://github.com/${owner}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-medium underline hover:text-theme-text-strong"
                                >
                                    @{owner}
                                </a>
                            </span>
                        </Text>
                    )}
                </div>
                {(redirectHostname || attribution?.earningsEnabled) && (
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                        {redirectHostname && (
                            <Text size="xs" tone="muted" className="font-mono">
                                {redirectHostname}
                            </Text>
                        )}
                        {attribution?.earningsEnabled && (
                            <Chip
                                size="sm"
                                intent="success"
                                title="The app earns 20% of the Pollen you spend in it."
                            >
                                <SproutIcon className="h-3 w-3" />
                                Earns 20%
                            </Chip>
                        )}
                    </div>
                )}
            </div>
        </Surface>
    );
}
