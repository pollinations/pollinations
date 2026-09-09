// Copy Icon Component
// Used for copy-to-clipboard buttons

export function CopyIcon({ className = "w-4 h-4", stroke = "currentColor" }) {
    return (
        <svg
            className={className}
            fill="none"
            strokeWidth="2"
            viewBox="0 0 16 16"
            aria-labelledby="copyIconTitle"
        >
            <title id="copyIconTitle">Copy</title>
            <rect
                x="5"
                y="5"
                width="9"
                height="9"
                strokeLinecap="square"
                stroke={stroke}
            />
            <path d="M11 5V3H3v8h2" strokeLinecap="square" stroke={stroke} />
        </svg>
    );
}
