// Source-shaped local responses for Account. The screen adapter pauses provider
// redirects at a handoff note; return states are chosen explicitly in the lab.
export function createAccountSettingsFixture(query: URLSearchParams) {
    const state = query.get("settings_case");
    const timestamp = new Date().toISOString();
    let discordConnected =
        state === "discord-connected" ||
        query.get("action") === "unlink-discord";
    const toolkit = {
        slug: "preview-app",
        name: "Example app",
        description: "A connected app example.",
        logo: null,
    };
    let connections =
        state === "apps-connected" ||
        query.get("action") === "unlink-integration"
            ? [
                  {
                      id: "preview-integration",
                      toolkit: toolkit.slug,
                      name: toolkit.name,
                      logo: null,
                      alias: null,
                  },
              ]
            : [];
    const json = (data: unknown, status = 200) =>
        new Response(JSON.stringify(data), {
            status,
            headers: { "Content-Type": "application/json" },
        });
    const error = () =>
        json(
            {
                code: "PREVIEW_REQUEST_FAILED",
                message: "Request failed. Try again.",
            },
            503,
        );
    const returnUrl = (url: URL, nextState: string) => {
        const next = new URLSearchParams(query);
        next.set("screen", "dash-account");
        next.set("settings_case", nextState);
        next.delete("action");
        next.delete("result");
        return new URL(`/pollen-connect-screen.html?${next}`, url.origin).href;
    };
    return (url: URL, method: string, body: Record<string, unknown>) => {
        const path = url.pathname;
        if (
            method === "GET" &&
            [
                "/api/auth/list-accounts",
                "/api/auth/account-info",
                "/api/account/integrations",
                "/api/account/integrations/toolkits",
            ].includes(path)
        ) {
            if (state === "loading") return new Promise<Response>(() => {});
            if (
                state === "error" ||
                (state === "discord-error" && path.startsWith("/api/auth/"))
            )
                return error();
            if (path === "/api/auth/list-accounts")
                return json([
                    {
                        id: "preview-github-account",
                        providerId: "github",
                        accountId: "preview-github-user",
                        userId: "preview-user",
                        createdAt: timestamp,
                        updatedAt: timestamp,
                        scopes: [],
                    },
                    ...(discordConnected
                        ? [
                              {
                                  id: "preview-discord-account",
                                  providerId: "discord",
                                  accountId: "preview-discord-user",
                                  userId: "preview-user",
                                  createdAt: timestamp,
                                  updatedAt: timestamp,
                                  scopes: ["identify"],
                              },
                          ]
                        : []),
                ]);
            if (path === "/api/auth/account-info")
                return json({
                    user: {
                        id: "preview-discord-user",
                        name: "Moss",
                        image: "/pollen-connect-preview/moss.png",
                        emailVerified: true,
                    },
                    data: { username: "moss.example" },
                });
            if (path === "/api/account/integrations")
                return json({ data: connections });
            const search =
                url.searchParams.get("search")?.trim().toLowerCase() ?? "";
            return json({
                data:
                    !search || toolkit.name.toLowerCase().includes(search)
                        ? [toolkit]
                        : [],
            });
        }
        const discordLink =
            method === "POST" && path === "/api/auth/link-social";
        const discordUnlink =
            method === "POST" && path === "/api/auth/unlink-account";
        const removeAccount =
            method === "POST" && path === "/api/auth/delete-user";
        const integrationLink =
            method === "POST" && path === "/api/account/integrations";
        const integrationUnlink =
            method === "DELETE" &&
            path === "/api/account/integrations/preview-integration";
        if (
            !discordLink &&
            !discordUnlink &&
            !removeAccount &&
            !integrationLink &&
            !integrationUnlink
        )
            return;
        if (query.get("result") === "waiting")
            return new Promise<Response>(() => {});
        if (query.get("result") === "error") {
            query.delete("result");
            return error();
        }
        if (discordLink) {
            if (body.provider !== "discord") return;
            return json({
                url: returnUrl(url, "discord-connected"),
                redirect: true,
            });
        }
        if (discordUnlink) {
            if (body.providerId !== "discord") return;
            discordConnected = false;
            return json({ status: true });
        }
        if (removeAccount)
            return json({ success: true, message: "User deleted" });
        if (integrationLink) {
            if (body.toolkit !== toolkit.slug) return;
            return json({ redirectUrl: returnUrl(url, "apps-connected") });
        }
        connections = [];
        return new Response(null, { status: 204 });
    };
}
