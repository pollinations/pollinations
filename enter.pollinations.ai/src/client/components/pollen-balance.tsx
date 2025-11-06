import type { FC } from "react";

type PollenBalanceProps = {
    balances: {
        tier: number;
        pack: number;
    };
    dailyPollen?: number;
};

export const PollenBalance: FC<PollenBalanceProps> = ({ balances, dailyPollen = 15 }) => {
    // Use real balances
    const freePollen = balances.tier; // Free pollen from tier
    const packPollen = balances.pack; // Pack pollen
    const totalPollen = freePollen + packPollen; // Total available
    
    // Calculate percentages for the segmented gauge
    const freePercentage = totalPollen > 0 ? (freePollen / totalPollen) * 100 : 0;
    const packPercentage = totalPollen > 0 ? (packPollen / totalPollen) * 100 : 0;
    
    return (
        <div className="bg-emerald-100 rounded-2xl p-8 border border-purple-300">
            <div className="flex flex-row justify-center text-center pb-1">
                {/* Combined Pollen Gauge */}
                <div className="flex flex-col items-center gap-4">
                    {/* Pollen amount above gauge */}
                    <span className="text-6xl font-bold text-green-950 tabular-nums">
                        {totalPollen.toFixed(2)} pollen
                    </span>
                    {/* Gauge */}
                    <div className="relative w-[500px] h-8 bg-gray-200 rounded-full overflow-hidden border border-purple-400">
                        {/* Pack Pollen - Soft purple for paid */}
                        <div 
                            className="absolute inset-y-0 left-0 bg-purple-200 transition-all duration-500 ease-out"
                            style={{ width: `${packPercentage}%` }}
                        >
                            {/* Pack label inside */}
                            {packPercentage > 15 && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="text-purple-900 font-bold text-sm">
                                        💎 {packPollen.toFixed(1)}
                                    </span>
                                </div>
                            )}
                        </div>
                        {/* Free Pollen - Soft teal for free */}
                        <div 
                            className="absolute inset-y-0 bg-teal-200 transition-all duration-500 ease-out"
                            style={{ 
                                left: `${packPercentage}%`,
                                width: `${freePercentage}%`
                            }}
                        >
                            {/* Free label inside */}
                            {freePercentage > 15 && (
                                <div className="absolute inset-0 flex items-center justify-center gap-1">
                                    <span className="text-gray-900 font-extrabold text-sm">
                                        FREE
                                    </span>
                                    <span className="text-gray-900 font-bold text-sm">
                                        {freePollen.toFixed(1)}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
