import { act, create } from "react-test-renderer";
import { expect, it, vi } from "vitest";
import { Chart } from "../frontend/src/components/activity/chart.tsx";

it("labels cost bars and axis in dollars, and request bars as requests", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const data = [
        {
            label: "Nov 16",
            value: 3,
            tierValue: 0,
            paidValue: 3,
            timestamp: new Date("2026-11-16T00:00:00Z"),
            fullDate: "November 16, 2026",
        },
    ];
    const render = async (metric: "pollen" | "requests") => {
        let renderer: ReturnType<typeof create> | undefined;
        await act(async () => {
            renderer = create(
                <Chart
                    data={data}
                    metric={metric}
                    label="Usage"
                    period={{ granularity: "month", period: "2026-11" }}
                    onSelect={() => {}}
                />,
            );
        });
        return renderer as ReturnType<typeof create>;
    };

    const costs = await render("pollen");
    const bar = costs.root.find(
        (node) => node.type === "rect" && node.props.role === "button",
    );
    expect(bar.props["aria-label"]).toMatch(/^November 16, 2026: \$3\. /);
    const ticks = costs.root
        .findAll((node) => node.type === "text")
        .map((node) => node.children.join(""));
    expect(ticks.some((tick) => tick.startsWith("$"))).toBe(true);

    const requests = await render("requests");
    const requestBar = requests.root.find(
        (node) => node.type === "rect" && node.props.role === "button",
    );
    expect(requestBar.props["aria-label"]).toMatch(/: 3 requests\. /);
    vi.unstubAllGlobals();
});
