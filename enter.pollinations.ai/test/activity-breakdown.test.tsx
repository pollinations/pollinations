import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
import { BreakdownTable } from "../frontend/src/components/activity/activity-overview.tsx";
import { Chart } from "../frontend/src/components/activity/chart.tsx";

vi.mock("../frontend/src/api.ts", () => ({ accountClient: {} }));
vi.mock("../frontend/src/config.ts", () => ({
    config: { apiBaseUrl: "/api", genBaseUrl: "https://gen.example" },
    genDocsUrl: () => "https://gen.example/docs",
}));
afterEach(() => vi.unstubAllGlobals());

it("shows 15 rows at a time, keeps paging while picking and resets for every new list", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const entries = Array.from({ length: 1000 }, (_, index) => ({
        id: `models:${index}`,
        label: `Model ${index}`,
        list: "models" as const,
        value: String(index),
        selected: false,
        requests: 1,
        pollen: 1,
        paidPollen: 1,
        tierPollen: 0,
        paidRequests: 1,
        tierRequests: 0,
    }));
    const totals = {
        requests: 1000,
        pollen: 1000,
        paidPollen: 1000,
        tierPollen: 0,
        paidRequests: 1000,
        tierRequests: 0,
    };
    const onToggle = vi.fn();
    const table = (list: typeof entries) => (
        <BreakdownTable
            entries={list}
            totals={totals}
            metric="requests"
            header="Models"
            selecting={false}
            onToggle={onToggle}
        />
    );
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
        renderer = create(table(entries));
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
    await act(async () => rows()?.[20].props.onClick());
    expect(onToggle).toHaveBeenCalledWith(entries[20]);
    await act(async () => {
        renderer?.update(
            table(
                entries.map((entry, index) =>
                    index === 20 ? { ...entry, selected: true } : entry,
                ),
            ),
        );
    });
    expect(rows()).toHaveLength(30);
    await act(async () => {
        renderer?.update(table(entries.slice(0, 16)));
    });
    expect(rows()).toHaveLength(15);
    // Coming back to an earlier list starts from the first page again.
    await act(async () => {
        renderer?.update(table(entries));
    });
    expect(rows()).toHaveLength(15);
    await act(async () => {
        renderer?.update(table(entries.slice(0, 16)));
    });
    await act(async () => more()?.props.onClick());
    expect(rows()).toHaveLength(16);
    expect(more()).toBeUndefined();
    await act(async () => renderer?.unmount());
});

it("labels a one-request chart with whole request counts", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
        renderer = create(
            <Chart
                data={[
                    {
                        label: "Nov 1",
                        value: 1,
                        tierValue: 1,
                        paidValue: 0,
                        timestamp: new Date("2026-11-01T00:00:00Z"),
                        fullDate: "Nov 1, 2026",
                    },
                ]}
                metric="requests"
                label="Requests"
                period={{ granularity: "month", period: "2026-11" }}
                onSelect={() => undefined}
            />,
        );
    });
    const axis = renderer?.root
        .findAllByType("text")
        .filter((text) => text.props.textAnchor === "start")
        .map((text) => text.children.join(""));
    expect(axis).toEqual(["0", "1"]);
    await act(async () => renderer?.unmount());
});
