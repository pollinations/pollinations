import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const strokeProps = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
} as const;

export function GridIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
    );
}

export function SmartphoneIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <rect x="6" y="2" width="12" height="20" rx="2" />
            <path d="M11 18h2" />
        </svg>
    );
}

export function RouteIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <circle cx="6" cy="5" r="2" />
            <circle cx="18" cy="19" r="2" />
            <path d="M8 5h8a3.5 3.5 0 0 1 0 7H8a3.5 3.5 0 0 0 0 7h8" />
        </svg>
    );
}
