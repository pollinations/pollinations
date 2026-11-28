import assert from "node:assert/strict";
import test, { afterEach, mock } from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

afterEach(() => mock.restoreAll());

async function client(t, modern = false) {
    const client = new Client(
        { name: "books-test", version: "1" },
        modern ? { versionNegotiation: { mode: "auto" } } : {},
    );
    await client.connect(
        new StreamableHTTPClientTransport(new URL("https://private.test/"), {
            requestInit: {
                headers: {
                    Authorization: "Bearer sk_never_forward",
                    Cookie: "never=forward",
                },
            },
            fetch: (input, init) =>
                worker.fetch(
                    input instanceof Request ? input : new Request(input, init),
                ),
        }),
    );
    t.after(() => client.close());
    return client;
}

const value = (result) => JSON.parse(result.content[0].text);
const call = (client, name, args) => client.callTool({ name, arguments: args });

test("search_books maps Open Library ranking, ratings and cover URLs", async (t) => {
    mock.method(globalThis, "fetch", async (input, init) => {
        const url = new URL(input);
        assert.equal(url.hostname, "openlibrary.org");
        assert.equal(url.pathname, "/search.json");
        assert.equal(url.searchParams.get("q"), "dune frank herbert");
        assert.equal(url.searchParams.get("limit"), "2");
        assert.equal(url.searchParams.get("language"), "rus");
        assert.equal(url.searchParams.get("sort"), "new");
        assert.match(url.searchParams.get("fields"), /author_key/);
        assert.equal(new Headers(init.headers).get("authorization"), null);
        return Response.json({
            numFound: 120,
            docs: [
                {
                    key: "/works/OL893414W",
                    title: "Dune",
                    author_name: ["Frank Herbert"],
                    author_key: ["OL79034A"],
                    first_publish_year: 1965,
                    edition_count: 155,
                    language: ["rus", "eng"],
                    cover_i: 11481354,
                    ebook_access: "borrowable",
                    ratings_average: 4.305677,
                    ratings_count: 458,
                },
            ],
        });
    });
    const c = await client(t);
    const result = await call(c, "search_books", {
        query: "dune frank herbert",
        limit: 2,
        language: "rus",
        sort: "new",
    });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    const data = value(result);
    assert.equal(data.total, 120);
    assert.equal(data.returned, 1);
    assert.equal(data.books[0].key, "OL893414W");
    assert.deepEqual(data.books[0].authors, [
        { name: "Frank Herbert", key: "OL79034A" },
    ]);
    assert.equal(data.books[0].rating.average, 4.31);
    assert.equal(data.books[0].rating.count, 458);
    assert.equal(
        data.books[0].coverUrl,
        "https://covers.openlibrary.org/b/id/11481354-M.jpg",
    );
    assert.equal(data.books[0].url, "https://openlibrary.org/works/OL893414W");
});

test("get_book resolves an ISBN to its edition and author names", async (t) => {
    const urls = [];
    mock.method(globalThis, "fetch", async (input) => {
        const url = new URL(input);
        urls.push(url.pathname);
        if (url.pathname === "/isbn/9780441013593.json")
            return Response.json({
                key: "/books/OL7524304M",
                title: "Dune",
                subtitle: "Anniversary edition",
                authors: [{ key: "/authors/OL79034A" }],
                publishers: ["Ace Trade"],
                publish_date: "August 2, 2005",
                number_of_pages: 544,
                isbn_10: ["0441013597"],
                isbn_13: ["9780441013593"],
                languages: [{ key: "/languages/eng" }],
                works: [{ key: "/works/OL893414W" }],
                covers: [14565843],
            });
        if (url.pathname === "/authors/OL79034A.json")
            return Response.json({
                key: "/authors/OL79034A",
                name: "Frank Herbert",
            });
        return new Response("unexpected", { status: 500 });
    });
    const c = await client(t);
    const result = await call(c, "get_book", { id: "978-0-441-01359-3" });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    const data = value(result);
    assert.equal(data.kind, "edition");
    assert.equal(data.key, "OL7524304M");
    assert.equal(data.subtitle, "Anniversary edition");
    assert.deepEqual(data.authors, [
        { key: "OL79034A", name: "Frank Herbert" },
    ]);
    assert.equal(data.pages, 544);
    assert.deepEqual(data.isbn13, ["9780441013593"]);
    assert.deepEqual(data.languages, ["eng"]);
    assert.deepEqual(data.works, ["OL893414W"]);
    assert.equal(
        data.coverUrl,
        "https://covers.openlibrary.org/b/id/14565843-L.jpg",
    );
    assert.deepEqual(urls, [
        "/isbn/9780441013593.json",
        "/authors/OL79034A.json",
    ]);
});

