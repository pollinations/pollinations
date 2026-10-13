import { act, create } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "./contexts.js";
import type { GenerationValue } from "./generation.js";
import { useAudio, useImage, useText, useVideo } from "./generation.js";

function authValue(
    overrides: Partial<AuthContextValue> = {},
): AuthContextValue {
    return {
        apiKey: "sk_test",
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

async function waitFor(condition: () => boolean) {
    for (let i = 0; i < 50; i++) {
        await act(async () => {
            await new Promise((r) => setTimeout(r, 10));
        });
        if (condition()) return;
    }
    throw new Error("Timed out waiting for condition");
}

describe("generation hooks", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("useImage generates an image and sets result", async () => {
        const fetchMock = vi.fn().mockImplementation(async (url: string) => {
            if (url.includes("/image/")) {
                return {
                    ok: true,
                    status: 200,
                    headers: new Headers({ "Content-Type": "image/png" }),
                    arrayBuffer: async () => new ArrayBuffer(10),
                };
            }
            throw new Error(`Unexpected fetch: ${url}`);
        });

        vi.stubGlobal("fetch", fetchMock);

        let latest: GenerationValue<{
            buffer: ArrayBuffer;
            contentType: string;
            url: string;
        }> | null = null;

        function Probe() {
            latest = useImage();
            return null;
        }

        let renderer: ReturnType<typeof create>;
        await act(async () => {
            renderer = create(
                <AuthContext.Provider value={authValue()}>
                    <Probe />
                </AuthContext.Provider>,
            );
        });

        await act(async () => {
            await latest!.run("a cat");
        });

        await waitFor(() => latest!.result !== null);
        expect(latest!.isLoading).toBe(false);
        expect(latest!.error).toBeNull();
        expect(latest!.result).toMatchObject({
            contentType: "image/png",
            url: expect.stringContaining("/image/"),
        });
        expect(fetchMock).toHaveBeenCalled();
    });

    it("useText generates text and returns a string", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: new Headers({ "Content-Type": "application/json" }),
            json: async () => ({
                choices: [{ message: { content: "Hello world" } }],
            }),
        });

        vi.stubGlobal("fetch", fetchMock);

        let latest: GenerationValue<string> | null = null;

        function Probe() {
            latest = useText();
            return null;
        }

        let renderer: ReturnType<typeof create>;
        await act(async () => {
            renderer = create(
                <AuthContext.Provider value={authValue()}>
                    <Probe />
                </AuthContext.Provider>,
            );
        });

        await act(async () => {
            await latest!.run("Say hello");
        });

        await waitFor(() => latest!.result !== null);
        expect(latest!.result).toBe("Hello world");
        expect(latest!.isLoading).toBe(false);
        expect(latest!.error).toBeNull();
    });

    it("useVideo sets error on failure", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 500,
            statusText: "Internal Server Error",
            headers: new Headers({ "Content-Type": "application/json" }),
            json: async () => ({ error: { message: "Server error" } }),
        });

        vi.stubGlobal("fetch", fetchMock);

        let latest: GenerationValue<{
            buffer: ArrayBuffer;
            contentType: string;
            url: string;
        }> | null = null;

        function Probe() {
            latest = useVideo();
            return null;
        }

        let renderer: ReturnType<typeof create>;
        await act(async () => {
            renderer = create(
                <AuthContext.Provider value={authValue()}>
                    <Probe />
                </AuthContext.Provider>,
            );
        });

        await act(async () => {
            await latest!.run("a dog");
        });

        await waitFor(() => latest!.error !== null);
        expect(latest!.result).toBeNull();
        expect(latest!.isLoading).toBe(false);
        expect(latest!.error).toBeInstanceOf(Error);
    });

    it("useAudio returns binary response", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: new Headers({ "Content-Type": "audio/mpeg" }),
            arrayBuffer: async () => new ArrayBuffer(20),
        });

        vi.stubGlobal("fetch", fetchMock);

        let latest: GenerationValue<{
            buffer: ArrayBuffer;
            contentType: string;
            url: string;
        }> | null = null;

        function Probe() {
            latest = useAudio();
            return null;
        }

        let renderer: ReturnType<typeof create>;
        await act(async () => {
            renderer = create(
                <AuthContext.Provider value={authValue()}>
                    <Probe />
                </AuthContext.Provider>,
            );
        });

        await act(async () => {
            await latest!.run("Hello");
        });

        await waitFor(() => latest!.result !== null);
        expect(latest!.result).toMatchObject({
            contentType: "audio/mpeg",
        });
    });

    it("throws when no API key is available", async () => {
        let latest: GenerationValue<{ buffer: ArrayBuffer }> | null = null;

        function Probe() {
            latest = useImage();
            return null;
        }

        let renderer: ReturnType<typeof create>;
        await act(async () => {
            renderer = create(
                <AuthContext.Provider value={authValue({ apiKey: "" })}>
                    <Probe />
                </AuthContext.Provider>,
            );
        });

        await act(async () => {
            await latest!.run("test");
        });

        expect(latest!.error).toBeInstanceOf(Error);
        expect(latest!.error!.message).toContain("API key is required");
        expect(latest!.result).toBeNull();
    });

    it("logs out on 401 response", async () => {
        const logout = vi.fn();
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 401,
            statusText: "Unauthorized",
            headers: new Headers({ "Content-Type": "application/json" }),
            json: async () => ({
                error: { code: "UNAUTHORIZED", message: "Invalid key" },
            }),
        });

        vi.stubGlobal("fetch", fetchMock);

        let latest: GenerationValue<{ buffer: ArrayBuffer }> | null = null;

        function Probe() {
            latest = useImage();
            return null;
        }

        let renderer: ReturnType<typeof create>;
        await act(async () => {
            renderer = create(
                <AuthContext.Provider value={authValue({ logout })}>
                    <Probe />
                </AuthContext.Provider>,
            );
        });

        await act(async () => {
            await latest!.run("test");
        });

        await waitFor(() => logout.mock.calls.length > 0);
        expect(logout).toHaveBeenCalledTimes(1);
        expect(latest!.result).toBeNull();
    });

    it("rerun re-executes with the same arguments", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: new Headers({ "Content-Type": "image/png" }),
            arrayBuffer: async () => new ArrayBuffer(10),
        });

        vi.stubGlobal("fetch", fetchMock);

        let latest: GenerationValue<{
            buffer: ArrayBuffer;
            contentType: string;
            url: string;
        }> | null = null;

        function Probe() {
            latest = useImage();
            return null;
        }

        let renderer: ReturnType<typeof create>;
        await act(async () => {
            renderer = create(
                <AuthContext.Provider value={authValue()}>
                    <Probe />
                </AuthContext.Provider>,
            );
        });

        await act(async () => {
            await latest!.run("a cat");
        });

        await waitFor(() => latest!.result !== null);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await act(async () => {
            await latest!.rerun();
        });

        await waitFor(() => fetchMock.mock.calls.length === 2);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("cancel aborts the in-flight request", async () => {
        let rejectFetch: ((err: Error) => void) | null = null;
        const fetchMock = vi.fn().mockImplementation(
            () =>
                new Promise<Response>((_, reject) => {
                    rejectFetch = reject;
                }),
        );

        vi.stubGlobal("fetch", fetchMock);

        let latest: GenerationValue<{ buffer: ArrayBuffer }> | null = null;

        function Probe() {
            latest = useImage();
            return null;
        }

        let renderer: ReturnType<typeof create>;
        await act(async () => {
            renderer = create(
                <AuthContext.Provider value={authValue()}>
                    <Probe />
                </AuthContext.Provider>,
            );
        });

        const runPromise = latest!.run("a cat");
        await act(async () => {
            latest!.cancel();
        });

        rejectFetch!(new Error("Aborted"));

        await act(async () => {
            await runPromise;
        });

        expect(latest!.isLoading).toBe(false);
        expect(latest!.result).toBeNull();
    });
});
