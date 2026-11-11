import { Alert, InlineLink } from "@pollinations/ui";
import { Link } from "@tanstack/react-router";
import type { FC } from "react";
import type { AccountBalance } from "../../hooks/use-account-balance.ts";

/** An empty wallet fails every request with 402; point at the refills. */
export const OutOfPollenBanner: FC<AccountBalance> = ({
    tierBalance,
    packBalance,
    questPollenRestricted,
}) => {
    // Locked Quest pollen cannot be spent, and quests would only add to it.
    const spendable = (questPollenRestricted ? 0 : tierBalance) + packBalance;
    // The API lets a request through while any spendable pollen is left.
    if (spendable > 0) return null;
    return (
        <Alert intent="advisory" title="Out of pollen">
            API requests fail until you add more.{" "}
            <InlineLink
                as={Link}
                to="/pollen"
                hash="buy-pollen"
                external={false}
            >
                Buy pollen
            </InlineLink>
            {!questPollenRestricted && (
                <>
                    {" "}
                    or{" "}
                    <InlineLink as={Link} to="/quests" external={false}>
                        earn some with Quests
                    </InlineLink>
                </>
            )}
            .
        </Alert>
    );
};
