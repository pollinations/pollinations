import { InfoTip } from "../ui/info-tip.tsx";

type Attribution = {
    appName?: string;
    githubUsername?: string;
    found?: boolean;
    earningsEnabled?: boolean;
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
    const tipText =
        attribution?.found && attribution.earningsEnabled
            ? "Same as copy-pasting an API key into their app. Only share with apps you trust. 20% of what you spend in this app goes to the developer."
            : "Same as copy-pasting an API key into their app. Only share with apps you trust.";
    return (
        <>
            <p className="text-gray-900">
                <span className="font-bold text-lg">{displayName}</span>{" "}
                <InfoTip
                    text={tipText}
                    label="API key sharing warning"
                    tone="amber"
                    icon="!"
                />{" "}
                wants access to your Pollinations account
            </p>
            {attribution?.githubUsername && (
                <p className="text-sm text-amber-900 mt-1">
                    by{" "}
                    <a
                        href={`https://github.com/${attribution.githubUsername}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium underline hover:text-gray-900"
                    >
                        @{attribution.githubUsername}
                    </a>
                </p>
            )}
            {!isDeviceMode && attribution?.appName && redirectHostname && (
                <p className="text-xs text-amber-900 font-mono mt-1">
                    {redirectHostname}
                </p>
            )}
            {isDeviceMode && userCode && (
                <p className="text-xs text-amber-900 font-mono mt-1">
                    Code: {userCode}
                </p>
            )}
        </>
    );
}
