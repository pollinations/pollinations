import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { LogInIcon, LogOutIcon } from "./index.tsx";

describe("session icons", () => {
    test("uses distinct directions for login and logout", () => {
        const login = renderToStaticMarkup(<LogInIcon />);
        const logout = renderToStaticMarkup(<LogOutIcon />);

        expect(login).not.toBe(logout);
        expect(login).toContain('d="M15 12H3"');
        expect(logout).toContain('d="M21 12H9"');
    });
});
