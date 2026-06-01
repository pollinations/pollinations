import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { WhenLoggedIn } from "./WhenLoggedIn.tsx";

const mockUseAuthState = vi.fn();
vi.mock("@pollinations/sdk/react", () => ({
    useAuthState: () => mockUseAuthState(),
}));

describe("WhenLoggedIn", () => {
    it("renders children when logged in", () => {
        mockUseAuthState.mockReturnValue({
            apiKey: "pk_test",
            isLoggedIn: true,
        });
        const html = renderToString(<WhenLoggedIn>hello</WhenLoggedIn>);
        expect(html).toBe("hello");
    });

    it("renders nothing when logged out", () => {
        mockUseAuthState.mockReturnValue({
            apiKey: null,
            isLoggedIn: false,
        });
        const html = renderToString(<WhenLoggedIn>hello</WhenLoggedIn>);
        expect(html).toBe("");
    });
});
