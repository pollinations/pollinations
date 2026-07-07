import type { IconProps } from "./types.ts";

const strokeProps = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
} as const;

export function AppIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <rect x="2" y="4" width="20" height="14" rx="2" />
            <path d="M2 20h20" />
        </svg>
    );
}

export function BeakerIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <path d="M9 3h6" />
            <path d="M10 3v6.5L4.5 18a2 2 0 0 0 1.7 3h11.6a2 2 0 0 0 1.7-3L14 9.5V3" />
            <path d="M7 14h10" />
        </svg>
    );
}

export function BookIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <path d="M4 4h5a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z" />
            <path d="M20 4h-5a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h6z" />
        </svg>
    );
}

export function CheckIcon(props: IconProps) {
    return (
        <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            {...strokeProps}
            strokeWidth={2.5}
            {...props}
        >
            <polyline points="20 6 9 17 4 12" />
        </svg>
    );
}

export function ClipboardIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
    );
}

export function ClockIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
        </svg>
    );
}

export function DiscordIcon(props: IconProps) {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
            <path
                fill="currentColor"
                d="M20.32 4.37A19.8 19.8 0 0 0 15.36 2.83a.07.07 0 0 0-.08.04c-.21.38-.45.88-.62 1.27a18.27 18.27 0 0 0-5.52 0 12.84 12.84 0 0 0-.63-1.27.08.08 0 0 0-.08-.04A19.74 19.74 0 0 0 3.47 4.37a.07.07 0 0 0-.03.03C.31 9.07-.55 13.61-.13 18.1a.08.08 0 0 0 .03.06 19.9 19.9 0 0 0 6.08 3.07.08.08 0 0 0 .09-.03c.47-.64.88-1.31 1.24-2.02a.08.08 0 0 0-.04-.1 13.08 13.08 0 0 1-1.9-.91.08.08 0 0 1-.01-.13c.13-.1.25-.2.37-.29a.07.07 0 0 1 .08-.01 14.24 14.24 0 0 0 12.38 0 .07.07 0 0 1 .08.01c.12.1.25.2.38.3a.08.08 0 0 1-.01.12 12.22 12.22 0 0 1-1.9.9.08.08 0 0 0-.04.11c.36.7.77 1.38 1.23 2.02a.08.08 0 0 0 .1.03 19.84 19.84 0 0 0 6.08-3.07.08.08 0 0 0 .03-.05c.5-5.2-.84-9.7-3.77-13.71a.06.06 0 0 0-.03-.03ZM8.02 15.37c-1.18 0-2.16-1.08-2.16-2.4 0-1.32.96-2.4 2.16-2.4 1.2 0 2.18 1.09 2.16 2.4 0 1.32-.96 2.4-2.16 2.4Zm7.96 0c-1.18 0-2.16-1.08-2.16-2.4 0-1.32.96-2.4 2.16-2.4 1.2 0 2.18 1.09 2.16 2.4 0 1.32-.95 2.4-2.16 2.4Z"
            />
        </svg>
    );
}

export function DownloadIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
    );
}

export function ExternalLinkIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <path d="M7 17 17 7M9 7h8v8" />
        </svg>
    );
}

export function GenApiIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <path d="m8 3 4 1.5L16 3v18l-4-1.5L8 21z" />
            <path d="M8 3v18M16 3v18" />
        </svg>
    );
}

export function GitBranchIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <line x1="6" y1="3" x2="6" y2="15" />
            <circle cx="18" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <path d="M18 9a9 9 0 0 1-9 9" />
        </svg>
    );
}

export function GraduationCapIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <path d="M21.42 10.92a1 1 0 0 0-.02-1.84L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.83l8.57 3.91a2 2 0 0 0 1.66 0z" />
            <path d="M22 10v6" />
            <path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" />
        </svg>
    );
}

export function SparklesIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z" />
        </svg>
    );
}

export function GitHubIcon(props: IconProps) {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
            <path
                fill="currentColor"
                d="M12 .5A11.5 11.5 0 0 0 8.36 22.9c.58.11.79-.25.79-.56v-2.16c-3.21.7-3.89-1.38-3.89-1.38-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.04 1.76 2.71 1.25 3.37.96.11-.75.4-1.25.74-1.54-2.56-.29-5.26-1.28-5.26-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.06 0 0 .97-.31 3.16 1.18a10.88 10.88 0 0 1 5.76 0c2.19-1.49 3.15-1.18 3.15-1.18.63 1.6.23 2.77.11 3.06.74.81 1.19 1.84 1.19 3.1 0 4.43-2.7 5.4-5.27 5.69.41.36.78 1.06.78 2.14v3.19c0 .31.21.68.8.56A11.5 11.5 0 0 0 12 .5Z"
            />
        </svg>
    );
}

