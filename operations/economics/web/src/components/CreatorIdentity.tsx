import { CopyButton } from "@pollinations/ui";

export function CreatorIdentity({
    recipientId,
    githubUsername,
    recipientName,
}: {
    recipientId: string;
    githubUsername: string;
    recipientName: string;
}) {
    const label = githubUsername.trim()
        ? `@${githubUsername}`
        : recipientName.trim() && recipientName !== recipientId
          ? recipientName
          : `…${recipientId.slice(-6)}`;

    return (
        <CopyButton
            value={recipientId}
            tooltip={<span className="break-all">{recipientId}</span>}
            copiedTooltip="Copied user ID"
            tooltipAlign="start"
            tooltipMaxWidth={420}
            aria-label={`Copy user ID for ${label}`}
            className="cursor-copy bg-transparent p-0 text-left font-semibold text-inherit"
        >
            {label}
        </CopyButton>
    );
}
