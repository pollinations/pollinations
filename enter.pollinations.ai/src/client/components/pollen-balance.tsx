import type { FC } from "react";

type PollenBalanceProps = {
    tierBalance: number;
    packBalance: number;
};

export const PollenBalance: FC<PollenBalanceProps> = ({ tierBalance, packBalance }) => {
    const total = tierBalance + packBalance;
    
    return (
        <div className="bg-emerald-100 rounded-2xl p-8 border border-pink-300">
            <div className="flex flex-col items-center text-center pb-1">
                <div className="flex items-baseline gap-2">
                    <span className="text-6xl font-subheading text-green-950 tabular-nums">
                        {total.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                        })}
                    </span>
                    <span className="text-2xl font-subheading text-green-950">
                        pollen
                    </span>
                </div>
                <div className="flex gap-6 mt-4 text-sm">
                    <div className="flex flex-col items-center">
                        <span className="text-green-700 font-medium">Tier</span>
                        <span className="text-green-950 tabular-nums">
                            {tierBalance.toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                            })}
                        </span>
                    </div>
                    <div className="flex flex-col items-center">
                        <span className="text-green-700 font-medium">Pack</span>
                        <span className="text-green-950 tabular-nums">
                            {packBalance.toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                            })}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

