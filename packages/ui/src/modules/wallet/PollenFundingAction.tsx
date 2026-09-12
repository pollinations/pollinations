import { type PollenStatus, PollenStatusBadge } from "./PollenStatusBadge.tsx";

/** A confirmed wallet funding issue, never an app spending-limit warning. */
export function PollenFundingAction({
    status,
    enterUrl,
}: {
    status?: PollenStatus;
    enterUrl: string;
}) {
    if (!status || status.state === "limit-reached") return null;
    return (
        <PollenStatusBadge
            {...status}
            topUpHref={new URL("/top-up", enterUrl).href}
        />
    );
}
