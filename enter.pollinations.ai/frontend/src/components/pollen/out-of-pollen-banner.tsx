import { Alert, InlineLink } from "@pollinations/ui";
import { Link } from "@tanstack/react-router";
import type { FC } from "react";
import { BALANCE_DISPLAY_EPSILON } from "./pollen-balance.tsx";

type OutOfPollenBannerProps = {
    tierBalance: number;
    packBalance: number;
};

/** An empty wallet fails every request with 402; point at both refills. */
export const OutOfPollenBanner: FC<OutOfPollenBannerProps> = ({
    tierBalance,
    packBalance,
}) => {
    if (tierBalance + packBalance >= BALANCE_DISPLAY_EPSILON) return null;
    return (
        <Alert intent="advisory" title="Out of Pollen" className="mb-4">
            API requests fail until you add Pollen.{" "}
            <InlineLink
                as={Link}
                to="/pollen"
                hash="buy-pollen"
                external={false}
            >
                Buy Pollen
            </InlineLink>{" "}
            or{" "}
            <InlineLink as={Link} to="/quests" external={false}>
                earn some with Quests
            </InlineLink>
            .
        </Alert>
    );
};
