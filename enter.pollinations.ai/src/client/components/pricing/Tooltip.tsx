import { type FC, type ReactNode, useState } from "react";

type TooltipProps = {
    children: ReactNode;
    text: string;
};

export const Tooltip: FC<TooltipProps> = ({ children, text }) => {
    const [showTooltip, setShowTooltip] = useState(false);

    return (
        <span
            className="relative cursor-default"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            onClick={(e) => {
                e.stopPropagation();
                setShowTooltip((prev) => !prev);
            }}
        >
            <span className="md:cursor-default cursor-pointer">{children}</span>
            <span
                className={`${
                    showTooltip ? "visible" : "invisible"
                } absolute left-1/2 -translate-x-1/2 top-full mt-1 px-2 py-1 bg-gradient-to-r from-pink-50 to-purple-50 text-gray-800 text-xs rounded-lg shadow-lg border border-pink-200 whitespace-nowrap z-50 pointer-events-none`}
            >
                {text}
            </span>
        </span>
    );
};
