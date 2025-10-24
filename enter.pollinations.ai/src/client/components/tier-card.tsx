import type { FC } from "react";
import { useState, useEffect } from "react";

type TierCardProps = {
    tier: "seed" | "flower" | "nectar";
};

const TIER_CONFIG = {
    nectar: {
        icon: "🌺",
        reward: 2.50,
    },
    flower: {
        icon: "🌸",
        reward: 1.00,
    },
    seed: {
        icon: "🌱",
        reward: 0.25,
    },
} as const;

export const TierCard: FC<TierCardProps> = ({ tier }) => {
    const config = TIER_CONFIG[tier];
    const [timeToMidnight, setTimeToMidnight] = useState("");
    const [copied, setCopied] = useState(false);

    // Calculate time until midnight UTC
    useEffect(() => {
        const updateCountdown = () => {
            const now = new Date();
            const tomorrow = new Date(now);
            tomorrow.setUTCHours(24, 0, 0, 0);
            const diff = tomorrow.getTime() - now.getTime();
            
            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            
            setTimeToMidnight(`${hours}h ${minutes}m`);
        };

        updateCountdown();
        const interval = setInterval(updateCountdown, 60000); // Update every minute

        return () => clearInterval(interval);
    }, []);

    // Generate coupon code
    const now = new Date();
    const month = now.toLocaleString("en-US", { month: "short" }).toUpperCase();
    const year = now.getFullYear();
    const couponCode = `${tier.toUpperCase()}-${month}-${year}`;

    // Calculate validity
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const validUntil = lastDay.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
    });

    const handleCopy = async () => {
        await navigator.clipboard.writeText(couponCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="bg-emerald-100 rounded-2xl p-8 border border-pink-300">
            <div className="flex flex-col gap-4">
                {/* Tier Badge */}
                <div className="flex items-center gap-3">
                    <span className="text-4xl">{config.icon}</span>
                    <span className="text-2xl font-subheading text-green-950">
                        {tier.charAt(0).toUpperCase() + tier.slice(1)} Tier
                    </span>
                </div>

                <div className="border-t border-pink-300" />

                {/* Daily Reward */}
                <div className="flex flex-col gap-1">
                    <div className="flex items-baseline gap-2">
                        <span className="text-lg font-medium text-green-950">
                            Daily Reward:
                        </span>
                        <span className="text-xl font-subheading text-green-950">
                            +${config.reward.toFixed(2)} pollen
                        </span>
                    </div>
                    <span className="text-sm text-green-950">
                        Automatically refills at midnight UTC
                    </span>
                    <span className="text-sm text-green-950">
                        Next refill in: {timeToMidnight}
                    </span>
                </div>

                <div className="border-t border-pink-300" />

                {/* Coupon */}
                <div className="flex flex-col gap-2">
                    <span className="text-sm font-medium text-green-950">
                        Monthly Coupon Code
                    </span>

                    <div className="bg-white rounded-lg border-2 border-pink-300 p-4 flex items-center justify-between">
                        <code className="text-lg font-mono font-semibold text-green-950">
                            {couponCode}
                        </code>
                        <button
                            onClick={handleCopy}
                            className="rounded-full px-3 py-1 border-2 border-pink-300 text-green-950 hover:bg-green-950 hover:text-green-100 transition-colors"
                        >
                            {copied ? "✓ Copied!" : "📋 Copy"}
                        </button>
                    </div>

                    <span className="text-xs text-green-950">
                        Valid until {validUntil}
                    </span>

                    <a
                        href={`https://polar.sh/pollinations/checkout?coupon=${couponCode}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-green-950 hover:opacity-70 underline"
                    >
                        Redeem on Polar.sh →
                    </a>
                </div>
            </div>
        </div>
    );
};
