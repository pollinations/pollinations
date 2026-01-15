import type { FC } from "react";

type StatProps = {
    label: string;
    value: string;
};

export const Stat: FC<StatProps> = ({ label, value }) => (
    <div className="flex flex-row justify-between items-center sm:flex-col sm:items-start">
        <span className="text-[10px] uppercase tracking-wide text-pink-400 font-bold">
            {label}
        </span>
        <span className="text-lg font-bold text-green-950 tabular-nums">
            {value}
        </span>
    </div>
);
