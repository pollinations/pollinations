import { useAuthActions } from "@pollinations/sdk/react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ConnectAuth } from "./connect-auth.tsx";

const roots: ReactTestRenderer[] = [];
let values: Map<string, string>;

beforeEach(() => {
    values = new Map();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("window", {
        location: new URL("https://app.example/"),
        sessionStorage: {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => values.set(key, value),
            removeItem: (key: string) => values.delete(key),
        },
    });
});

afterEach(async () => {
    await act(async () => {
        for (const root of roots.splice(0)) root.unmount();
    });
    vi.unstubAllGlobals();
});

test("switching App Keys hydrates the new connection, including signed out apps", async () => {
    values.set("polli:pk_first:token", "first-test-value");
    values.set("polli:pk_second:token", "second-test-value");
    const onChange = vi.fn();
    const render = (appKey: string) => (
        <ConnectAuth appKey={appKey} onChange={onChange}>
            {null}
        </ConnectAuth>
    );
    let root!: ReactTestRenderer;
    await act(async () => {
        root = create(render("pk_first"));
        roots.push(root);
    });
    expect(onChange).toHaveBeenLastCalledWith("first-test-value");

    await act(async () => root.update(render("pk_second")));
    expect(onChange).toHaveBeenLastCalledWith("second-test-value");

    await act(async () => root.update(render("pk_new")));
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(values.get("polli:pk_first:token")).toBe("first-test-value");
    expect(values.get("polli:pk_second:token")).toBe("second-test-value");
});

test("separate roots share connection changes only for the same App Key", async () => {
    const actions: ReturnType<typeof useAuthActions>[] = [];
    const updates = [vi.fn(), vi.fn(), vi.fn()];
    function CaptureActions({ index }: { index: number }) {
        actions[index] = useAuthActions();
        return null;
    }
    values.set("polli:pk_other:token", "other-test-value");
    await act(async () => {
        for (const [index, appKey] of [
            "pk_shared",
            "pk_shared",
            "pk_other",
        ].entries()) {
            roots.push(
                create(
                    <ConnectAuth appKey={appKey} onChange={updates[index]}>
                        <CaptureActions index={index} />
                    </ConnectAuth>,
                ),
            );
        }
    });

    await act(async () => actions[0].setApiKey("shared-test-value"));
    expect(updates[0]).toHaveBeenLastCalledWith("shared-test-value");
    expect(updates[1]).toHaveBeenLastCalledWith("shared-test-value");
    expect(updates[2]).toHaveBeenLastCalledWith("other-test-value");
    expect(values.get("polli:pk_shared:token")).toBe("shared-test-value");

    await act(async () => actions[1].logout());
    expect(updates[0]).toHaveBeenLastCalledWith(null);
    expect(updates[1]).toHaveBeenLastCalledWith(null);
    expect(updates[2]).toHaveBeenLastCalledWith("other-test-value");
    expect(values.has("polli:pk_shared:token")).toBe(false);
    expect(values.get("polli:pk_other:token")).toBe("other-test-value");
});
