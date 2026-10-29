import { type FC, useSyncExternalStore } from "react";
import { InlineLink } from "../primitives/InlineLink.tsx";
import { Alert } from "./Alert.tsx";

/** The one outage message, wherever account data can't load. */
export const OUTAGE_MESSAGE =
    "Pollinations is having a temporary outage. Some services are down for now. Your account, keys and pollen are safe, and nothing is lost.";

function subscribeOnline(listener: () => void): () => void {
    window.addEventListener("online", listener);
    window.addEventListener("offline", listener);
    return () => {
        window.removeEventListener("online", listener);
        window.removeEventListener("offline", listener);
    };
}

/** False while the browser reports no connection: then the failure is not ours. */
export function useOnline(): boolean {
    return useSyncExternalStore(
        subscribeOnline,
        () => navigator.onLine,
        () => true,
    );
}

export type OutageNoticeProps = {
    /** The caller retries on its own, so the notice says so. */
    retrying?: boolean;
    /** Status page link; hidden without one. */
    statusUrl?: string;
    className?: string;
};

/** Stands in for account data while Pollinations is down, or the visitor is offline. */
export const OutageNotice: FC<OutageNoticeProps> = ({
    retrying = false,
    statusUrl,
    className,
}) => {
    const online = useOnline();
    if (!online) {
        return (
            <Alert intent="advisory" className={className}>
                You’re offline.
                {retrying && " This page retries when your connection is back."}
            </Alert>
        );
    }
    return (
        <Alert intent="advisory" className={className}>
            {OUTAGE_MESSAGE}
            {retrying && " Retrying automatically."}
            {statusUrl && (
                <>
                    {" "}
                    <InlineLink href={statusUrl}>Status page</InlineLink>
                </>
            )}
        </Alert>
    );
};
