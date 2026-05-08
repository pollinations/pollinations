import { isLoopbackUrl } from "@/routes/url-utils.ts";
import { InfoTip } from "../ui/info-tip.tsx";

type Attribution = {
    found?: boolean;
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
    redirectUrl?: string;
};

/**
 * Renders the "X wants access to your Pollinations account" header on the
 * consent screen. Splits into two visual treatments by attribution state:
 *
 * - Recognized app (`attribution.found === true`): neutral chrome, app name
 *   from `client_id` lookup, "by @githubUsername" credit.
 * - Unrecognized app (no client_id, lookup miss, or rejected redirect):
 *   warning chrome, hostname only, explicit "we can't verify who is asking"
 *   copy. Loopback URLs additionally surface a dev-server hint.
 *
 * The asymmetry is the point — registered/unregistered should not look
 * interchangeable to the user (issue #10478).
 */
export function AppAttribution({
    attribution,
    isDeviceMode,
    userCode,
    redirectHostname,
    redirectUrl,
}: AppAttributionProps) {
    const isRecognized = attribution?.found === true;

    if (isRecognized) {
        return (
            <RecognizedAttribution
                attribution={attribution}
                isDeviceMode={isDeviceMode}
                userCode={userCode}
                redirectHostname={redirectHostname}
            />
        );
    }

    return (
        <UnrecognizedAttribution
            isDeviceMode={isDeviceMode}
            userCode={userCode}
            redirectHostname={redirectHostname}
            redirectUrl={redirectUrl}
        />
    );
}

function RecognizedAttribution({
    attribution,
    isDeviceMode,
    userCode,
    redirectHostname,
}: {
    attribution: Attribution;
    isDeviceMode: boolean;
    userCode?: string;
    redirectHostname: string;
}) {
    const displayName =
        attribution.appName ??
        (isDeviceMode ? "A device" : redirectHostname || "An app");
    const tipText = [
        "Same as copy-pasting an API key into their app.",
        "Only share with apps you trust.",
        ...(attribution?.found && attribution.earningsEnabled
            ? ["20% of what you spend in this app goes to the developer."]
            : []),
    ]
        .map((line) => `- ${line}`)
        .join("\n");
    return (
        <>
            <p className="text-gray-900">
                <span className="font-bold text-lg">{displayName}</span>
            </p>
            {attribution.githubUsername && (
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
            {!isDeviceMode && attribution.appName && redirectHostname && (
                <p className="text-xs text-amber-900 font-mono mt-1">
                    {redirectHostname}
                </p>
            )}
            {isDeviceMode && userCode && (
                <p className="text-xs text-amber-900 font-mono mt-1">
                    Code: {userCode}
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

function UnrecognizedAttribution({
    isDeviceMode,
    userCode,
    redirectHostname,
    redirectUrl,
}: {
    isDeviceMode: boolean;
    userCode?: string;
    redirectHostname: string;
    redirectUrl?: string;
}) {
    const displayHost = isDeviceMode
        ? "A device"
        : redirectHostname || "An app";
    const isLoopback =
        !isDeviceMode && !!redirectUrl && isLoopbackUrl(redirectUrl);

    return (
        <div
            role="alert"
            className="rounded-md border-2 border-red-400 bg-red-50 p-3 -mx-1"
        >
            <div className="flex items-start gap-2">
                <span
                    aria-hidden="true"
                    className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-200 text-red-800 font-bold text-sm"
                >
                    !
                </span>
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-red-900">
                        Unverified app
                    </p>
                    <p className="text-sm text-red-900 mt-1">
                        <span className="font-mono break-all">
                            {displayHost}
                        </span>{" "}
                        is not registered with Pollinations. We can&apos;t
                        verify who&apos;s asking for your key.
                    </p>
                    <p className="text-sm text-red-900 mt-1">
                        Only continue if you trust this{" "}
                        {isDeviceMode ? "device" : "site"}.
                    </p>
                    {isLoopback && (
                        <p className="text-xs text-red-800 mt-2">
                            This appears to be a local development server.
                        </p>
                    )}
                    {isDeviceMode && userCode && (
                        <p className="text-xs text-red-900 font-mono mt-2">
                            Code: {userCode}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
