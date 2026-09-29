import { act, createElement } from "react";
import { create } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
import { SOURCE_LABELS, useKpiData } from "../src/hooks/useKpiData";

let renderer;
afterEach(async () => {
    if (renderer) await act(async () => renderer.unmount());
    vi.unstubAllGlobals();
});

it("publishes each source, distinguishes pending from failed, and ignores an old range", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const requests = [];
    vi.stubGlobal(
        "fetch",
        vi.fn(
            (url) =>
                new Promise((resolve) => {
                    requests.push({ url, resolve });
                }),
        ),
    );
    let state;
    function Probe({ weeks }) {
        state = useKpiData(weeks);
        return null;
    }
    await act(async () => {
        renderer = create(createElement(Probe, { weeks: 8 }));
    });
    const reply = async (index, body, status = 200) => {
        await act(async () => {
            requests[index].resolve(Response.json(body, { status }));
        });
    };
    expect(requests).toHaveLength(1);
    expect(state.github.stars).toBeUndefined();
    expect(state.missing).toEqual([]);
    await reply(0, { stars: 123 });
    expect(state.github.stars).toBe(123);
    expect(state.loading).toBe(true);
    expect(requests).toHaveLength(2);
    await reply(1, { data: [{ week: "2026-09-21", registrations: 42 }] });
    expect(state.weeklyData).toEqual([
        { week: "2026-09-21", registrations: 42 },
    ]);
    expect(state.weeklyData[0].revenue).toBeUndefined();
    expect(state.missing).toEqual([]);
    await reply(2, {}, 503);
    expect(state.missing).toEqual(["Daily signups (D1 snapshot)"]);
    expect(state.weeklyData[0].registrations).toBe(42);

    // The pending old revenue request must not populate the newly selected range.
    await act(async () => renderer.update(createElement(Probe, { weeks: 12 })));
    expect(state.weeklyData).toEqual([]);
    expect(state.missing).toEqual([]);
    await reply(3, { data: [{ week: "2026-09-21", revenue: 999 }] });
    expect(state.weeklyData).toEqual([]);
    expect(state.done).toEqual([]);
    expect(requests).toHaveLength(5);

    for (let i = 0; i < SOURCE_LABELS.length; i++) {
        await reply(4 + i, i === 0 ? { stars: 456 } : { data: [] });
    }
    expect(state.loading).toBe(false);
    expect(state.done).toEqual(SOURCE_LABELS);
    expect(state.github.stars).toBe(456);
    expect(requests).toHaveLength(4 + SOURCE_LABELS.length);
});
