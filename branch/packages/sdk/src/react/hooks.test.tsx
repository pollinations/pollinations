import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    AuthContext,
    type AuthContextValue,
    type AuthStateValue,
} from "./contexts.js";
import {
    type UseAccountKeyValue,
    useAccountKey,
    useAuthState,
} from "./hooks.js";

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
    const status = init.status ?? 200;
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 401 ? "Unauthorized" : "OK",
        headers: new Headers(),
        json: async () => body,
    } as Response;
}

async function waitFor(condition: () => boolean) {
    for (let i = 0; i < 20; i++) {
        await act(async () => {
            await Promise.resolve();
        });
        if (condition()) return;
    }
    throw new Error("Timed out waiting for condition");
}

function read<T>(value: T | null): T {
    if (!value) throw new Error("Expected hook value to be set");
    return value;
}

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

describe("account hooks", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("clears account data when disabled", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            jsonResponse({
                valid: true,
                type: "secret",
                permissions: { account: ["usage"], models: [] },
            }),
        );

        let latest: UseAccountKeyValue | null = null;
        const value = authValue();

        function Probe({ enabled }: { enabled: boolean }) {
            latest = useAccountKey({ enabled });
            return null;
        }

        let renderer: ReactTestRenderer | null = null;
        await act(async () => {
            renderer = create(
                <AuthContext.Provider value={value}>
                    <Probe enabled={true} />
                </AuthContext.Provider>,
            );
        });

        await waitFor(() => latest?.data?.type === "secret");
        expect(fetchMock).toHaveBeenCalledWith(
            "https://enter.example/api/account/key",
            { headers: { Authorization: "Bearer sk_test" } },
        );

        await act(async () => {
            renderer?.update(
                <AuthContext.Provider value={value}>
                    <Probe enabled={false} />
                </AuthContext.Provider>,
            );
        });

        expect(read<UseAccountKeyValue>(latest).data).toBeNull();
        expect(read<UseAccountKeyValue>(latest).isLoading).toBe(false);
        expect(read<UseAccountKeyValue>(latest).error).toBeNull();
    });

    it("logs out when an account hook receives 401", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            jsonResponse(
                {
                    error: {
                        code: "UNAUTHORIZED",
                        message: "Invalid API key",
                    },
                },
                { status: 401 },
            ),
        );

        const logout = vi.fn();
        const value = authValue({ logout });
        let auth: AuthStateValue | null = null;
        let key: UseAccountKeyValue | null = null;

        function Probe() {
            auth = useAuthState();
            key = useAccountKey();
            return null;
        }

        await act(async () => {
            create(
                <AuthContext.Provider value={value}>
                    <Probe />
                </AuthContext.Provider>,
            );
        });

        await waitFor(() => logout.mock.calls.length > 0);

        expect(logout).toHaveBeenCalledTimes(1);
        expect(read<AuthStateValue>(auth).apiKey).toBe("sk_test");
        expect(read<UseAccountKeyValue>(key).data).toBeNull();
    });
});
