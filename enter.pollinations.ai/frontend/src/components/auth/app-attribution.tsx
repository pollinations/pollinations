import {
    AccountIdentityLink,
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
    redirectUrl: URL | null;
};

/**
 * The requesting app, shown the same way before and after sign-in: one
 * full-width line each for its name, its site and its developer, all behind
 * the same icon column, so long values wrap on their own line instead of
 * squeezing their neighbours.
 */
export function AppAttribution({
    attribution,
    redirectUrl,
}: AppAttributionProps) {
    // A redirect hostname identifies the destination, not the app. Keep it
    // even when lookup has not supplied an app name, and lead with it then.
    const unknown = !attribution?.appName;
    const displayName = attribution?.appName || "Unknown app";
    const owner = attribution?.githubUsername;
    const hostname = redirectUrl?.hostname ?? "";
    // Link the site itself, never the redirect URL and its OAuth parameters.
    // Native app schemes have no site to open.
    const siteUrl =
        redirectUrl?.protocol === "https:" || redirectUrl?.protocol === "http:"
            ? redirectUrl.origin
            : undefined;
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
                {hostname && (
                    <Line lead={<GlobeIcon className="h-4 w-4" />}>
                        <Text
                            size="sm"
                            tone={unknown ? "strong" : "muted"}
                            className="break-all font-mono"
                        >
                            {siteUrl ? (
                                <InlineLink href={siteUrl} tone="quiet">
                                    {hostname}
                                </InlineLink>
                            ) : (
                                hostname
                            )}
                        </Text>
                    </Line>
                )}
                {owner && (
                    <li className="flex min-h-6 items-center gap-3">
                        {/* "by" takes the icon column, so the pill starts with the other lines' text. */}
                        <Text
                            as="span"
                            size="sm"
                            tone="muted"
                            className="w-5 shrink-0 text-center"
                        >
                            by
                        </Text>
                        <AccountIdentityLink
                            name={`@${owner}`}
                            avatarUrl={`https://github.com/${owner}.png?size=48`}
                            href={`https://github.com/${owner}`}
                        />
                    </li>
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
