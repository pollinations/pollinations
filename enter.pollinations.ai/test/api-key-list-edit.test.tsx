import type { ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { expect, it, vi } from "vitest";
import { ApiKeyList } from "../frontend/src/components/keys/api-key-list.tsx";
import type { ApiKey } from "../frontend/src/components/keys/types.ts";

vi.mock("../frontend/src/config.ts", () => ({
    config: { genBaseUrl: "https://gen.example" },
    genDocsUrl: (hash = "") => `https://gen.example/docs${hash}`,
}));
// The test renderer has no DOM to portal into: render dialogs in place.
vi.mock("@ark-ui/react/portal", () => ({
    Portal: ({ children }: { children: ReactNode }) => children,
}));

const key = (pollenBalance: number): ApiKey => ({
    id: "key-1",
    name: "Budgeted key",
    start: "sk_abc",
    createdAt: "2026-10-01T00:00:00.000Z",
    permissions: null,
    metadata: { keyType: "secret" },
    pollenBalance,
});

it("opens the editor with the key's current budget, not the one loaded with the page", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    // Loaded with 5 Pollen; API calls have since spent 3 of them.
    const onRefresh = vi.fn(async () => [key(2)]);
    let renderer: ReactTestRenderer | undefined;
    try {
        await act(async () => {
            renderer = create(
                <ApiKeyList
                    apiKeys={[key(5)]}
                    onCreate={vi.fn()}
                    onUpdate={vi.fn()}
                    onDelete={vi.fn()}
                    onRefresh={onRefresh}
                />,
            );
        });
        const [edit] =
            renderer?.root.findAll(
                (node) => node.props.title === "Edit secret key",
            ) ?? [];
        await act(async () => edit?.props.onClick());

        const budget = renderer?.root.find(
            (node) =>
                node.type === "input" && node.props.name === "pollen-budget",
        );
        expect(budget?.props.value).toBe("2");
        expect(onRefresh).toHaveBeenCalledOnce();
    } finally {
        await act(async () => renderer?.unmount());
        vi.unstubAllGlobals();
    }
});
