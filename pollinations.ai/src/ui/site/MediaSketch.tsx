/** Small media drawings shared by the catalog and Play's heading. */
export function MediaSketch({ kind }: { kind: "image" | "audio" | "video" }) {
    return (
        <svg
            aria-hidden="true"
            className={`site-media-sketch site-media-${kind}`}
            viewBox="0 0 88 64"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            {kind === "image" && (
                <>
                    <rect
                        x="18"
                        y="9"
                        width="59"
                        height="43"
                        rx="5"
                        transform="rotate(9 47 30)"
                        opacity="0.3"
                    />
                    <g className="site-media-front">
                        <rect
                            x="9"
                            y="15"
                            width="59"
                            height="43"
                            rx="5"
                            fill="var(--polli-color-bg-subtle)"
                        />
                        <circle
                            cx="51"
                            cy="28"
                            r="5"
                            fill="currentColor"
                            stroke="none"
                        />
                        <path d="m10 49 18-18 15 16 9-8 15 15" />
                    </g>
                </>
            )}
            {kind === "audio" && (
                <g strokeWidth="5">
                    {[12, 27, 43, 31, 50, 23, 10].map((height, index) => (
                        <path
                            key={height}
                            className="site-wave"
                            d={`M${14 + index * 10} ${32 - height / 2}v${height}`}
                        />
                    ))}
                </g>
            )}
            {kind === "video" && (
                <>
                    <path d="M23 9h51a5 5 0 0 1 5 5v32" opacity="0.3" />
                    <path d="M17 15h51a5 5 0 0 1 5 5v32" opacity="0.55" />
                    <g className="site-media-front">
                        <rect
                            x="9"
                            y="22"
                            width="58"
                            height="35"
                            rx="5"
                            fill="var(--polli-color-bg-subtle)"
                        />
                        <path
                            d="m33 32 14 8-14 8Z"
                            fill="currentColor"
                            stroke="none"
                        />
                    </g>
                </>
            )}
        </svg>
    );
}
