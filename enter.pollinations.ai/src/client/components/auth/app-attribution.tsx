import { InfoTip } from "../ui/info-tip.tsx";

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
        "Same as copy-pasting an API key into their app.",
        "Only share with apps you trust.",
    ]
        .map((line) => `- ${line}`)
        .join("\n");
    return (
        <>
            <p className="text-gray-900">
                <span className="font-bold text-lg">{displayName}</span>
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
            {isDeviceMode && attribution?.appName && (
                <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    Device app names are self-declared. Verify this is the app
                    you started before approving access.
                </p>
            )}
            <p className="font-body text-xs font-semibold text-amber-800 tracking-wide mt-3">
                To access your Pollinations account{" "}
                <InfoTip
                    text={tipText}
                    label="API key sharing warning"
                    tone="amber"
                    icon="!"
                />
            </p>
        </>
    );
}
