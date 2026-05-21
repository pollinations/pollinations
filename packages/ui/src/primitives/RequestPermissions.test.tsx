import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
    RequestPermissions,
    type RequestPermissionsRenderProps,
} from "./RequestPermissions.tsx";

const mockUseAuthActions = vi.fn();
vi.mock("@pollinations_ai/sdk/react", () => ({
    useAuthActions: () => mockUseAuthActions(),
}));

function capture() {
    const captured: { current: RequestPermissionsRenderProps | null } = {
        current: null,
    };
    const render = (props: RequestPermissionsRenderProps) => {
        captured.current = props;
        return null;
    };
    return { captured, render };
}

describe("RequestPermissions", () => {
    it("flags requested permissions that aren't granted", () => {
        mockUseAuthActions.mockReturnValue({
            permissions: ["profile", "usage"],
            login: vi.fn(),
        });
        const { captured, render } = capture();
        renderToString(
            <RequestPermissions permissions={["profile", "keys"]}>
                {render}
            </RequestPermissions>,
        );
        expect(captured.current?.missing).toEqual(["keys"]);
    });

    it("returns empty missing when every requested permission is granted", () => {
        mockUseAuthActions.mockReturnValue({
            permissions: ["profile", "usage", "keys"],
            login: vi.fn(),
        });
        const { captured, render } = capture();
        renderToString(
            <RequestPermissions permissions={["profile", "usage"]}>
                {render}
            </RequestPermissions>,
        );
        expect(captured.current?.missing).toEqual([]);
    });

    it("request() invokes login with the requested permissions", () => {
        const login = vi.fn();
        mockUseAuthActions.mockReturnValue({
            permissions: ["profile"],
            login,
        });
        const { captured, render } = capture();
        renderToString(
            <RequestPermissions permissions={["profile", "keys"]}>
                {render}
            </RequestPermissions>,
        );
        captured.current?.request();
        expect(login).toHaveBeenCalledWith(["profile", "keys"]);
    });
});
