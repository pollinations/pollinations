import { type FC, type ReactNode, useRef, useState } from "react";

type TooltipProps = {
    children: ReactNode;
    content: ReactNode;
    onClick?: () => void;
};

export const Tooltip: FC<TooltipProps> = ({ children, content, onClick }) => {
    const [showTooltip, setShowTooltip] = useState(false);
    const [mobileTop, setMobileTop] = useState(0);
    const buttonRef = useRef<HTMLButtonElement>(null);

    const updateMobilePosition = () => {
        if (buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setMobileTop(rect.bottom + 4);
        }
    };

    return (
        <button
            ref={buttonRef}
            type="button"
            className="relative cursor-default text-left"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            onClick={(e) => {
                e.stopPropagation();
                if (onClick) {
                    onClick();
                }
                updateMobilePosition();
                setShowTooltip((prev) => !prev);
            }}
        >
            <span className="md:cursor-default cursor-pointer">{children}</span>
            {/* Desktop: positioned relative to trigger */}
            <span
                className={`${
                    showTooltip ? "visible opacity-100" : "invisible opacity-0"
                } hidden md:block absolute left-0 top-full mt-1 px-3 py-2 bg-white text-gray-800 text-xs rounded-lg shadow-lg border border-gray-200 z-50 pointer-events-none transition-opacity min-w-max`}
            >
                {content}
            </span>
            {/* Mobile: horizontally centered on screen, vertically below trigger */}
            <span
                style={{ top: mobileTop }}
                className={`${
                    showTooltip ? "visible opacity-100" : "invisible opacity-0"
                } md:hidden fixed left-1/2 -translate-x-1/2 px-4 py-3 bg-white text-gray-800 text-xs rounded-lg shadow-xl border border-gray-200 z-50 pointer-events-none transition-opacity max-w-[90vw]`}
            >
                {content}
            </span>
        </button>
    );
};
