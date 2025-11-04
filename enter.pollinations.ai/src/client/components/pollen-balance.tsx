import type { FC } from "react";

type PollenBalanceProps = {
    tierBalance: number;
    packBalance: number;
    dailyPollen: number;
};

export const PollenBalance: FC<PollenBalanceProps> = ({ 
    tierBalance, 
    packBalance,
    dailyPollen
}) => {
    const total = tierBalance + packBalance;
    
    return (
        <div className="bg-emerald-100 rounded-2xl p-8 border border-pink-300">
            <div className="flex flex-col gap-4">
                {/* Total - Big and Centered */}
                <div className="flex flex-col items-center text-center">
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
                </div>

                {/* Text on top, thin gauge underneath */}
                <div className="flex flex-col gap-1 items-center">
                    {/* Text above */}
                    <span className="text-sm font-medium text-green-950 whitespace-nowrap">
                        free pollen : <span className="font-bold tabular-nums">{Math.round(dailyPollen > 0 ? (tierBalance / dailyPollen) * 100 : 0)}%</span>
                    </span>
                    
                    {/* Thin gauge underneath - same width as text */}
                    <div className="h-2 bg-emerald-100/50 rounded-full overflow-hidden border border-pink-200" style={{ width: '100%', maxWidth: 'fit-content', minWidth: '200px' }}>
                        <div 
                            className="h-full bg-gradient-to-r from-emerald-300 to-pink-300 transition-all duration-300"
                            style={{ width: `${dailyPollen > 0 ? (tierBalance / dailyPollen) * 100 : 0}%` }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

