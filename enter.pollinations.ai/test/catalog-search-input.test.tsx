import { EditableCombobox } from "@pollinations/ui";
import type { ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
import { fetchModelCatalog } from "../frontend/src/components/models/model-catalog.ts";
import { Models } from "../frontend/src/components/models/models.tsx";

vi.mock("@ark-ui/react/portal", () => ({
    Portal: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@pollinations/ui", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@pollinations/ui")>()),
    EditableCombobox: () => null,
}));
vi.mock("@tanstack/react-router", () => ({
    useNavigate: () => vi.fn(),
    useSearch: () => ({}),
}));
vi.mock("../frontend/src/components/models/model-catalog.ts", () => ({
    fetchModelCatalog: vi.fn(),
    getModelPricesFromCatalog: () => [],
}));
vi.mock("../frontend/src/components/models/use-model-stats.ts", () => ({
    useModelStats: () => ({ stats: undefined }),
}));
vi.mock("../frontend/src/config.ts", () => ({
    config: { apiBaseUrl: "/api", genBaseUrl: "https://gen.example" },
    genDocsUrl: () => "https://gen.example/docs",
}));

afterEach(() => vi.unstubAllGlobals());

it("keeps spaces when typing a multiword catalog search", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    const catalog =
        Promise.withResolvers<Awaited<ReturnType<typeof fetchModelCatalog>>>();
    vi.mocked(fetchModelCatalog).mockReturnValue(catalog.promise);
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
        renderer = create(<Models />);
    });
    await act(async () => catalog.resolve([]));
    const search = () => renderer?.root.findByType(EditableCombobox).props;

    try {
        for (const character of "gemini flash") {
            await act(async () => {
                search()?.onChange(search()?.value + character);
            });
        }
        expect(search()?.value).toBe("gemini flash");
    } finally {
        await act(async () => renderer?.unmount());
    }
});
