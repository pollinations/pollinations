import { InfoTip } from "@pollinations/ui";

type Attribution = {
    appName?: string;
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
    const tipText = [
        "This app receives a key limited to the access you allow.",
        "Only connect apps you trust. You can revoke access from your dashboard.",
    ].join("\n");
    return (
        <>
            <p className="text-theme-text-strong">
                <span className="font-bold text-lg">{displayName}</span>
            </p>
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
                Wants access to your Pollinations account{" "}
                <InfoTip text={tipText} label="About app access" />
            </p>
        </>
    );
}
