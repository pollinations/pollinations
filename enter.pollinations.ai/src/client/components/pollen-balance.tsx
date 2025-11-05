import type { FC } from "react";

type PollenBalanceProps = {
    balances: {
        tier: number;
        pack: number;
    };
};

export const PollenBalance: FC<PollenBalanceProps> = ({ balances }) => {
    return (
        <div className="bg-emerald-100 rounded-2xl p-8 border border-pink-300">
            <div className="flex flex-col items-center text-center pb-1">
                <div className="flex items-baseline gap-2">
                    <span className="text-6xl font-subheading text-green-950 tabular-nums">
                        {balances.tier.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                        })}
                    </span>
                    <span className="text-2xl font-subheading text-green-950">
                        pollen (tier)
                    </span>
                </div>
                <div className="flex items-baseline gap-2">
                    <span className="text-6xl font-subheading text-green-950 tabular-nums">
                        {balances.pack.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                        })}
                    </span>
                    <span className="text-2xl font-subheading text-green-950">
                        pollen (pack)
                    </span>
                </div>
            </div>
        </div>
    );
};
