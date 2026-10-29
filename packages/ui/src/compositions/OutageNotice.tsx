import type { FC } from "react";
import { InlineLink } from "../primitives/InlineLink.tsx";
import { Alert } from "./Alert.tsx";

/** The one outage message, wherever account data can't load. */
export const OUTAGE_MESSAGE =
    "Pollinations is having a temporary outage. Some services are down for now. Your account, keys and pollen are safe, and nothing is lost.";

export type OutageNoticeProps = {
    /** The caller retries on its own, so the notice says so. */
    retrying?: boolean;
    /** Status page link; hidden without one. */
    statusUrl?: string;
    className?: string;
};

/** Stands in for account data while Pollinations is down. */
export const OutageNotice: FC<OutageNoticeProps> = ({
    retrying = false,
    statusUrl,
    className,
}) => (
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
