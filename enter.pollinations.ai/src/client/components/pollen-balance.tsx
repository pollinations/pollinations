import type { FC } from "react";

type PollenBalanceProps = {
    balance: number;
};

export const PollenBalance: FC<PollenBalanceProps> = ({ balance }) => {
    return (
        <div className="bg-emerald-100 rounded-2xl p-8 border border-emerald-200">
            <div className="flex flex-col items-center text-center pb-1">
                <p className="text-green-950">Balance</p>
                <div className="flex">
                    <span className="text-6xl font-subheading text-green-950 tabular-nums">
                        {balance.toLocaleString("en-US", {
                            minimumFractionDigits: 4,
                            maximumFractionDigits: 4,
                        })}
                    </span>
                </div>
            </div>
        </div>
    );
};

