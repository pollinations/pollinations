// Close Icon Component
// Used for close/remove buttons

export function CloseIcon({ className = "w-4 h-4", stroke = "currentColor" }) {
    return (
        <svg
            className={className}
            fill="none"
            strokeWidth="3"
            viewBox="0 0 16 16"
            aria-labelledby="closeIconTitle"
        >
            <title id="closeIconTitle">Close</title>
            <path
                d="M2 2L14 14M14 2L2 14"
                strokeLinecap="square"
                stroke={stroke}
            />
        </svg>
    );
}
