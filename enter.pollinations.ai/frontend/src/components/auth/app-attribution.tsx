import { Heading, Text } from "@pollinations/ui";

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
        attribution?.appName || (isDeviceMode ? "Your device" : "This app");
    return (
        <>
            {titleId ? (
                <Heading as="h1" size="section" id={titleId}>
                    {displayName}
                </Heading>
            ) : (
                <Text size="sm" weight="semibold" tone="strong">
                    {displayName}
                </Text>
            )}
            {attribution?.githubUsername && (
                <Text size="sm" className="mt-1">
                    by{" "}
                    <a
                        href={`https://github.com/${attribution.githubUsername}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium underline hover:text-theme-text-strong"
                    >
                        @{attribution.githubUsername}
                    </a>
                </Text>
            )}
            {!isDeviceMode && redirectHostname && (
                <Text size="xs" className="mt-1 font-mono">
                    {redirectHostname}
                </Text>
            )}
            {isDeviceMode && userCode && (
                <Text size="xs" className="mt-1 font-mono">
                    Code: {userCode}
                </Text>
            )}
        </>
    );
}
