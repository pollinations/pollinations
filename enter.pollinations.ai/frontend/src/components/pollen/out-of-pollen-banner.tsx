import { Alert, InlineLink } from "@pollinations/ui";
import { Link } from "@tanstack/react-router";
import type { FC } from "react";
import type { AccountBalance } from "../../hooks/use-account-balance.ts";

/** Point to ways to fund generation when neither balance has credit available. */
export const OutOfPollenBanner: FC<AccountBalance> = ({
    tierBalance,
    packBalance,
    questPollenRestricted,
}) => {
    // Locked Quest balance cannot be spent, and quests would only add to it.
    if (packBalance > 0 || (!questPollenRestricted && tierBalance > 0)) {
        return null;
    }
    return (
        // Folded, it shares the menu button's row (top-3, h-10) instead of
        // sitting under it, so the page starts higher too; only as the
        // page's first item, or it would cover the outage banner above it.
        // Not a card, so on phones it keeps the button's 12px from the right
        // edge too.
        <Alert
            intent="advisory"
            title={
                questPollenRestricted
                    ? "Your Quest balance is locked"
                    : "You’re out of credit"
            }
            className="max-lg:first:-mt-[3.25rem] max-lg:first:ml-14 max-sm:mr-3"
        >
            To make a generation request,{" "}
            <InlineLink
                as={Link}
                to="/pollen"
                hash="buy-pollen"
                external={false}
            >
                top up your paid balance
            </InlineLink>{" "}
            or{" "}
            {questPollenRestricted ? (
                <InlineLink
                    href="mailto:hello@pollinations.ai"
                    showIcon={false}
                >
                    ask support to review your account
                </InlineLink>
            ) : (
                <InlineLink as={Link} to="/quests" external={false}>
                    complete a Quest
                </InlineLink>
            )}
            .
        </Alert>
    );
};
