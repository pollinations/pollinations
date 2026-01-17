import type { FC } from "react";

type PollenBalanceProps = {
    tierBalance: number;
    packBalance: number;
    cryptoBalance: number;
};

export const PollenBalance: FC<PollenBalanceProps> = ({
    tierBalance,
    packBalance,
    cryptoBalance,
}) => {
    const paidBalance = packBalance + cryptoBalance;
    const totalPollen = Math.max(0, tierBalance + paidBalance);
    const freePercentage =
        totalPollen > 0 ? (tierBalance / totalPollen) * 100 : 0;
    const paidPercentage =
        totalPollen > 0 ? (paidBalance / totalPollen) * 100 : 0;

    return (
        <div className="bg-violet-50/30 rounded-2xl p-4 sm:p-8 border border-violet-300">
            <div className="flex flex-row justify-center text-center pb-1">
                {/* Combined Pollen Gauge */}
                <div className="flex flex-col items-center gap-4 w-full">
                    {/* Pollen amount above gauge */}
                    <span className="text-4xl sm:text-5xl md:text-6xl font-bold text-green-950 tabular-nums">
                        {totalPollen.toFixed(2)} pollen
                    </span>
                    {/* Gauge */}
                    <div className="w-full max-w-[540px]">
                        <div className="relative h-8 bg-gray-200 rounded-full overflow-hidden border border-purple-400">
                            {/* Paid Pollen - Soft purple for paid (pack + crypto) */}
                            <div
                                className="absolute inset-y-0 left-0 bg-purple-200 transition-all duration-500 ease-out"
                                style={{ width: `${paidPercentage}%` }}
                            >
                                {/* Paid label inside */}
                                {paidPercentage > 15 && (
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <span className="text-purple-900 font-bold text-sm">
                                            💎 {paidBalance.toFixed(1)}
                                        </span>
                                    </div>
                                )}
                            </div>
                            {/* Free Pollen - Soft teal for free */}
                            <div
                                className="absolute inset-y-0 bg-teal-200 transition-all duration-500 ease-out"
                                style={{
                                    left: `${paidPercentage}%`,
                                    width: `${freePercentage}%`,
                                }}
                            >
                                {/* Free label inside */}
                                {freePercentage > 15 && (
                                    <div className="absolute inset-0 flex items-center justify-center gap-1">
                                        <span className="text-gray-900 font-extrabold text-sm">
                                            FREE
                                        </span>
                                        <span className="text-gray-900 font-bold text-sm">
                                            {tierBalance.toFixed(1)}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            {/* Purchase info */}
            <div className="bg-gradient-to-r from-violet-100 to-purple-100 rounded-xl p-4 border border-violet-300 mt-4">
                <p className="text-sm font-medium text-violet-900">
                    🎁 During beta, we double your pollen with every purchase!
                </p>
                <p className="text-sm font-medium text-violet-900 mt-2">
                    ⏳ After a purchase, please wait 1-2 minutes for your
                    balance to update.{" "}
                    <a
                        href="https://github.com/pollinations/pollinations/issues/new?template=balance-problem.yml"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-violet-700"
                    >
                        Still missing?
                    </a>
                </p>
                <p className="text-sm font-medium text-violet-900 mt-2">
                    💳 Want to pay with a different method?{" "}
                    <a
                        href="https://github.com/pollinations/pollinations/issues/4826"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-violet-700"
                    >
                        Please vote
                    </a>
                </p>
            </div>
        </div>
    );
};
