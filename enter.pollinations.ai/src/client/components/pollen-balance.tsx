import type { FC } from "react";

type PollenBalanceProps = {
    tierBalance: number;
    packBalance: number;
};

export const PollenBalance: FC<PollenBalanceProps> = ({
    tierBalance,
    packBalance,
}) => {
    const totalPollen = Math.max(0, tierBalance + packBalance);
    const freePercentage =
        totalPollen > 0 ? (tierBalance / totalPollen) * 100 : 0;
    const packPercentage =
        totalPollen > 0 ? (packBalance / totalPollen) * 100 : 0;

    return (
        <div className="bg-violet-50/30 rounded-2xl p-4 sm:p-8 border border-violet-300">
            <div className="flex flex-row justify-center text-center pb-1">
                {/* Combined Pollen Gauge */}
                <div className="flex flex-col items-center gap-4 w-full">
                    {/* Pollen amount above gauge */}
                    <span className="text-4xl sm:text-5xl md:text-6xl font-bold text-green-950 tabular-nums">
                        {totalPollen.toFixed(2)} pollen
                    </span>
                    {/* Gauge with download button */}
                    <div className="flex items-center gap-2 w-full max-w-[540px]">
                        <div className="relative flex-1 h-8 bg-gray-200 rounded-full overflow-hidden border border-purple-400">
                            {/* Pack Pollen - Soft purple for paid */}
                            <div
                                className="absolute inset-y-0 left-0 bg-purple-200 transition-all duration-500 ease-out"
                                style={{ width: `${packPercentage}%` }}
                            >
                                {/* Pack label inside */}
                                {packPercentage > 15 && (
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <span className="text-purple-900 font-bold text-sm">
                                            💎 {packBalance.toFixed(1)}
                                        </span>
                                    </div>
                                )}
                            </div>
                            {/* Free Pollen - Soft teal for free */}
                            <div
                                className="absolute inset-y-0 bg-teal-200 transition-all duration-500 ease-out"
                                style={{
                                    left: `${packPercentage}%`,
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
                        {/* Download usage button */}
                        <a
                            href="/api/usage?format=csv&limit=10000"
                            download="pollinations-usage.csv"
                            className="group relative flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors border border-gray-300"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="text-gray-600"
                            >
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                Download Usage CSV
                            </span>
                        </a>
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
            </div>
        </div>
    );
};
