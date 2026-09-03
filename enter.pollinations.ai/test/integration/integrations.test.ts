import { SELF } from "cloudflare:test";
import { expect } from "vitest";
import { test } from "../fixtures.ts";

function sessionHeaders(sessionToken: string) {
    return { Cookie: `better-auth.session_token=${sessionToken}` };
}

test("manages connected apps through the authenticated account", async ({
    sessionToken,
}) => {
    const listResponse = await SELF.fetch(
        "http://localhost:3000/api/account/integrations",
        { headers: sessionHeaders(sessionToken) },
    );
    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toMatchObject({
        data: [
            {
                id: "ca_test",
                toolkit: "github",
                name: "GitHub",
                logo: "https://logos.composio.test/github",
                status: "ACTIVE",
            },
        ],
    });

    const toolkitResponse = await SELF.fetch(
        "http://localhost:3000/api/account/integrations/toolkits?search=git",
        { headers: sessionHeaders(sessionToken) },
    );
    expect(toolkitResponse.status).toBe(200);
    expect(await toolkitResponse.json()).toEqual({
        data: [
            {
                slug: "github",
                name: "GitHub",
                description: "Code hosting",
                logo: null,
            },
        ],
    });

    const connectResponse = await SELF.fetch(
        "http://localhost:3000/api/account/integrations",
        {
            method: "POST",
            headers: {
                ...sessionHeaders(sessionToken),
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ toolkit: "github" }),
        },
    );
    expect(connectResponse.status).toBe(200);
    expect(await connectResponse.json()).toEqual({
        redirectUrl: "https://connect.composio.test/link",
    });

    const deleteResponse = await SELF.fetch(
        "http://localhost:3000/api/account/integrations/ca_test",
        {
            method: "DELETE",
            headers: sessionHeaders(sessionToken),
        },
    );
    expect(deleteResponse.status).toBe(204);
});

test("requires authentication for connected apps", async () => {
    const response = await SELF.fetch(
        "http://localhost:3000/api/account/integrations",
    );
    expect(response.status).toBe(401);
});
