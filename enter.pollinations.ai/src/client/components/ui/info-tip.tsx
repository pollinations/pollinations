import { type FC, useState } from "react";

type InfoTipProps = {
    text: string;
    label?: string;
};

/**
 * Small "i" button with a tooltip popup on hover/click.
 * Used next to form labels to provide contextual help.
 */
export const InfoTip: FC<InfoTipProps> = ({ text, label = "More info" }) => {
    const [show, setShow] = useState(false);

    return (
        <button
            type="button"
            className="relative inline-flex items-center"
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShow((prev) => !prev);
            }}
            onMouseEnter={() => setShow(true)}
            onMouseLeave={() => setShow(false)}
            aria-label={label}
        >
            <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-pink-100 border border-pink-300 text-pink-500 hover:bg-pink-200 hover:border-pink-400 transition-colors text-[10px] font-bold cursor-pointer">
                i
            </span>
            <span
                className={`${show ? "visible" : "invisible"} absolute left-0 top-full mt-1 px-3 py-2 bg-gradient-to-r from-pink-50 to-purple-50 text-gray-800 text-xs font-normal rounded-lg shadow-lg border border-pink-200 w-max max-w-[200px] sm:max-w-none z-50 pointer-events-none`}
            >
                {text}
            </span>
        </button>
    );
};
