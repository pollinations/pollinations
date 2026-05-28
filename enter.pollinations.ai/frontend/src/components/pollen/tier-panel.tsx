import type { TierStatus } from "@shared/tier-config.ts";
import type { FC } from "react";
import { InfoTip } from "../ui/info-tip.tsx";
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

const TrendUpIcon: FC<{ className?: string }> = ({ className }) => (
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
        <polyline points="3 17 9 11 13 15 21 7" />
        <polyline points="15 7 21 7 21 13" />
    </svg>
);

type TierFinePrintProps = { showTierHint?: boolean };

const TierFinePrint: FC<TierFinePrintProps> = ({ showTierHint = false }) => (
    <div className="mt-5 space-y-2 border-t border-amber-300/70 pt-5 text-[13px] leading-snug text-amber-950/45">
        {showTierHint && (
            <p className="flex items-start gap-1.5">
                <TrendUpIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                    Higher tier → bigger hourly refill on your tier balance.
                    <InfoTip
                        content={
                            <ul className="list-disc space-y-1 pl-4">
                                <li>
                                    Pollen refills every hour up to your tier
                                    cap.
                                </li>
                                <li>
                                    Requests that cost more than estimated can
                                    briefly push your balance negative.
                                </li>
                                <li>
                                    When negative, hourly refills bring it back
                                    up one increment at a time until you hit
                                    your tier cap.
                                </li>
                            </ul>
                        }
                    />
                </span>
            </p>
        )}
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

// All tier levels render with the same `<Chip intent="tier">` recipe —
// the soft yellow chip. Tier identity is communicated via the emoji +
// name, not by colour.

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

const TierScreen: FC<{ tier: TierStatus }> = ({ tier }) => (
    <div className="flex flex-col gap-3">
        <TierExplanation currentTier={tier} />
        <TierFinePrint showTierHint />
    </div>
);

type TierPanelProps = {
    active: {
        tier: TierStatus;
        displayName: string;
        pollen?: number;
        cadence?: "hourly" | "none";
    };
};

export const TierPanel: FC<TierPanelProps> = ({ active }) => {
    if (active.tier === "microbe") {
        return <MicrobeLimitedPanel />;
    }
    return <TierScreen tier={active.tier} />;
};
