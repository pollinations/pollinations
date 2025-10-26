import { expect } from "vitest";
import { test } from "./fixtures";
import { Session, User } from "@/auth.ts";

test("Authenticate via session cookie and validate user data", async ({
    auth,
    sessionToken,
    mocks,
}) => {
    const response = await auth.getSession({
        fetchOptions: {
            headers: {
                "Cookie": `better-auth.session_token=${sessionToken}`,
            },
        },
    });

    if (!response.data) {
        throw new Error(`Failed to get session: ${response.error}`);
    }

    const mockUser = mocks.github.state.user;
    const user = response.data.user as User;
    const session = response.data.session as Session;

    expect(user).toBeDefined();
    expect(user.email).toBe(mockUser.email);
    expect(user.name).toBe(mockUser.name);
    expect(user.tier).toBe("seed");
    expect(user.githubId).toBe(mockUser.id);
    expect(user.githubUsername).toBe(mockUser.login);

    expect(session).toBeDefined();
});
