import {
    AppIcon,
    GlobeIcon,
    InlineLink,
    Surface,
    Text,
} from "@pollinations/ui";
import type { ReactNode } from "react";

type Attribution = {
    appName?: string;
    githubUsername?: string;
};

type AppAttributionProps = {
    attribution: Attribution | null;
    redirectHostname: string;
};

/**
 * The requesting app, shown the same way before and after sign-in: one
 * full-width line each for its name, its owner and its redirect host, so long
 * values wrap on their own line instead of squeezing their neighbours.
 */
export function AppAttribution({
    attribution,
    redirectHostname,
}: AppAttributionProps) {
    // A redirect hostname identifies the destination, not the app. Keep it
    // even when lookup has not supplied an app name, and lead with it then.
    const unknown = !attribution?.appName;
    const displayName = attribution?.appName || "Unknown app";
    const owner = attribution?.githubUsername;
    return (
        <Surface>
            <ul className="space-y-2">
                <Line lead={<AppIcon className="h-4 w-4" />}>
                    <Text
                        size="body"
                        tone="strong"
                        className="break-words font-pixel tracking-wide"
                    >
                        {displayName}
                    </Text>
                </Line>
                {owner && (
                    <Line
                        lead={
                            <img
                                src={`https://github.com/${owner}.png?size=40`}
                                alt=""
                                width={20}
                                height={20}
                                loading="lazy"
                                referrerPolicy="no-referrer"
                                className="h-5 w-5 rounded-full bg-theme-bg-subtle object-cover"
                            />
                        }
                    >
                        <Text size="sm" tone="muted" className="break-words">
                            by{" "}
                            <InlineLink href={`https://github.com/${owner}`}>
                                @{owner}
                            </InlineLink>
                        </Text>
                    </Line>
                )}
                {redirectHostname && (
                    <Line lead={<GlobeIcon className="h-4 w-4" />}>
                        <Text
                            size="sm"
                            tone={unknown ? "strong" : "muted"}
                            className="break-all font-mono"
                        >
                            {redirectHostname}
                        </Text>
                    </Line>
                )}
            </ul>
        </Surface>
    );
}

/** One card line: a 20px lead slot, matching the consent rows below it. */
function Line({ lead, children }: { lead: ReactNode; children: ReactNode }) {
    return (
        <li className="flex min-h-6 items-center gap-3">
            <span
                aria-hidden="true"
                className="flex h-5 w-5 shrink-0 items-center justify-center text-theme-text-strong"
            >
                {lead}
            </span>
            <div className="min-w-0 flex-1">{children}</div>
        </li>
    );
}
