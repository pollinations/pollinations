import type { ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Authorize } from "../frontend/src/components/auth/authorize.tsx";

const api = vi.hoisted(() => ({
    appLookup: vi.fn(),
    approve: vi.fn(),
    deleteKey: vi.fn(),
    createKey: vi.fn(),
}));

// Stable like the router's own search state, so effects don't rerun.
const search = {
    user_code: "ABCD2345",
    app_key: "pk_test",
    scope: ["generate"],
};
vi.mock("@tanstack/react-router", () => ({
    useSearch: () => search,
    useNavigate: () => () => {},
}));
vi.mock("../frontend/src/api.ts", () => ({
    apiClient: {
        "app-lookup": { $get: api.appLookup },
        device: { approve: { $post: api.approve } },
    },
    accountClient: { keys: { ":id": { $delete: api.deleteKey } } },
}));
vi.mock("../frontend/src/auth.ts", () => ({
    authClient: {
        useSession: () => ({
            data: { user: { id: "user-1", name: "User" } },
            isPending: false,
        }),
    },
}));
vi.mock("../frontend/src/lib/create-api-key.ts", () => ({
    createKeyWithPermissions: api.createKey,
}));
vi.mock("../frontend/src/config.ts", () => ({
    config: { genBaseUrl: "https://gen.example" },
    genDocsUrl: (hash = "") => `https://gen.example/docs${hash}`,
}));
// The consent dialog's frame needs a DOM; its actions and form are what count.
vi.mock("../frontend/src/components/auth/auth-flow-screen.tsx", () => ({
    AuthFlowScreen: ({
        actions,
        children,
    }: {
        actions?: ReactNode;
        children?: ReactNode;
    }) => (
        <>
            {actions}
            {children}
        </>
    ),
}));
// The test renderer has no document to lock scrolling on.
vi.mock("@pollinations/ui", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@pollinations/ui")>()),
    useScrollLock: () => {},
}));
// The test renderer has no DOM to portal into: render dialogs and tooltips
// in place.
vi.mock("@ark-ui/react/portal", () => ({
    Portal: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("react-dom", async (importOriginal) => ({
    ...(await importOriginal<typeof import("react-dom")>()),
    createPortal: (children: ReactNode) => children,
}));

let renderer: ReactTestRenderer | undefined;

beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("window", { innerWidth: 1024, location: { href: "" } });
    api.createKey.mockResolvedValue({ key: "sk_new", id: "key-new" });
    api.deleteKey.mockResolvedValue(Response.json({ success: true }));
});

afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

async function renderDeviceConsent() {
    api.appLookup.mockImplementation(async () =>
        Response.json({ found: true, appName: "polli" }),
    );
    await act(async () => {
        renderer = create(<Authorize />);
    });
    // Let the app lookup resolve before reading the button.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(api.appLookup).toHaveBeenCalledOnce();
    const allow = renderer?.root.find(
        (node) => node.props.form === "authorize-permissions",
    );
    const form = renderer?.root.find(
        (node) => node.props.id === "authorize-permissions",
    );
    return { allow, form };
}

it("deletes the new key when the device code can't take it", async () => {
    api.approve.mockResolvedValue(
        Response.json({ message: "Device code expired" }, { status: 400 }),
    );
    const { allow, form } = await renderDeviceConsent();
    expect(allow?.props.disabled).toBe(false);

    await act(async () => form?.props.onSubmit({ preventDefault() {} }));
    expect(api.approve).toHaveBeenCalledOnce();
    expect(api.deleteKey).toHaveBeenCalledWith({ param: { id: "key-new" } });
});
