import { Text } from "@pollinations/ui";

export function UploadPrivacyNote({
    id,
    className,
}: {
    id?: string;
    className?: string;
}) {
    return (
        <Text id={id} size="xs" tone="muted" className={className}>
            Uploaded files have public links. Storage is temporary.
        </Text>
    );
}
