import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { WhenLoggedOut } from "./WhenLoggedOut.tsx";

const mockUseAuthState = vi.fn();
vi.mock("@pollinations/sdk/react", () => ({
    useAuthState: () => mockUseAuthState(),
}));

describe("WhenLoggedOut", () => {
    it("renders children when logged out", () => {
        mockUseAuthState.mockReturnValue({
            apiKey: null,
            isLoggedIn: false,
        });
        const html = renderToString(<WhenLoggedOut>sign in</WhenLoggedOut>);
        expect(html).toBe("sign in");
    });

    it("renders nothing when logged in", () => {
        mockUseAuthState.mockReturnValue({
            apiKey: "pk_test",
            isLoggedIn: true,
        });
        const html = renderToString(<WhenLoggedOut>sign in</WhenLoggedOut>);
        expect(html).toBe("");
    });
});
