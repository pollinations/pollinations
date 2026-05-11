import {
    getTierColor,
    getTierEmoji,
    type TierStatus,
} from "@shared/tier-config.ts";
import type { FC } from "react";
import { Card } from "../ui/card.tsx";
import { InfoTip } from "../ui/info-tip.tsx";
import { Tag } from "../ui/tag.tsx";
import { TierExplanation } from "./tier-explanation";

const APPEAL_URL =
    "https://github.com/pollinations/pollinations/issues/new?template=tier-appeal.yml";

function getBadgeColor(
    tier: TierStatus,
): "gray" | "green" | "pink" | "amber" | "blue" | "orange" | "violet" {
    const tierColor = tier === "none" ? "gray" : getTierColor(tier);
    return tierColor as
        | "gray"
        | "green"
        | "pink"
        | "amber"
        | "blue"
        | "orange"
        | "violet";
}

function getPanelColor(
    tier: TierStatus,
): "blue" | "amber" | "orange" | "green" | "pink" | "gray" | "violet" {
    const tierColor = tier === "none" ? "gray" : getTierColor(tier);
    return tierColor as
        | "blue"
        | "amber"
        | "orange"
        | "green"
        | "pink"
        | "gray"
        | "violet";
}

const BetaNoticeText: FC = () => (
    <p className="text-sm font-medium text-gray-900 mt-3">
        🧪 <strong>We're in beta!</strong> Pollen values and tier rules may
        evolve as we learn what works best.
    </p>
);

// ─── Microbe: Account Under Review ──────────────────────────

const MicrobeLimitedPanel: FC = () => (
    <div className="flex flex-col gap-3">
        <p className="text-sm text-gray-600 leading-relaxed">
            We're verifying that your account belongs to a real person. This
            usually takes a few days.
        </p>
        <p className="text-sm">
            📧 Questions about your tier?{" "}
            <a
                href={APPEAL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-900 underline hover:text-gray-700 font-medium"
            >
                Contact us &rarr;
            </a>
        </p>
        <BetaNoticeText />
    </div>
);

// ─── Tier screen (spore + creator tiers) ─────────────────────

const TierScreen: FC<{
    tier: TierStatus;
    active_tier_name: string;
    pollen: number;
}> = ({ tier, active_tier_name, pollen }) => {
    const tierEmoji = getTierEmoji(tier);
    const cardColor = getPanelColor(tier);

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 flex-wrap">
                <span className="text-3xl font-bold text-gray-900">
                    {tierEmoji} {active_tier_name}
                </span>
                <Tag
                    color={getBadgeColor(tier)}
                    size="lg"
                    className="font-semibold"
                >
                    {pollen} pollen/hour
                </Tag>
            </div>

            <p className="text-sm text-gray-500">
                Pollen refills every hour{" "}
                <InfoTip
                    tone="amber"
                    text="If a request streams over its estimate, your tier balance can go negative. Hourly refills bring it back up one increment at a time, capped at your tier."
                />
            </p>

            <p className="text-sm">
                📧 Questions about your tier?{" "}
                <a
                    href={APPEAL_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-900 underline hover:text-gray-700 font-medium"
                >
                    Contact us &rarr;
                </a>
            </p>

            <Card color={cardColor} className="!border-transparent">
                <TierExplanation currentTier={tier} />
            </Card>

            <BetaNoticeText />
        </div>
    );
};

type TierPanelProps = {
    active: {
        tier: TierStatus;
        displayName: string;
        pollen?: number;
        cadence?: "hourly" | "none";
    };
};

export const TierPanel: FC<TierPanelProps> = ({ active }) => {
    const { tier, pollen } = active;

    if (tier === "microbe") {
        return <MicrobeLimitedPanel />;
    }

    return (
        <TierScreen
            tier={tier}
            active_tier_name={active.displayName}
            pollen={pollen ?? 0}
        />
    );
};
