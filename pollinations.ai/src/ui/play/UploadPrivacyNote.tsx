import { InlineLink, Text } from "@pollinations/ui";
import { Link } from "@tanstack/react-router";

export function UploadPrivacyNote({ id }: { id?: string }) {
    return (
        <Text id={id} size="xs" tone="muted">
            Uploaded files are public and stored temporarily.{" "}
            <InlineLink
                as={Link}
                to="/privacy"
                target="_blank"
                rel="noopener noreferrer"
            >
                Privacy
            </InlineLink>
        </Text>
    );
}
