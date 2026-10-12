import { Button } from "@pollinations/ui";
import { useRef, useState } from "react";
import { accountBearerToken } from "../../api.ts";
import { isSvgFile } from "./icon-upload.ts";

// The media service verifies the bearer against gen /account/key, so it accepts
// the dashboard's short-lived session token. Icon URLs must live on the public
// media origin, so uploads always go to production media.
const MEDIA_UPLOAD_URL = "https://media.pollinations.ai/upload";

export function IconUploadButton({
    onUploaded,
}: {
    onUploaded(url: string): void;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function upload(file: File): Promise<void> {
        if (!isSvgFile(file)) {
            setError("Only .svg files are allowed");
            return;
        }
        setError(null);
        setUploading(true);
        try {
            const token = await accountBearerToken();
            if (!token) throw new Error("Sign in again to upload");
            const form = new FormData();
            form.append("file", file, file.name);
            const response = await fetch(MEDIA_UPLOAD_URL, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
                body: form,
            });
            if (!response.ok) {
                throw new Error(`Upload failed (${response.status})`);
            }
            const { url } = (await response.json()) as { url: string };
            onUploaded(url);
        } catch (thrown) {
            setError(
                thrown instanceof Error ? thrown.message : "Upload failed",
            );
        } finally {
            setUploading(false);
        }
    }

    return (
        <>
            <input
                ref={inputRef}
                type="file"
                accept=".svg,image/svg+xml"
                className="hidden"
                onChange={(event) => {
                    const file = event.target.files?.[0];
                    // Reset so picking the same file again still fires change.
                    event.target.value = "";
                    if (file) void upload(file);
                }}
            />
            <Button
                type="button"
                intent="neutral"
                disabled={uploading}
                onClick={() => inputRef.current?.click()}
            >
                {uploading ? "Uploading…" : "Upload SVG"}
            </Button>
            {error && (
                <span className="text-xs text-intent-danger-text">{error}</span>
            )}
        </>
    );
}
