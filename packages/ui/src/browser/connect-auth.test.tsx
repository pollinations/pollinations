import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ConnectAuth } from "./connect-auth.tsx";
import { connectOptions } from "./connect-options.ts";

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
        <ConnectAuth
            {...connectOptions({
                getAttribute: (name) => (name === "app-key" ? appKey : null),
            })}
            onChange={onChange}
        >
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
