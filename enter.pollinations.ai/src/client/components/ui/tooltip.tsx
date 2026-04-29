import {
    type FC,
    type MouseEvent,
    type ReactNode,
    useRef,
    useState,
} from "react";

type TooltipProps = {
    children: ReactNode;
    content: ReactNode;
    onClick?: () => void;
    triggerAs?: "button" | "span";
};

export const Tooltip: FC<TooltipProps> = ({
    children,
    content,
    onClick,
    triggerAs = "button",
}) => {
    const [showTooltip, setShowTooltip] = useState(false);
    const [mobileTop, setMobileTop] = useState(0);
    const triggerRef = useRef<HTMLElement | null>(null);

    const updateMobilePosition = () => {
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setMobileTop(rect.bottom + 4);
        }
    };

    const contentNode = (
        <>
            <span className="md:cursor-default cursor-pointer">{children}</span>
            <span
                className={`${
                    showTooltip ? "visible opacity-100" : "invisible opacity-0"
                } hidden md:block absolute left-0 top-full mt-1 px-3 py-2 bg-white text-gray-800 text-xs rounded-lg shadow-lg border border-gray-200 z-50 pointer-events-none transition-opacity min-w-max`}
            >
                {content}
            </span>
            <span
                style={{ top: mobileTop }}
                className={`${
                    showTooltip ? "visible opacity-100" : "invisible opacity-0"
                } md:hidden fixed left-1/2 -translate-x-1/2 px-4 py-3 bg-white text-gray-800 text-xs rounded-lg shadow-xl border border-gray-200 z-50 pointer-events-none transition-opacity max-w-[90vw]`}
            >
                {content}
            </span>
        </>
    );

    const sharedProps = {
        className: "relative cursor-default text-left inline-flex items-center",
        onMouseEnter: () => setShowTooltip(true),
        onMouseLeave: () => setShowTooltip(false),
        onClick: (e: MouseEvent) => {
            e.stopPropagation();
            if (onClick) {
                onClick();
            }
            updateMobilePosition();
            setShowTooltip((prev) => !prev);
        },
    };

    if (triggerAs === "span") {
        return (
            <span
                ref={(node) => {
                    triggerRef.current = node;
                }}
                {...sharedProps}
            >
                {contentNode}
            </span>
        );
    }

    return (
        <button
            ref={(node) => {
                triggerRef.current = node;
            }}
            type="button"
            className="relative cursor-default text-left inline-flex items-center"
            onMouseEnter={sharedProps.onMouseEnter}
            onMouseLeave={sharedProps.onMouseLeave}
            onClick={sharedProps.onClick}
        >
            {contentNode}
        </button>
    );
};
