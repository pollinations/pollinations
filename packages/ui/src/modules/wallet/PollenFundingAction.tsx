import { Button } from "../../primitives/Button.tsx";
import { ExternalLinkIcon, WalletIcon } from "../../primitives/icons/index.tsx";
import type { PollenStatus } from "./PollenStatusBadge.tsx";
import { WalletKindIcon } from "./wallet-display.tsx";

/** A confirmed wallet funding issue, never an app spending-limit warning. */
export function PollenFundingAction({
    status,
    enterUrl,
}: {
    status?: PollenStatus;
    enterUrl: string;
}) {
    if (!status || status.state === "limit-reached") return null;
    const kind = status.state === "paid-required" ? "paid" : status.wallet;
    const label =
        status.state === "no-pollen" ? "No Pollen" : "Paid Pollen needed";
    return (
        <Button
            as="a"
            href={new URL("/pollen#buy-pollen", enterUrl).href}
            data-pollinations-action="fund-account"
            target="_blank"
            rel="noopener noreferrer"
            intent="danger"
            size="sm"
            className="polli:gap-1.5 polli:text-xs"
            aria-label={`${kind ? `${kind === "tier" ? "Quest" : "Paid"}: ` : ""}${label}. Top up (opens in a new tab)`}
        >
            {kind ? (
                <WalletKindIcon kind={kind} />
            ) : (
                <WalletIcon
                    aria-hidden="true"
                    className="polli:h-3.5 polli:w-3.5"
                />
            )}
            <span>{label} · Top up</span>
            <ExternalLinkIcon
                aria-hidden="true"
                className="polli:h-3.5 polli:w-3.5 polli:shrink-0"
            />
        </Button>
    );
}
