import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    AuthContext,
    type AuthContextValue,
} from "./contexts.js";
import {
    type UseImageValue,
    type UseTextValue,
    useImage,
    useText,
} from "./generation.js";

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
    const status = init.status ?? 200;
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 401 ? "Unauthorized" : "OK",
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => body,
    } as Response;
}

function binaryResponse(
    bytes: Uint8Array,
    contentType = "image/png",
): Response {
    return {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": contentType }),
        arrayBuffer: async () =>
            bytes.buffer.slice(
                bytes.byteOffset,
                bytes.byteOffset + bytes.byteLength,
            ),
    } as Response;
}

async function waitFor(condition: () => boolean) {
    for (let i = 0; i < 30; i++) {
        await act(async () => {
            await Promise.resolve();
        });
        if (condition()) return;
    }
    throw new Error("Timed out waiting for condition");
}

function authValue(
    overrides: Partial<AuthContextValue> = {},
): AuthContextValue {
    return {
        apiKey: "test-key",
        isLoggedIn: true,
        isHydrated: true,
        error: null,
        login: vi.fn(),
        logout: vi.fn(),
        setApiKey: vi.fn(),
        enterUrl: "https://enter.example",
        apiBaseUrl: "https://enter.example/api",
        ...overrides,
    };
}

function renderWithAuth(
    node: React.ReactNode,
    value: AuthContextValue,
): ReactTestRenderer {
    let renderer: ReactTestRenderer | null = null;
    act(() => {
        renderer = create(
            <AuthContext.Provider value={value}>
                {node}
            </AuthContext.Provider>,
        );
    });
    if (!renderer) throw new Error("renderer not created");
    return renderer;
}

describe("generation hooks", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("loads text through the chat-completions endpoint", async () => {
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(
                jsonResponse({ choices: [{ message: { content: "hello" } }] }),
            );

        const latest: { current: UseTextValue | null } = { current: null };
        function Probe() {
            latest.current = useText("say hi");
            return null;
        }

        renderWithAuth(<Probe />, authValue());
        await waitFor(() => latest.current?.result === "hello");

        const [url, init] = fetchMock.mock.calls[0];
        expect(String(url)).toBe(
            "https://gen.pollinations.ai/v1/chat/completions",
        );
        expect(init?.method).toBe("POST");
        expect(latest.current?.error).toBeNull();
    });

    it("does not call the API when disabled and clears the result", async () => {
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(jsonResponse({ choices: [] }));

        const latest: { current: UseTextValue | null } = { current: null };
        function Probe({ enabled }: { enabled: boolean }) {
            latest.current = useText("say hi", { enabled });
            return null;
        }

        const renderer = renderWithAuth(<Probe enabled={true} />, authValue());
        await waitFor(() => latest.current?.isLoading === false);
        const callsBefore = fetchMock.mock.calls.length;

        await act(async () => {
            renderer.update(
                <AuthContext.Provider value={authValue()}>
                    <Probe enabled={false} />
                </AuthContext.Provider>,
            );
        });
        await waitFor(() => latest.current?.result === null);

        expect(fetchMock.mock.calls.length).toBe(callsBefore);
    });

    it("exposes the error for a failed request", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            jsonResponse({ error: { message: "boom" } }, { status: 500 }),
        );

        const latest: { current: UseTextValue | null } = { current: null };
        function Probe() {
            latest.current = useText("say hi");
            return null;
        }

        renderWithAuth(<Probe />, authValue());
        await waitFor(() => latest.current?.error != null);
        expect(latest.current?.error).toBeInstanceOf(Error);
    });

    it("logs out when the API returns 401", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            jsonResponse({ error: { message: "nope" } }, { status: 401 }),
        );

        const value = authValue();
        const latest: { current: UseTextValue | null } = { current: null };
        function Probe() {
            latest.current = useText("say hi");
            return null;
        }

        renderWithAuth(<Probe />, value);
        await waitFor(() => (value.logout as ReturnType<typeof vi.fn>).mock.calls.length > 0);
        expect(latest.current?.result).toBeNull();
    });

    it("generates an image and wraps it with helpers", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            binaryResponse(new Uint8Array([1, 2, 3, 4]), "image/png"),
        );

        const latest: { current: UseImageValue | null } = { current: null };
        function Probe() {
            latest.current = useImage("a cat");
            return null;
        }

        renderWithAuth(<Probe />, authValue());
        await waitFor(() => latest.current?.result != null);

        expect(latest.current?.result?.contentType).toBe("image/png");
        expect(latest.current?.result?.url).toContain("/image/a%20cat");
        expect(typeof latest.current?.result?.toDataURL).toBe("function");
    });
});
