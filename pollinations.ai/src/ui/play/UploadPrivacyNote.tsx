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
            Uploads are public and temporary.{" "}
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