export function ImageIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-5-5L5 21" />
        </svg>
    );
}

export function CubeIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <path d="m21 16-9 5-9-5V8l9-5 9 5z" />
            <path d="m3 8 9 5 9-5" />
            <path d="M12 13v8" />
        </svg>
    );
}

export function AudioIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
        </svg>
    );
}

export function LockIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
    );
}

export function MailIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 7 9-7" />
        </svg>
    );
}

export function McpIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <rect x="2" y="7" width="8" height="10" rx="1.5" />
            <rect x="14" y="7" width="8" height="10" rx="1.5" />
            <path d="M10 12h4" />
        </svg>
    );
}

export function MenuIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
    );
}

export function NewspaperIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <path d="M5 4h12a1 1 0 0 1 1 1v14a1 1 0 0 0 1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h1z" />
            <path d="M18 8h2a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2" />
            <path d="M7 8h7M7 12h7M7 16h4" />
        </svg>
    );
}

export function PlusIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <path d="M12 5v14M5 12h14" />
        </svg>
    );
}

export function TerminalIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <polyline points="4 8 8 12 4 16" />
            <line x1="12" y1="20" x2="20" y2="20" />
        </svg>
    );
}

export function TargetIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="5" />
            <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
        </svg>
    );
}

export function TokensIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />
        </svg>
    );
}

export function UsageIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <path d="M4 18a8 8 0 1 1 16 0" />
            <path d="M12 18l3.5-5" />
            <path d="M7 18h10" />
            <path d="M7.5 12.5 6 11" />
            <path d="M16.5 12.5 18 11" />
        </svg>
    );
}

export function TrendUpIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <polyline points="3 17 9 11 13 15 21 7" />
            <polyline points="15 7 21 7 21 13" />
        </svg>
    );
}

export function EarningsIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <ellipse cx="10" cy="6" rx="6" ry="3" />
            <path d="M4 6v8c0 1.7 2.7 3 6 3 1.2 0 2.4-.2 3.3-.5" />
            <path d="M16 6v4" />
            <path d="M4 10c0 1.7 2.7 3 6 3 1.1 0 2.1-.1 3-.4" />
            <path d="M18 14v6" />
            <path d="M15 17h6" />
        </svg>
    );
}

export function WalletIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <path d="M3 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v2H5a2 2 0 0 0-2 2V7Z" />
            <path d="M3 11a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6Z" />
            <circle cx="17" cy="14" r="1.25" fill="currentColor" />
        </svg>
    );
}

export function MoonIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        </svg>
    );
}

export function SunIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
    );
}

export function XIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <path d="M18 6 6 18M6 6l12 12" />
        </svg>
    );
}

// --- Model modality / capability / price glyphs (single-ink, replace emoji) ---

export function ChatIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
    );
}

export function EyeIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    );
}

export function VideoIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <path d="m22 8-6 4 6 4V8z" />
            <rect x="2" y="6" width="14" height="12" rx="2" />
        </svg>
    );
}

export function MicIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <path d="M12 19v3" />
        </svg>
    );
}

export function SpeakerIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <path d="M11 5 6 9H2v6h4l5 4z" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
    );
}

export function ReasoningIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <path d="M9 18h6M10 22h4M15.1 14c.2-1 .6-1.7 1.4-2.5A4.6 4.6 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.8.8 1.2 1.5 1.4 2.5" />
        </svg>
    );
}

export function RocketIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
            <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
            <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
            <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
        </svg>
    );
}

export function SearchIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
        </svg>
    );
}

export function SparkleIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.14 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z" />
            <path d="M20 3v4" />
            <path d="M22 5h-4" />
            <path d="M4 17v2" />
            <path d="M5 18H3" />
        </svg>
    );
}

export function CodeIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />
        </svg>
    );
}

export function DatabaseIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <ellipse cx="12" cy="5" rx="9" ry="3" />
            <path d="M3 5v14a9 3 0 0 0 18 0V5" />
            <path d="M3 12a9 3 0 0 0 18 0" />
        </svg>
    );
}

export function CardIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <path d="M2 10h20" />
        </svg>
    );
}

export function SproutIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <path d="M7 20h10" />
            <path d="M10 20c5.5-2.5.8-6.4 3-10" />
            <path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z" />
            <path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z" />
        </svg>
    );
}

export function PencilIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
    );
}

export function KeyIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <circle cx="7.5" cy="15.5" r="5.5" />
            <path d="m21 2-9.6 9.6" />
            <path d="m15.5 7.5 3 3L22 7l-3-3" />
        </svg>
    );
}

export function GlobeIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
            <path d="M2 12h20" />
        </svg>
    );
}

export type { IconProps } from "./types.ts";
