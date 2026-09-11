import { Heading } from "@pollinations/ui";

type Attribution = {
    appName?: string;
    githubUsername?: string;
    found?: boolean;
};

type AppAttributionProps = {
    titleId?: string;
    attribution: Attribution | null;
    isDeviceMode: boolean;
    userCode?: string;
    redirectHostname: string;
};

export function AppAttribution({
    titleId,
    attribution,
    isDeviceMode,
    userCode,
    redirectHostname,
}: AppAttributionProps) {
    // A callback hostname identifies the destination, not the app. Keep it in
    // the details row even when lookup has not supplied an app name.
    const displayName =
        attribution?.appName ||
        (isDeviceMode ? "Device connection" : "This app");
    return (
        <>
            {titleId ? (
                <Heading as="h1" size="section" id={titleId}>
                    {displayName}
                </Heading>
            ) : (
                <p className="font-body font-semibold text-theme-text-strong">
                    {displayName}
                </p>
            )}
            {attribution?.githubUsername && (
                <p className="text-sm text-theme-text-base mt-1">
                    by{" "}
                    <a
                        href={`https://github.com/${attribution.githubUsername}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium underline hover:text-theme-text-strong"
                    >
                        @{attribution.githubUsername}
                    </a>
                </p>
            )}
            {!isDeviceMode && redirectHostname && (
                <p className="text-xs text-theme-text-base font-mono mt-1">
                    {redirectHostname}
                </p>
            )}
            {isDeviceMode && userCode && (
                <p className="text-xs text-theme-text-base font-mono mt-1">
                    Code: {userCode}
                </p>
            )}
        </>
    );
}
