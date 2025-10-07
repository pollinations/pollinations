import type { FC } from "react";

type PollenBalanceProps = {
    balance: number;
};

export const PollenBalance: FC<PollenBalanceProps> = ({ balance }) => {
    return (
        <div className="bg-emerald-100 rounded-2xl p-8 border border-pink-300">
            <div className="flex flex-col items-center text-center pb-1">
                <div className="flex">
                    <span className="text-6xl font-subheading text-green-950 tabular-nums">
                        {balance.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                        })}
                    </span>
                </div>
            </div>
        </div>
    );
};

