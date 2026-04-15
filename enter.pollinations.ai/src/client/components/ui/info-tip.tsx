import { type FC, useState } from "react";

type InfoTipProps = {
    text: string;
    label?: string;
    tone?: "pink" | "amber" | "blue" | "violet";
    placement?: "top" | "bottom";
};

const TONES = {
    pink: {
        badge: "bg-pink-100 border-pink-300 text-pink-500 hover:bg-pink-200 hover:border-pink-400",
        popup: "bg-gradient-to-r from-pink-50 to-purple-50 border-pink-200",
    },
    amber: {
        badge: "bg-amber-200 border-amber-400 text-amber-800 hover:bg-amber-300 hover:border-amber-500",
        popup: "bg-amber-50 border-amber-300",
    },
    blue: {
        badge: "bg-blue-100 border-blue-300 text-blue-600 hover:bg-blue-200 hover:border-blue-400",
        popup: "bg-gradient-to-r from-blue-50 to-sky-50 border-blue-200",
    },
    violet: {
        badge: "bg-violet-100 border-violet-300 text-violet-600 hover:bg-violet-200 hover:border-violet-400",
        popup: "bg-gradient-to-r from-violet-50 to-purple-50 border-violet-200",
    },
} as const;

/**
 * Small "i" button with a tooltip popup on hover/click.
 * Used next to form labels to provide contextual help.
 */
export const InfoTip: FC<InfoTipProps> = ({
    text,
    label = "More info",
    tone = "pink",
    placement = "bottom",
}) => {
    const [show, setShow] = useState(false);
    const classes = TONES[tone];
    const placementClasses =
        placement === "top" ? "bottom-full mb-1" : "top-full mt-1";

    return (
        <button
            type="button"
            className="relative inline-flex items-center ml-1"
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShow((prev) => !prev);
            }}
            onMouseEnter={() => setShow(true)}
            onMouseLeave={() => setShow(false)}
            aria-label={label}
        >
            <span
                className={`flex items-center justify-center w-3.5 h-3.5 rounded-full border transition-colors text-[10px] font-bold cursor-pointer ${classes.badge}`}
            >
                i
            </span>
            <span
                className={`${show ? "visible" : "invisible"} absolute right-0 sm:left-0 sm:right-auto ${placementClasses} px-3 py-2 text-gray-800 text-xs font-normal rounded-lg shadow-lg border w-[200px] sm:w-[280px] z-50 pointer-events-none ${classes.popup}`}
            >
                {text}
            </span>
        </button>
    );
};
