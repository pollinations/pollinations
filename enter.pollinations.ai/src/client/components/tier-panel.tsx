import type { FC } from "react";
import { useState, useEffect } from "react";

type TierStatus = "none" | "seed" | "flower" | "nectar";

interface TierPanelProps {
    status: TierStatus;
    next_refill_at_utc: string;
}

const TIER_CONFIG = {
    seed: {
        emoji: "🌱",
        name: "Seed",
        pollen: 10,
        badgeColors: "bg-green-100 border-green-300 text-green-800",
    },
    flower: {
        emoji: "🌸",
        name: "Flower",
        pollen: 15,
        badgeColors: "bg-purple-100 border-purple-300 text-purple-800",
    },
    nectar: {
        emoji: "🍯",
        name: "Nectar",
        pollen: 20,
        badgeColors: "bg-yellow-100 border-yellow-300 text-yellow-800",
    },
} as const;

function useCountdownToMidnightUTC(targetUTC: string): string {
    const [countdown, setCountdown] = useState("");

    useEffect(() => {
        const updateCountdown = () => {
            const now = new Date();
            const target = new Date(targetUTC);
            const diff = target.getTime() - now.getTime();

            if (diff <= 0) {
                setCountdown("0h 0m");
                return;
            }

            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

            setCountdown(`${hours}h ${minutes}m`);
        };

        updateCountdown();
        const interval = setInterval(updateCountdown, 60000); // Update every minute

        return () => clearInterval(interval);
    }, [targetUTC]);

    return countdown;
}

const NoTierScreen: FC = () => {
    return (
        <div className="rounded-2xl p-8 border-2 border-gray-200">
            <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                    <span className="text-3xl">🔒</span>
                    <span className="text-xl font-subheading text-gray-900">
                        No sponsored tier
                    </span>
                </div>

                <p className="text-gray-600">
                    You can apply to join the daily sponsorship program.
                </p>

                <div className="flex items-center gap-2 text-gray-600">
                    <span>📬</span>
                    <span>Contact: hello@pollinations.ai</span>
                </div>

                <a
                    href="mailto:hello@pollinations.ai"
                    className="inline-flex items-center justify-center rounded-full px-6 py-2 border-2 border-gray-200 text-gray-900 hover:bg-gray-50 transition-colors font-medium"
                >
                    Email hello@pollinations.ai
                </a>
            </div>
        </div>
    );
};

const TierScreen: FC<{ tier: keyof typeof TIER_CONFIG; countdown: string }> = ({
    tier,
    countdown,
}) => {
    const config = TIER_CONFIG[tier];

    return (
        <div className="rounded-2xl p-6 border border-gray-200 bg-gray-50/30">
            <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                    <span className="text-3xl">{config.emoji}</span>
                    <span className="text-xl font-subheading text-gray-900">
                        {config.name}
                    </span>
                    <span className={`inline-flex items-center px-3 py-1 rounded-full font-semibold text-sm ${config.badgeColors}`}>
                        {config.pollen} pollen/day
                    </span>
                </div>
                
                <div className="mt-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-xs text-green-900 leading-relaxed">
                        🌿 Pollen refills every 24 hours from your subscription time. Unused pollen does not carry over.
                    </p>
                </div>
                
                <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-xs text-amber-900 leading-relaxed space-y-1">
                        <span className="block">⚠️ <strong>Beta Notice:</strong> Daily pollen amounts are experimental values that may change at any time without notice. Tier subscription benefits are not yet finalized.</span>
                        <span className="block">🔄 <strong>Migration:</strong> If your tier on auth.pollinations.ai doesn't match what's displayed here, please contact hello@pollinations.ai before activating. We're migrating users and your tier may take up to 24 hours to sync.</span>
                    </p>
                </div>
            </div>
        </div>
    );
};

export const TierPanel: FC<TierPanelProps> = ({
    status,
    next_refill_at_utc,
}) => {
    const countdown = useCountdownToMidnightUTC(next_refill_at_utc);

    if (status === "none") {
        return <NoTierScreen />;
    }

    return <TierScreen tier={status} countdown={countdown} />;
};
