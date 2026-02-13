import type { FC } from "react";
import { getTierEmoji, type TierStatus } from "@/tier-config.ts";
import { Badge } from "../ui/badge.tsx";
import { Card } from "../ui/card.tsx";
import { Panel } from "../ui/panel.tsx";
import { TierExplanation } from "./tier-explanation";

const TIER_BADGE_COLOR: Record<
    TierStatus,
    "gray" | "green" | "pink" | "amber" | "blue" | "yellow"
> = {
    none: "gray",
    microbe: "gray",
    seed: "green",
    flower: "pink",
    nectar: "amber",
    router: "blue",
    spore: "yellow",
};

const TIER_PANEL_COLOR: Record<
    TierStatus,
    "gray" | "teal" | "amber" | "pink" | "purple" | "blue"
> = {
    none: "amber",
    microbe: "gray",
    spore: "teal",
    seed: "amber",
    flower: "pink",
    nectar: "purple",
    router: "blue",
};

const TIER_CARD_COLOR: Record<
    TierStatus,
    "gray" | "teal" | "amber" | "pink" | "purple" | "blue"
> = {
    none: "amber",
    microbe: "gray",
    spore: "teal",
    seed: "amber",
    flower: "pink",
    nectar: "purple",
    router: "blue",
};

const TIER_BORDER_COLOR: Record<TierStatus, string> = {
    none: "border-amber-200",
    microbe: "border-gray-200",
    spore: "border-teal-200",
    seed: "border-amber-200",
    flower: "border-pink-200",
    nectar: "border-purple-200",
    router: "border-blue-200",
};

const BetaNoticeText: FC<{ borderColor?: string }> = ({
    borderColor = "border-amber-200",
}) => (
    <p
        className={`text-sm font-medium text-gray-900 mt-3 pt-3 border-t ${borderColor}`}
    >
        ✨ <strong>We're in beta!</strong> We're learning what works best for
        our community and may adjust pollen values and tier rules as we go.
        Thanks for being part of the journey!
    </p>
);

const NoTierScreen: FC<{ has_polar_error?: boolean }> = ({
    has_polar_error,
}) => (
    <Panel color="amber">
        <div className="flex flex-col gap-3">
            {has_polar_error ? (
                <Card color="red" bg="bg-red-50">
                    <p className="text-sm text-red-700 leading-relaxed">
                        ❌ <strong>Unable to Fetch Subscription Status:</strong>{" "}
                        We couldn't connect to the subscription service. Please
                        refresh the page or try again later.
                    </p>
                </Card>
            ) : (
                <Card color="yellow" bg="bg-yellow-50">
                    <p className="text-sm text-yellow-900 leading-relaxed">
                        ⏳ <strong>Setting Up Your Subscription:</strong> Your
                        subscription is being activated. Please refresh the page
                        in 1-2 minutes.
                    </p>
                </Card>
            )}
            <Card color="amber">
                <TierExplanation />
                <BetaNoticeText />
            </Card>
        </div>
    </Panel>
);

const TierScreen: FC<{
    tier: TierStatus;
    active_tier_name: string;
    daily_pollen: number;
}> = ({ tier, active_tier_name, daily_pollen }) => {
    const tierEmoji = getTierEmoji(tier);

    return (
        <Panel color={TIER_PANEL_COLOR[tier]}>
            <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-3xl font-bold text-gray-900">
                        {tierEmoji} {active_tier_name}
                    </span>
                    <Badge
                        color={TIER_BADGE_COLOR[tier]}
                        size="lg"
                        className="font-semibold"
                    >
                        {daily_pollen} pollen/day
                    </Badge>
                </div>

                <p className="text-sm text-gray-500">
                    Refills daily at 00:00 UTC. Unused pollen does not carry
                    over.
                </p>
                <Card color={TIER_CARD_COLOR[tier]}>
                    <TierExplanation />
                    <BetaNoticeText borderColor={TIER_BORDER_COLOR[tier]} />
                </Card>
            </div>
        </Panel>
    );
};

type TierPanelProps = {
    active: {
        tier: TierStatus;
        displayName: string;
        dailyPollen?: number;
    };
};

export const TierPanel: FC<TierPanelProps> = ({ active }) => {
    if (active.tier === "none") {
        return <NoTierScreen has_polar_error={false} />;
    }

    const displayName = active.displayName || "Unknown Tier";
    const displayPollen = active.dailyPollen ?? 0;

    return (
        <TierScreen
            tier={active.tier}
            active_tier_name={displayName}
            daily_pollen={displayPollen}
        />
    );
};
