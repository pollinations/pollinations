import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchClientMetadata } from "../src/services/client-metadata.ts";

const CLIENT_ID = "https://client.example/oauth/client.json";
const DOCUMENT = {
    client_id: CLIENT_ID,
    client_name: "Example MCP Client",
    redirect_uris: ["http://127.0.0.1/callback", "https://client.example/cb"],
    token_endpoint_auth_method: "none",
};

function serve(response: Response) {
    const fetchMock = vi.fn(async () => response);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("fetchClientMetadata", () => {
    it("returns the name and redirect URIs of a valid document", async () => {
        const fetchMock = serve(Response.json(DOCUMENT));
        expect(await fetchClientMetadata(CLIENT_ID)).toEqual({
            clientName: "Example MCP Client",
            redirectUris: DOCUMENT.redirect_uris,
        });
        expect(fetchMock).toHaveBeenCalledWith(
            CLIENT_ID,
            expect.objectContaining({ redirect: "manual" }),
        );
    });

    it("rejects a document whose client_id is not the fetched URL", async () => {
        serve(
            Response.json({
                ...DOCUMENT,
                client_id: "https://client.example/other.json",
            }),
        );
        expect(await fetchClientMetadata(CLIENT_ID)).toBeNull();
    });

    it("rejects a document without client_name or redirect_uris", async () => {
        serve(Response.json({ client_id: CLIENT_ID }));
        expect(await fetchClientMetadata(CLIENT_ID)).toBeNull();
    });

    it("rejects redirect URIs outside the https/loopback policy", async () => {
        serve(
            Response.json({
                ...DOCUMENT,
                redirect_uris: ["http://client.example/cb"],
            }),
        );
        expect(await fetchClientMetadata(CLIENT_ID)).toBeNull();
    });

    it("rejects clients that expect a client secret", async () => {
        serve(
            Response.json({
                ...DOCUMENT,
                token_endpoint_auth_method: "client_secret_basic",
            }),
        );
        expect(await fetchClientMetadata(CLIENT_ID)).toBeNull();
    });

    it.each([
        ["http", "http://client.example/oauth/client.json"],
        ["no path", "https://client.example"],
        ["dot segments", "https://client.example/a/../client.json"],
        ["credentials", "https://user:pass@client.example/client.json"],
        ["a fragment", "https://client.example/client.json#x"],
        ["localhost", "https://localhost/client.json"],
        ["a private IP", "https://10.0.0.1/client.json"],
        ["a pk_", "pk_test_client"],
    ])("rejects a client_id with %s without fetching", async (_, clientId) => {
        const fetchMock = serve(Response.json(DOCUMENT));
        expect(await fetchClientMetadata(clientId)).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("does not follow redirects", async () => {
        serve(
            new Response(null, {
                status: 302,
                headers: { Location: "https://elsewhere.example/c.json" },
            }),
        );
        expect(await fetchClientMetadata(CLIENT_ID)).toBeNull();
    });

    it("rejects a document larger than 5 KB", async () => {
        serve(Response.json({ ...DOCUMENT, padding: "x".repeat(5 * 1024) }));
        expect(await fetchClientMetadata(CLIENT_ID)).toBeNull();
    });
});
