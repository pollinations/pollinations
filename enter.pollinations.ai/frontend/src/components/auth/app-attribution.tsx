import { InfoTip } from "@pollinations/ui";

type Attribution = {
    appName?: string;
    /** Provider-neutral handle — the canonical author display name. */
    handle?: string | null;
    /** Real GitHub login; present only when a GitHub account is linked. */
    githubUsername?: string;
    found?: boolean;
};

type AppAttributionProps = {
    attribution: Attribution | null;
    isDeviceMode: boolean;
    userCode?: string;
    redirectHostname: string;
};

export function AppAttribution({
    attribution,
    isDeviceMode,
    userCode,
    redirectHostname,
}: AppAttributionProps) {
    const displayName =
        attribution?.appName ??
        (isDeviceMode ? "A device" : redirectHostname || "An app");
    const authorHandle = attribution?.handle || attribution?.githubUsername;
    const tipText = [
        "Same as copy-pasting an API key into their app.",
        "Only share with apps you trust.",
    ].join("\n");
    return (
        <>
            <p className="text-theme-text-strong">
                <span className="font-bold text-lg">{displayName}</span>
            </p>
            {authorHandle && (
                <p className="text-sm text-theme-text-base mt-1">
                    by{" "}
                    {attribution?.githubUsername ? (
                        // Only link to github.com when a GitHub account is
                        // actually linked — a bare handle gets plain text.
                        <a
                            href={`https://github.com/${attribution.githubUsername}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium underline hover:text-theme-text-strong"
                        >
                            @{authorHandle}
                        </a>
                    ) : (
                        <span className="font-medium">@{authorHandle}</span>
                    )}
                </p>
            )}
            {!isDeviceMode && attribution?.appName && redirectHostname && (
                <p className="text-xs text-theme-text-base font-mono mt-1">
                    {redirectHostname}
                </p>
            )}
            {isDeviceMode && userCode && (
                <p className="text-xs text-theme-text-base font-mono mt-1">
                    Code: {userCode}
                </p>
            )}
            <p className="font-body text-xs font-semibold text-theme-text-soft tracking-wide mt-3">
                To access your Pollinations account{" "}
                <InfoTip text={tipText} label="API key sharing warning" />
            </p>
        </>
    );
}
