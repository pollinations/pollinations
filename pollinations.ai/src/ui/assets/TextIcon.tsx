// Text Icon Component
export function TextIcon({ className = "w-4 h-4", stroke = "currentColor" }) {
    return (
        <svg
            className={className}
            fill="none"
            strokeWidth="1.5"
            viewBox="0 0 24 24"
            aria-label="Text"
        >
            <rect x="3" y="3" width="18" height="18" rx="2" stroke={stroke} />
            <path
                d="M7 9h10M7 13h10M7 17h6"
                stroke={stroke}
                strokeLinecap="round"
            />
        </svg>
    );
}
