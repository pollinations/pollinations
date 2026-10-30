import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
import { forgetSessionToken } from "../frontend/src/api.ts";
import { LastEventsPanel } from "../frontend/src/components/pollen/last-events-panel.tsx";

vi.mock("../frontend/src/config.ts", () => ({
    config: {
        apiBaseUrl: "https://enter.example/api",
        genBaseUrl: "https://gen.example",
    },
    genDocsUrl: () => "https://gen.example/docs",
}));

let renderer: ReactTestRenderer | undefined;

afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
    forgetSessionToken();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

async function mount() {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("window", new EventTarget());
    await act(async () => {
        renderer = create(<LastEventsPanel />);
    });
    await act(async () => {
        await vi.waitFor(() =>
            expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThanOrEqual(
                3,
            ),
        );
    });
}

function older() {
    return renderer?.root.findAll(
        (node) =>
            node.type === "button" && node.children.includes("Show older"),
    )[0];
}

function displayedRows() {
    return (
        renderer?.root
            .findByProps({ "aria-label": "Last events" })
            .findAllByType("tbody")[0]
            .findAllByType("tr") ?? []
    );
}

it("fetches fixed cursor pages and keeps buffered usage and same-event earnings", async () => {
    const usage = Array.from({ length: 30 }, (_, index) => ({
        timestamp: `2026-10-30 ${index < 20 ? "12:01" : "11:59"}:00`,
        cursor_event_id: `usage-${99 - index}`,
        model: `Usage ${index}`,
        api_key_id: "key",
        api_key: "App",
        meter_source: "pack",
        cost_usd: 0.1,
    }));
    const earnings = Array.from({ length: 18 }, (_, index) => ({
        timestamp: "2026-10-30 12:00:00",
        cursor_event_id: "same-generation",
        cursor_source: "community_model",
        cursor_entity_id: `model-${99 - index}`,
        entity_name: `Reward ${index}`,
        model: "owner/model",
        meter_source: "pack",
        pollen_earned: 0.1,
    }));
    const calls: URL[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = new URL(String(input));
        if (url.pathname === "/api/session-token")
            return Response.json({ token: "session-test", expiresIn: 3600 });
        calls.push(url);
        expect(url.searchParams.get("limit")).toBe("16");
        const nextPage = url.searchParams.has("before");
        if (url.pathname === "/account/usage") {
            if (nextPage)
                expect(url.searchParams.get("before_event_id")).toBe(
                    usage[15].cursor_event_id,
                );
            return Response.json({
                usage: nextPage ? usage.slice(16) : usage.slice(0, 16),
            });
        }
        expect(url.pathname).toBe("/account/earnings/transactions");
        if (nextPage) {
            expect(url.searchParams.get("before_event_id")).toBe(
                "same-generation",
            );
            expect(url.searchParams.get("before_source")).toBe(
                "community_model",
            );
            expect(url.searchParams.get("before_entity_id")).toBe(
                earnings[15].cursor_entity_id,
            );
        }
        return Response.json({
            transactions: nextPage ? earnings.slice(16) : earnings.slice(0, 16),
        });
    });

    await mount();
    expect(displayedRows()).toHaveLength(15);
    for (const count of [30, 45, 48]) {
        await act(async () => older()?.props.onClick());
        expect(displayedRows()).toHaveLength(count);
    }
    expect(older()).toBeUndefined();
    const labels = displayedRows().map((row) =>
        row
            .findByProps({ className: "truncate font-medium" })
            .children.join(""),
    );
    expect(labels).toEqual([
        ...usage.slice(0, 20).map((row) => row.model),
        ...earnings.map((row) => row.entity_name),
        ...usage.slice(20).map((row) => row.model),
    ]);
    expect(
        calls.filter((url) => url.pathname === "/account/usage"),
    ).toHaveLength(2);
    expect(
        calls.filter(
            (url) => url.pathname === "/account/earnings/transactions",
        ),
    ).toHaveLength(2);
});

it("retains displayed rows and both cursors when one next-page request fails", async () => {
    let fail = true;
    const calls: URL[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = new URL(String(input));
        if (url.pathname === "/api/session-token")
            return Response.json({ token: "session-test", expiresIn: 3600 });
        calls.push(url);
        const usage = url.pathname === "/account/usage";
        const nextPage = url.searchParams.has("before");
        if (!usage && nextPage && fail)
            return new Response(null, { status: 400 });
        const rows = Array.from({ length: nextPage ? 4 : 16 }, (_, index) => ({
            timestamp: `2026-10-30 12:00:${String(59 - 2 * (index + (nextPage ? 16 : 0)) - Number(usage)).padStart(2, "0")}`,
            cursor_event_id: `event-${99 - index - (nextPage ? 16 : 0)}`,
            cursor_source: "community_model",
            cursor_entity_id: "model",
            entity_name: "Reward",
            model: "owner/model",
            meter_source: "pack",
            pollen_earned: 0.1,
            cost_usd: 0.1,
        }));
        return Response.json(usage ? { usage: rows } : { transactions: rows });
    });

    await mount();
    expect(displayedRows()).toHaveLength(15);
    await act(async () => older()?.props.onClick());
    expect(displayedRows()).toHaveLength(15);
    fail = false;
    const retry = renderer?.root.findAll(
        (node) => node.type === "button" && node.children.includes("Try again"),
    )[0];
    expect(retry).toBeDefined();
    await act(async () => retry?.props.onClick());
    expect(displayedRows()).toHaveLength(30);
    expect(calls.slice(2, 4).map((url) => url.search)).toEqual(
        calls.slice(4, 6).map((url) => url.search),
    );
    await act(async () => older()?.props.onClick());
    expect(displayedRows()).toHaveLength(40);
    expect(older()).toBeUndefined();
});

it("aborts pending stream requests when the panel unmounts", async () => {
    const signals: AbortSignal[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        if (String(input).endsWith("/api/session-token"))
            return Response.json({ token: "session-test", expiresIn: 3600 });
        signals.push(init?.signal as AbortSignal);
        return new Promise<Response>(() => {});
    });
    await mount();
    expect(signals).toHaveLength(2);
    await act(async () => renderer?.unmount());
    expect(signals.every((signal) => signal.aborted)).toBe(true);
});
