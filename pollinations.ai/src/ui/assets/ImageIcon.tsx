// Image Icon Component
export function ImageIcon({ className = "w-4 h-4", stroke = "currentColor" }) {
    return (
        <svg
            className={className}
            fill="none"
            strokeWidth="1.5"
            viewBox="0 0 24 24"
            aria-label="Image"
        >
            <rect x="3" y="3" width="18" height="18" rx="2" stroke={stroke} />
            <circle cx="8.5" cy="8.5" r="1.5" fill={stroke} />
            <path
                d="M21 15l-5-5L3 21"
                stroke={stroke}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}
