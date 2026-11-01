import type { ReactNode } from "react";
import { monthName } from "../lib/months";

export function TrendPlot({
    rows,
    activeMonth,
    onInspect,
    label,
    children,
}: {
    rows: { month: string }[];
    activeMonth: string | null;
    onInspect: (month: string) => void;
    label: string;
    children: ReactNode;
}) {
    const slot = 528 / Math.max(1, rows.length);
    const x = (i: number) => 64 + slot * (i + 0.5);
    return (
        <div className="mt-2 overflow-x-auto">
            <svg
                viewBox="0 0 620 246"
                className="mx-auto w-full max-w-3xl"
                aria-label={label}
            >
                <title>{label}</title>
                {rows.map((row, i) => (
                    <g key={row.month}>
                        {row.month === activeMonth && (
                            <rect
                                x={x(i) - slot / 2}
                                y="16"
                                width={slot}
                                height="199"
                                fill="currentColor"
                                opacity="0.04"
                            />
                        )}
                        <text
                            x={x(i)}
                            y="235"
                            textAnchor="middle"
                            fill="currentColor"
                            fontSize="16"
                        >
                            {monthName(row.month).slice(0, 3)}
                        </text>
                    </g>
                ))}
                {children}
                {rows.map((row, i) => (
                    <foreignObject
                        key={row.month}
                        x={x(i) - slot / 2}
                        y="16"
                        width={slot}
                        height="201"
                    >
                        <button
                            type="button"
                            aria-label={`Inspect ${monthName(row.month)} ${row.month.slice(0, 4)}`}
                            className="block h-full w-full cursor-crosshair border-0 bg-transparent p-0 focus-visible:outline focus-visible:outline-1 focus-visible:outline-current"
                            onMouseEnter={() => onInspect(row.month)}
                            onFocus={() => onInspect(row.month)}
                            onClick={() => onInspect(row.month)}
                        />
                    </foreignObject>
                ))}
            </svg>
        </div>
    );
}
