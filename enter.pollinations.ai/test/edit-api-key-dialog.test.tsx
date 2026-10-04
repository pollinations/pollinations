import type { ComponentProps, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditApiKeyDialog } from "../frontend/src/components/keys/edit-api-key-dialog.tsx";
import type { KeyDialogContent } from "../frontend/src/components/keys/key-dialog-content.tsx";
import type { ApiKey } from "../frontend/src/components/keys/types.ts";

const dialog = vi.hoisted(() => ({
    content: null as ComponentProps<typeof KeyDialogContent> | null,
}));

vi.mock("../frontend/src/api.ts", () => ({ apiClient: {} }));
vi.mock("../frontend/src/config.ts", () => ({ genDocsUrl: () => "" }));
vi.mock("../frontend/src/components/layout/resource-dialog.tsx", () => ({
    ResourceDialog: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../frontend/src/components/keys/key-dialog-content.tsx", () => ({
    KeyDialogContent: (props: ComponentProps<typeof KeyDialogContent>) => {
        dialog.content = props;
        return null;
    },
}));

afterEach(() => {
    vi.useRealTimers();
    dialog.content = null;
});

describe("editing an API key's expiry", () => {
    it.each([
        ["fractional remaining day", "2026-10-04T11:00:00.000Z", 0],
        ["elapsed editing time", "2026-10-05T10:00:00.000Z", 300_000],
        ["elapsed whole day", "2026-10-05T10:00:00.000Z", 86_400_000],
        ["no expiry", null, 300_000],
    ])("preserves %s when saving without an expiry edit", async (_label, expiresAt, elapsed) => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-10-04T10:00:00.000Z"));
        const apiKey: ApiKey = {
            id: "synthetic-id",
            name: "Existing name",
            createdAt: "2026-10-01T10:00:00.000Z",
            expiresAt,
            permissions: { models: ["synthetic-model"], account: ["usage"] },
            metadata: null,
            pollenBalance: 10,
        };
        const onUpdate = vi.fn().mockResolvedValue(undefined);
        const onClose = vi.fn();
        renderToStaticMarkup(
            <EditApiKeyDialog
                apiKey={apiKey}
                onUpdate={onUpdate}
                onClose={onClose}
            />,
        );
        vi.setSystemTime(Date.now() + elapsed);
        expect(dialog.content).not.toBeNull();
        dialog.content?.onSubmit({ preventDefault() {} } as Parameters<
            NonNullable<typeof dialog.content>["onSubmit"]
        >[0]);
        await Promise.resolve();

        expect(onUpdate).toHaveBeenCalledExactlyOnceWith(apiKey.id, {
            name: apiKey.name,
            allowedModels: ["synthetic-model"],
            pollenBudget: 10,
            accountPermissions: ["usage"],
        });
        expect(onClose).toHaveBeenCalledOnce();
    });
});
