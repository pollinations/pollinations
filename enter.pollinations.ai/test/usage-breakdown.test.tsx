import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
import { UsageBreakdownTable } from "../frontend/src/components/activity/usage-section.tsx";

vi.mock("../frontend/src/api.ts", () => ({ accountClient: {} }));
vi.mock("../frontend/src/config.ts", () => ({
    config: { apiBaseUrl: "/api", genBaseUrl: "https://gen.example" },
    genDocsUrl: () => "https://gen.example/docs",
}));
afterEach(() => vi.unstubAllGlobals());

it("shows 15 usage groups at a time while keeping full totals and resets for new selections", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const breakdowns = Array.from({ length: 1000 }, (_, index) => ({
        id: String(index),
        label: `Model ${index}`,
        requests: 1,
        pollen: 1,
        paidPollen: 1,
        tierPollen: 0,
        paidRequests: 1,
        tierRequests: 0,
    }));
    const stats = {
        breakdowns,
        totalRequests: 1000,
        totalPollen: 1000,
        paidPollen: 1000,
        tierPollen: 0,
        paidRequests: 1000,
        tierRequests: 0,
    };
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
        renderer = create(
            <UsageBreakdownTable
                stats={stats}
                metric="requests"
                groupBy="model"
                onGroupByChange={() => {}}
            />,
        );
    });
    const rows = () => renderer?.root.findByType("tbody").findAllByType("tr");
    const more = () =>
        renderer?.root
            .findAllByType("button")
            .find((button) => button.children.includes("Show more"));
    expect(rows()).toHaveLength(15);
    expect(rows()?.[0].findAllByType("td")[1].children.join("")).toBe("0.1%");
    expect(JSON.stringify(renderer?.toJSON())).toContain("1K");
    await act(async () => more()?.props.onClick());
    expect(rows()).toHaveLength(30);
    await act(async () => {
        renderer?.update(
            <UsageBreakdownTable
                stats={{ ...stats, breakdowns: breakdowns.slice(0, 16) }}
                metric="requests"
                groupBy="key"
                onGroupByChange={() => {}}
            />,
        );
    });
    expect(rows()).toHaveLength(15);
    await act(async () => more()?.props.onClick());
    expect(rows()).toHaveLength(16);
    expect(more()).toBeUndefined();
    await act(async () => renderer?.unmount());
});
