import {
    getTierColor,
    getTierEmoji,
    type TierStatus,
} from "@shared/tier-config.ts";
import type { FC } from "react";
import { InfoTip } from "../ui/info-tip.tsx";
import { Tag } from "../ui/tag.tsx";
import { TierExplanation } from "./tier-explanation";

const APPEAL_URL =
    "https://github.com/pollinations/pollinations/issues/new?template=tier-appeal.yml";

const MailIcon: FC<{ className?: string }> = ({ className }) => (
    <svg
        viewBox="0 0 24 24"
        className={className}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 7 9-7" />
    </svg>
);

const BeakerIcon: FC<{ className?: string }> = ({ className }) => (
    <svg
        viewBox="0 0 24 24"
        className={className}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        <path d="M9 3h6" />
        <path d="M10 3v6.5L4.5 18a2 2 0 0 0 1.7 3h11.6a2 2 0 0 0 1.7-3L14 9.5V3" />
        <path d="M7 14h10" />
    </svg>
);

const TierFinePrint: FC = () => (
    <div className="mt-5 space-y-2 border-t border-amber-300/70 pt-5 text-[13px] leading-snug text-amber-950/45">
        <p className="flex items-start gap-1.5">
            <MailIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
                Questions about your tier?{" "}
                <a
                    href={APPEAL_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline decoration-amber-700/25 underline-offset-2 transition-colors hover:text-amber-950"
                >
                    Contact us
                </a>
                .
            </span>
        </p>
        <p className="flex items-start gap-1.5">
            <BeakerIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
                We're in beta — pollen values and tier rules may evolve as we
                learn what works best.
            </span>
        </p>
    </div>
);

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

// ─── Microbe: Account Under Review ──────────────────────────

const MicrobeLimitedPanel: FC = () => (
    <div className="flex flex-col gap-3">
        <p className="text-sm text-gray-600 leading-relaxed">
            We're verifying that your account belongs to a real person. This
            usually takes a few days.
        </p>
        <TierFinePrint />
    </div>
);

// ─── Tier screen (spore + creator tiers) ─────────────────────

const TierScreen: FC<{
    tier: TierStatus;
    active_tier_name: string;
    pollen: number;
}> = ({ tier, active_tier_name, pollen }) => {
    const tierEmoji = getTierEmoji(tier);

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
                <InfoTip
                    tone="amber"
                    content={
                        <ul className="list-disc space-y-1 pl-4">
                            <li>
                                Pollen refills every hour up to your tier cap.
                            </li>
                            <li>
                                Requests that cost more than estimated can
                                briefly push your balance negative.
                            </li>
                            <li>
                                When negative, hourly refills bring it back up
                                one increment at a time until you hit your tier
                                cap.
                            </li>
                        </ul>
                    }
                />
            </div>

            <TierExplanation currentTier={tier} />

            <TierFinePrint />
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
