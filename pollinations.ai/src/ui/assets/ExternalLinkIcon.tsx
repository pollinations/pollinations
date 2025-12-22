// External Link Icon Component
// Used for buttons that link to external sites

export function ExternalLinkIcon({
    className = "w-3.5 h-3.5",
    stroke = "currentColor",
}) {
    return (
        <svg
            className={className}
            fill="none"
            strokeWidth="2.5"
            viewBox="0 0 12 12"
            aria-label="External link"
        >
            <path
                d="M1 11L11 1M11 1H4M11 1v7"
                strokeLinecap="square"
                stroke={stroke}
            />
        </svg>
    );
}