test("get_book unwraps object descriptions and caps large subject lists", async (t) => {
    mock.method(globalThis, "fetch", async (input) => {
        const url = new URL(input);
        assert.equal(url.pathname, "/works/OL893414W.json");
        return Response.json({
            key: "/works/OL893414W",
            title: "Dune",
            description: { type: "/type/text", value: "Set on Arrakis." },
            subjects: Array.from(
                { length: 40 },
                (_, index) => `Subject ${index}`,
            ),
            first_publish_date: "1965",
            covers: [11481354],
            links: [{ title: "Review", url: "https://example.com/review" }],
        });
    });
    const c = await client(t);
    const result = await call(c, "get_book", { id: "OL893414W" });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    const data = value(result);
    assert.equal(data.kind, "work");
    assert.equal(data.description, "Set on Arrakis.");
    assert.equal(data.subjects.total, 40);
    assert.equal(data.subjects.items.length, 30);
    assert.equal(data.firstPublishDate, "1965");
    assert.deepEqual(data.links, [
        { title: "Review", url: "https://example.com/review" },
    ]);
});

test("get_book rejects malformed ids without an upstream request", async (t) => {
    mock.method(globalThis, "fetch", async () => {
        throw new Error("fetch must not run");
    });
    const c = await client(t);
    const result = await call(c, "get_book", { id: "../authors/OL1A" });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Expected a work id/);
});

test("list_editions pages through a work and keeps ISBNs and languages", async (t) => {
    mock.method(globalThis, "fetch", async (input) => {
        const url = new URL(input);
        assert.equal(url.pathname, "/works/OL893414W/editions.json");
        assert.equal(url.searchParams.get("limit"), "2");
        assert.equal(url.searchParams.get("offset"), "5");
        return Response.json({
            size: 155,
            entries: [
                {
                    key: "/books/OL62445412M",
                    title: "Dune",
                    publish_date: "2021",
                    publishers: ["Nemira Publishing House"],
                    number_of_pages: 734,
                    isbn_13: ["9786064312617"],
                    languages: [{ key: "/languages/rum" }],
                    covers: [15246488],
                },
            ],
        });
    });
    const c = await client(t);
    const result = await call(c, "list_editions", {
        work: "OL893414W",
        limit: 2,
        offset: 5,
    });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    const data = value(result);
    assert.equal(data.total, 155);
    assert.equal(data.offset, 5);
    assert.equal(data.returned, 1);
    assert.equal(data.editions[0].key, "OL62445412M");
    assert.deepEqual(data.editions[0].isbn13, ["9786064312617"]);
    assert.deepEqual(data.editions[0].languages, ["rum"]);
    assert.equal(
        data.editions[0].coverUrl,
        "https://covers.openlibrary.org/b/id/15246488-M.jpg",
    );
});

test("get_author combines the author record with their most reprinted works", async (t) => {
    const urls = [];
    mock.method(globalThis, "fetch", async (input) => {
        const url = new URL(input);
        urls.push(`${url.pathname}${url.search}`);
        if (url.pathname === "/authors/OL79034A.json")
            return Response.json({
                key: "/authors/OL79034A",
                name: "Frank Herbert",
                personal_name: "Herbert, Frank.",
                birth_date: "8 October 1920",
                death_date: "11 February 1986",
                bio: {
                    type: "/type/text",
                    value: "American science-fiction author.",
                },
                alternate_names: Array.from(
                    { length: 25 },
                    (_, index) => `Alias ${index}`,
                ),
            });
        if (url.pathname === "/search.json") {
            assert.equal(url.searchParams.get("author_key"), "OL79034A");
            assert.equal(url.searchParams.get("sort"), "editions");
            assert.equal(url.searchParams.get("limit"), "2");
            return Response.json({
                numFound: 144,
                docs: [
                    {
                        key: "/works/OL893414W",
                        title: "Dune",
                        author_name: ["Frank Herbert"],
                        author_key: ["OL79034A"],
                        first_publish_year: 1965,
                        edition_count: 155,
                    },
                ],
            });
        }
        return new Response("unexpected", { status: 500 });
    });
    const c = await client(t);
    const result = await call(c, "get_author", {
        author: "OL79034A",
        limit: 2,
    });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    const data = value(result);
    assert.equal(data.name, "Frank Herbert");
    assert.equal(data.bio, "American science-fiction author.");
    assert.equal(data.alternateNames.total, 25);
    assert.equal(data.alternateNames.items.length, 20);
    assert.equal(data.workCount, 144);
    assert.equal(data.works[0].title, "Dune");
    assert.equal(data.works[0].editionCount, 155);
    assert.equal(urls.length, 2);
    assert.ok(urls.some((url) => url.startsWith("/authors/OL79034A.json")));
    assert.ok(urls.some((url) => url.startsWith("/search.json")));
});

test("upstream failures become MCP errors, not empty books", async (t) => {
    mock.method(
        globalThis,
        "fetch",
        async () => new Response("missing", { status: 404 }),
    );
    const c = await client(t);
    const result = await call(c, "get_book", { id: "1234567890" });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /openlibrary\.org returned HTTP 404/);
});
