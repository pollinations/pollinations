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

export function InstagramIcon(props: IconProps) {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
            <path
                fill="currentColor"
                d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23-.06-1.27-.07-1.65-.07-4.85s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41 1.27-.06 1.65-.07 4.85-.07M12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63c-.79.3-1.46.72-2.12 1.38C1.35 2.67.94 3.34.63 4.14.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.3.8.72 1.47 1.38 2.13.66.66 1.33 1.07 2.12 1.38.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56a5.7 5.7 0 0 0 2.13-1.38 5.7 5.7 0 0 0 1.38-2.13c.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91a5.7 5.7 0 0 0-1.38-2.12A5.7 5.7 0 0 0 19.86.63c-.76-.3-1.64-.5-2.91-.56C15.67.01 15.26 0 12 0m0 5.84A6.16 6.16 0 1 0 12 18.16 6.16 6.16 0 0 0 12 5.84m0 10.16A4 4 0 1 1 12 8a4 4 0 0 1 0 8m6.41-11.85a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88"
            />
        </svg>
    );
}

export function LinkedInIcon(props: IconProps) {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
            <path
                fill="currentColor"
                d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z"
            />
        </svg>
    );
}

export function RedditIcon(props: IconProps) {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
            <path
                fill="currentColor"
                d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12c-.69 0-1.25.561-1.25 1.25 0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"
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

export function TokensIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />
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

export function SearchIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
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

export function SparklesIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6Z" />
            <path d="m19 14 .8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8Z" />
            <path d="m5 13 .7 1.8 1.8.7-1.8.7L5 18l-.7-1.8-1.8-.7 1.8-.7Z" />
        </svg>
    );
}

export function CloudUploadIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <path d="M16 16l-4-4-4 4" />
            <path d="M12 12v9" />
            <path d="M20.4 17.2A5 5 0 0 0 18 8h-1.3A7 7 0 1 0 5.3 16.7" />
        </svg>
    );
}

export function CompassIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <circle cx="12" cy="12" r="10" />
            <polygon points="16 8 14 14 8 16 10 10 16 8" />
        </svg>
    );
}

export function MegaphoneIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <path d="M3 11v2a2 2 0 0 0 2 2h2l11 4V5L7 9H5a2 2 0 0 0-2 2Z" />
            <path d="M7 15l1.5 4.5A2 2 0 0 0 10.4 21H12" />
            <path d="M18 9.5a3 3 0 0 1 0 5" />
        </svg>
    );
}

export function RocketIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <path d="M4.5 16.5 3 21l4.5-1.5" />
            <path d="M12 15 9 12a18 18 0 0 1 7-8l5-1-1 5a18 18 0 0 1-8 7Z" />
            <path d="M9 12 4 11l4-4 4 1" />
            <path d="m12 15 1 4 4-4-1-4" />
            <circle cx="16" cy="8" r="1.5" />
        </svg>
    );
}

export function BotIcon(props: IconProps) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps} {...props}>
            <rect x="4" y="7" width="16" height="12" rx="3" />
            <path d="M12 7V3" />
            <path d="M9 3h6" />
            <circle cx="9" cy="13" r="1" fill="currentColor" stroke="none" />
            <circle cx="15" cy="13" r="1" fill="currentColor" stroke="none" />
            <path d="M9 17h6" />
        </svg>
    );
}

export type { IconProps } from "./types.ts";
