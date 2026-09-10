import { EditApiKeyDialog } from "./src/components/keys/edit-api-key-dialog";
import { DeleteConfirmation } from "./src/components/keys/key-delete-confirmation";
import type { ApiKey } from "./src/components/keys/types";

/** Real key dialogs with inert sample data; no credential is created or changed. */
export function PreviewKeyDialog({
    kind,
    deleting,
    onClose,
}: {
    kind: string | null;
    deleting: boolean;
    onClose: () => void;
}) {
    const key: ApiKey = {
        id: "preview-key",
        name:
            kind === "app"
                ? "Play registration"
                : kind === "secret"
                  ? "My API key"
                  : "Play",
        start: kind === "app" ? "pk_preview" : "sk_preview",
        createdAt: "2026-09-01T00:00:00Z",
        enabled: true,
        pollenBalance: 5,
        permissions: { account: ["profile", "usage"] },
        metadata:
            kind === "app"
                ? {
                      keyType: "publishable",
                      redirectUris: ["https://example.test/play"],
                      earningsEnabled: true,
                  }
                : { keyType: "secret" },
        byopClientKeyId: kind == null ? "preview-client" : null,
    };
    return deleting ? (
        <DeleteConfirmation
            deleteId={key.id}
            onCancel={onClose}
            onConfirm={onClose}
        />
    ) : (
        <EditApiKeyDialog
            apiKey={key}
            onClose={onClose}
            onUpdate={async () => {
                if (
                    new URLSearchParams(location.search).get("result") ===
                    "waiting"
                )
                    await new Promise<void>(() => {});
                throw new Error("Request failed. Try again.");
            }}
        />
    );
}
