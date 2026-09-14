import { InlineLink, Text } from "@pollinations/ui";
import { Link } from "@tanstack/react-router";

export function UploadPrivacyNote({
    id,
    className,
}: {
    id?: string;
    className?: string;
}) {
    return (
        <Text id={id} size="xs" tone="muted" className={className}>
            Uploaded files are publicly accessible and stored temporarily.{" "}
            <InlineLink
                as={Link}
                to="/terms"
                target="_blank"
                rel="noopener noreferrer"
            >
                Terms
            </InlineLink>
        </Text>
    );
}
