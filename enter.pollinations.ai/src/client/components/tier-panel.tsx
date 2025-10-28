import type { FC } from "react";

type TierStatus = "none" | "seed" | "flower" | "nectar";

interface TierPanelProps {
    status: TierStatus;
    assigned_tier: TierStatus;
    next_refill_at_utc: string;
    product_name?: string;
    daily_pollen?: number;
}

const TIER_CONFIG = {
    seed: {
        emoji: "🌱",
        name: "Seed",
        pollen: 10,
        badgeColors: "bg-emerald-100 border border-emerald-400 text-emerald-800",
    },
    flower: {
        emoji: "🌸",
        name: "Flower",
        pollen: 15,
        badgeColors: "bg-fuchsia-100 border border-fuchsia-400 text-fuchsia-800",
    },
    nectar: {
        emoji: "🍯",
        name: "Nectar",
        pollen: 20,
        badgeColors: "bg-amber-100 border border-amber-400 text-amber-800",
    },
} as const;

const TIER_ORDER = ["seed", "flower", "nectar"] as const;

function capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatCountdown(targetUTC: string): string {
    const diff = new Date(targetUTC).getTime() - Date.now();
    if (diff <= 0) return "0h 0m";
    
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
}

const NoTierScreen: FC = () => {
    return (
        <div className="rounded-2xl p-8 border-2 border-gray-300">
            <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                    <span className="text-3xl">🥺</span>
                    <span className="text-xl text-gray-900">
                        No active tier subscription
                    </span>
                </div>
                <p className="text-sm text-gray-700 ml-11">
                    Activate your tier by clicking the <span className="text-blue-600">Activate Tier</span> button above.
                </p>
            </div>
        </div>
    );
};

const TierScreen: FC<{
    tier: keyof typeof TIER_CONFIG;
    assigned_tier: TierStatus;
    countdown: string;
    product_name?: string;
    daily_pollen?: number;
}> = ({
    tier,
    assigned_tier,
    countdown,
    product_name,
    daily_pollen,
}) => {
    const config = TIER_CONFIG[tier];
    const displayName = product_name || config.name;
    const pollenAmount = daily_pollen || config.pollen;

    // Detect tier change
    const tierWillChange = assigned_tier !== "none" && assigned_tier !== tier;
    const isUpgrade = tierWillChange && TIER_ORDER.indexOf(assigned_tier) > TIER_ORDER.indexOf(tier);
    const assignedTierName = assigned_tier !== "none" ? capitalize(assigned_tier) : "";

    return (
        <div className="rounded-2xl p-6 border-2 border-gray-300 bg-gray-50/30">
            <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-3xl">{config.emoji}</span>
                    <span className="text-xl font-subheading text-gray-900">
                        {displayName}
                    </span>
                    <span className={`inline-flex items-center px-3 py-1 rounded-full font-semibold text-sm ${config.badgeColors}`}>
                        {pollenAmount} pollen/day
                    </span>
                    <span className="inline-flex items-center px-3 py-1 rounded-full font-semibold text-sm bg-blue-100 border border-blue-300 text-blue-800">
                        ⏱️ {countdown}
                    </span>
                </div>

                <div className="px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm text-green-900 leading-relaxed">
                        {tierWillChange ? (
                            <>
                                ✓ <strong>Active Subscription:</strong> Your tier will be <strong>{isUpgrade ? "upgraded" : "downgraded"} to {assignedTierName} Tier</strong> on next renewal (in {countdown}).
                                <br />
                                Unused pollen does not carry over.
                            </>
                        ) : (
                            <>
                                ✓ <strong>Active Subscription:</strong> Your tier subscription is active and will earn you {pollenAmount} pollen daily.
                                <br />
                                Unused pollen does not carry over.
                            </>
                        )}
                    </p>
                </div>
                
                <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-xs text-amber-900 leading-relaxed">
                        ⚠️ <strong>Beta Notice:</strong> Daily pollen amounts are experimental values that may change at any time without notice. Tier subscription benefits are not yet finalized.
                    </p>
                </div>
            </div>
        </div>
    );
};

export const TierPanel: FC<TierPanelProps> = ({
    status,
    assigned_tier,
    next_refill_at_utc,
    product_name,
    daily_pollen,
}) => {
    if (status === "none") {
        return <NoTierScreen />;
    }

    return (
        <TierScreen 
            tier={status}
            assigned_tier={assigned_tier}
            countdown={formatCountdown(next_refill_at_utc)}
            product_name={product_name}
            daily_pollen={daily_pollen}
        />
    );
};
