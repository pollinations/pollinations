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
        { name: "research-test", version: "1" },
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
const call = async (client, name, args) => {
    return client.callTool({ name, arguments: args });
};

test("RFC tools distinguish Datatracker modification time from publication and extract body sections after the contents", async (t) => {
    mock.method(globalThis, "fetch", async (input, init) => {
        const url = new URL(input);
        assert.equal(new Headers(init.headers).get("authorization"), null);
        if (url.hostname === "datatracker.ietf.org")
            return Response.json({
                objects: [
                    {
                        name: "rfc9110",
                        title: "HTTP Semantics",
                        time: "2026-01-01",
                        abstract: "HTTP",
                    },
                ],
            });
        if (url.pathname.endsWith(".json"))
            return Response.json({
                doc_id: "RFC9110",
                pub_date: "June 2022",
                title: "HTTP Semantics",
                authors: ["R. Fielding"],
                obsoletes: ["7231"],
            });
        return new Response(
            "Contents\n3.1.  Core Concepts ........ 3\n\n3.1.  Core Concepts\nActual section text\n3.1.1.  Detail\nSubsection\n3.2.  Next Section\nExcluded",
            { headers: { "content-type": "text/plain" } },
        );
    });
    const c = await client(t);
    let result = await call(c, "rfc_search", { query: "HTTP", limit: 1 });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    assert.equal(value(result).rfcs[0].modifiedAt, "2026-01-01");
    assert.equal(value(result).rfcs[0].rfc, 9110);
    result = await call(c, "rfc_metadata", { rfc: 9110 });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    assert.equal(value(result).pubDate, "June 2022");
    assert.deepEqual(value(result).obsoletes, ["7231"]);
    result = await call(c, "rfc_section", { rfc: 9110, section: "3.1" });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    assert.match(value(result).content, /Actual section text/);
    assert.match(value(result).content, /Subsection/);
    assert.doesNotMatch(value(result).content, /Excluded|\.\.\.\./);
});

test("Wikidata filters metadata and claims at source and preserves time calendar and labels", async (t) => {
    const actions = [];
    mock.method(globalThis, "fetch", async (input) => {
        const url = new URL(input),
            q = url.searchParams,
            action = q.get("action");
        actions.push(action);
        assert.equal(url.hostname, "www.wikidata.org");
        if (action === "wbsearchentities")
            return Response.json({
                search: [
                    {
                        id: "Q42",
                        label: "Douglas Adams",
                        description: "writer",
                        concepturi: "https://www.wikidata.org/wiki/Q42",
                    },
                ],
            });
        if (action === "wbgetentities") {
            assert.equal(
                q.get("props"),
                "labels|descriptions|aliases|sitelinks/urls",
            );
            assert.equal(q.get("languages"), "de|en");
            return Response.json({
                entities: {
                    Q42: {
                        type: "item",
                        labels: { en: { value: "Douglas Adams" } },
                        sitelinks: {
                            enwiki: {
                                title: "Douglas Adams",
                                url: "https://en.wikipedia.org/wiki/Douglas_Adams",
                            },
                        },
                    },
                },
            });
        }
        assert.equal(action, "wbgetclaims");
        assert.equal(q.get("property"), "P569");
        return Response.json({
            claims: {
                P569: [
                    {
                        rank: "normal",
                        mainsnak: {
                            datatype: "time",
                            datavalue: {
                                value: {
                                    time: "+1952-03-11T00:00:00Z",
                                    precision: 11,
                                    calendarmodel:
                                        "http://www.wikidata.org/entity/Q1985727",
                                },
                            },
                        },
                    },
                ],
            },
        });
    });
    const c = await client(t);
    let result = await call(c, "search_entities", { query: "Douglas Adams" });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    assert.equal(value(result).results[0].id, "Q42");
    result = await call(c, "get_entity", {
        id: "Q42",
        language: "de",
        properties: ["P569"],
        resolve_labels: false,
    });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    assert.equal(value(result).label, "Douglas Adams");
    assert.equal(
        value(result).wikipedia.url,
        "https://en.wikipedia.org/wiki/Douglas_Adams",
    );
    assert.equal(value(result).returned_properties, 1);
    assert.equal(
        value(result).claims.P569[0].value.calendar,
        "http://www.wikidata.org/entity/Q1985727",
    );
    assert.equal(actions.length, 3);
});

test("Europe PMC keeps core journal titles, PMID source, abstract text and search filters", async (t) => {
    const queries = [];
    mock.method(globalThis, "fetch", async (input) => {
        const url = new URL(input);
        queries.push(url.searchParams.get("query"));
        assert.equal(url.hostname, "www.ebi.ac.uk");
        return Response.json({
            hitCount: 1,
            resultList: {
                result: [
                    {
                        id: "32554568",
                        source: "MED",
                        title: "Trial",
                        journalInfo: { journal: { title: "Clinical Journal" } },
                        abstractText: "<p>One &amp; two.</p><p>Next.</p>",
                        pubTypeList: { pubType: ["Clinical Trial"] },
                    },
                ],
            },
        });
    });
    const c = await client(t);
    let result = await call(c, "search_articles", {
        query: "trial",
        open_access: true,
        min_year: 2020,
    });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    assert.match(queries[0], /OPEN_ACCESS:y/);
    assert.match(queries[0], /PUB_YEAR:\[2020 TO/);
    result = await call(c, "get_article", { id: "32554568" });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    assert.equal(queries[1], "EXT_ID:32554568 AND SRC:MED");
    assert.equal(value(result).journal, "Clinical Journal");
    assert.equal(value(result).abstract, "One & two.\n\nNext.");
});

test("arXiv parses Atom entries, maps sort names and rejects malformed IDs before any request", async (t) => {
    const requests = [];
    mock.method(globalThis, "fetch", async (input) => {
        const url = new URL(input);
        requests.push(url.searchParams);
        assert.equal(url.hostname, "export.arxiv.org");
        return new Response(`<feed xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/" xmlns:arxiv="http://arxiv.org/schemas/atom">
  <opensearch:totalResults>19447</opensearch:totalResults>
  <entry>
    <id>http://arxiv.org/abs/hep-th/9901001v3</id>
    <title>String Junctions &amp;
      Duals</title>
    <updated>2023-08-02T00:41:18Z</updated>
    <summary> We study $T^2$ &lt;compactifications&gt;. </summary>
    <category term="hep-th" scheme="http://arxiv.org/schemas/atom"/>
    <category term="cs.LG" scheme="http://arxiv.org/schemas/atom"/>
    <published>1999-01-01T00:00:00Z</published>
    <arxiv:journal_ref>Prog.Theor.Phys.101:1155-1164,1999</arxiv:journal_ref>
    <arxiv:doi>10.1143/PTP.101.1155</arxiv:doi>
    <arxiv:primary_category term="hep-th"/>
    <author><name>Yosuke Imamura</name></author>
    <author><name>Ana &amp; Bo</name></author>
  </entry>
</feed>`);
    });
    const c = await client(t);
    let result = await call(c, "arxiv_search", {
        query: "ti:junction AND cat:hep-th",
        limit: 5,
        sort: "submitted",
    });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    assert.equal(requests[0].get("search_query"), "ti:junction AND cat:hep-th");
    assert.equal(requests[0].get("sortBy"), "submittedDate");
    assert.equal(requests[0].get("max_results"), "5");
    assert.equal(value(result).total, 19447);
    const [paper] = value(result).papers;
    assert.equal(paper.id, "hep-th/9901001");
    assert.equal(paper.version, 3);
    assert.equal(paper.title, "String Junctions & Duals");
    assert.deepEqual(paper.authors, ["Yosuke Imamura", "Ana & Bo"]);
    assert.deepEqual(paper.categories, ["hep-th", "cs.LG"]);
    assert.equal(paper.primary_category, "hep-th");
    assert.equal(paper.abstract, "We study $T^2$ <compactifications>.");
    assert.equal(paper.doi, "10.1143/PTP.101.1155");
    assert.equal(paper.comment, null);
    assert.equal(paper.pdf_url, "https://arxiv.org/pdf/hep-th/9901001");

    result = await call(c, "arxiv_paper", { id: "arXiv:hep-th/9901001" });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    assert.equal(requests[1].get("id_list"), "hep-th/9901001");
    assert.equal(
        value(result).journal_ref,
        "Prog.Theor.Phys.101:1155-1164,1999",
    );

    result = await call(c, "arxiv_paper", { id: "notanid" });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Use an arXiv ID/);
    assert.equal(requests.length, 2);
});

test("arXiv error entries pass on arXiv's message", async (t) => {
    mock.method(
        globalThis,
        "fetch",
        async () =>
            new Response(`<feed><entry>
    <id>https://arxiv.org/api/errors#incorrect_id_format_for_x</id>
    <title>Error</title>
    <summary>incorrect id format for x</summary>
  </entry></feed>`),
    );
    const c = await client(t);
    const result = await call(c, "arxiv_search", { query: "ti:" });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /arXiv: incorrect id format for x/);
});

test("World Bank uses arbitrary official codes, source metadata, descending years, missing-value filtering and country lookup", async (t) => {
    mock.method(globalThis, "fetch", async (input) => {
        const url = new URL(input);
        assert.equal(url.hostname, "api.worldbank.org");
        if (url.pathname.includes("/indicator/")) {
            assert.match(url.pathname, /SP.POP.TOTL$/);
            return Response.json([
                {},
                [
                    ...[
                        ["2020", 1],
                        ["2022", null],
                        ["2021", 2],
                    ].map(([date, value]) => ({
                        date,
                        value,
                        countryiso3code: "JPN",
                        country: { value: "Japan" },
                        indicator: { value: "Population, total" },
                        unit: "people",
                    })),
                ],
            ]);
        }
        return Response.json([
            {},
            [
                {
                    id: "JPN",
                    iso2Code: "JP",
                    name: "Japan",
                    region: { value: "East Asia & Pacific" },
                    capitalCity: "Tokyo",
                    latitude: "35",
                    longitude: "139",
                },
            ],
        ]);
    });
    const c = await client(t);
    let result = await call(c, "get_indicator_data", {
        indicator: "SP.POP.TOTL",
        countries: ["JPN"],
        start_year: 2020,
        end_year: 2022,
    });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    assert.equal(value(result).indicator.name, "Population, total");
    assert.equal(value(result).indicator.unit, "people");
    assert.deepEqual(value(result).countries[0].observations, [
        { year: "2021", value: 2 },
        { year: "2020", value: 1 },
    ]);
    result = await call(c, "list_countries", { query: "japan" });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    assert.equal(value(result).countries[0].iso3, "JPN");
});

for (const modern of [false, true]) {
    test(`stateless ${modern ? "modern" : "legacy"} discovery`, async (t) => {
        const c = await client(t, modern);
        assert.deepEqual(
            (await c.listTools()).tools.map((t) => t.name).sort(),
            [
                "wikipedia_page",
                "wikipedia_search",
                "wiktionary_define",
                "rfc_search",
                "rfc_metadata",
                "rfc_section",
                "search_entities",
                "get_entity",
                "search_articles",
                "get_article",
                "arxiv_search",
                "arxiv_paper",
                "get_indicator_data",
                "list_countries",
                "crossref_search",
                "crossref_work",
                "archwiki_search",
            ].sort(),
        );
    });
}

test("non-root routes stay private", async () => {
    assert.equal(
        (await worker.fetch(new Request("https://private.test/no"))).status,
        404,
    );
});

test("search uses fixed Wikipedia edition, bounded query and no credentials", async (t) => {
    mock.method(globalThis, "fetch", async (url, options) => {
        // Let workerd validate RequestInit even when the upstream is a fixture.
        const request = new Request(url, options);
        const target = new URL(request.url);
        assert.equal(target.hostname, "de.wikipedia.org");
        assert.equal(target.searchParams.get("q"), "A & B");
        assert.equal(target.searchParams.get("limit"), "3");
        assert.equal(request.redirect, "follow");
        const headers = request.headers;
        assert.equal(headers.get("authorization"), null);
        assert.equal(headers.get("cookie"), null);
        assert.match(headers.get("user-agent"), /hello@pollinations.ai/);
        return Response.json({
            pages: [
                {
                    title: "A",
                    key: "A",
                    excerpt: "<b>A</b>",
                    description: "test",
                },
            ],
        });
    });
    const c = await client(t);
    const result = await call(c, "wikipedia_search", {
        query: "A & B",
        language: "de",
        limit: 3,
    });
    assert.deepEqual(value(result), [
        {
            title: "A",
            description: "test",
            excerpt: "<b>A</b>",
            url: "https://de.wikipedia.org/wiki/A",
        },
    ]);
});

test("summary and full article preserve source citation and report truncation", async (t) => {
    mock.method(globalThis, "fetch", async (url) => {
        const target = new URL(url);
        if (target.pathname.includes("/summary/"))
            return Response.json({
                title: "A",
                description: "short",
                extract: "Summary",
                content_urls: {
                    desktop: { page: "https://en.wikipedia.org/wiki/A" },
                },
            });
        assert.equal(target.searchParams.get("titles"), "A & B");
        assert.equal(target.searchParams.get("explaintext"), "1");
        return Response.json({
            query: { pages: [{ title: "A", extract: "x".repeat(21000) }] },
        });
    });
    const c = await client(t);
    assert.equal(
        value(await call(c, "wikipedia_page", { title: "A" })).text,
        "Summary",
    );
    const result = value(
        await call(c, "wikipedia_page", { title: "A & B", full: true }),
    );
    assert.equal(result.text.length, 20000);
    assert.equal(result.truncated, true);
    assert.equal(result.url, "https://en.wikipedia.org/wiki/A");
});

test("dictionary matches name or language code and preserves definitions/examples", async (t) => {
    const entries = [
        {
            partOfSpeech: "Noun",
            language: "English",
            definitions: [
                {
                    definition: "<a>Word</a>",
                    examples: [{ example: "A word." }],
                },
            ],
        },
    ];
    mock.method(globalThis, "fetch", async (url) => {
        assert.equal(new URL(url).hostname, "en.wiktionary.org");
        return Response.json({
            en: entries,
            fr: [{ language: "French", definitions: [] }],
        });
    });
    const c = await client(t);
    for (const language of ["en", "English"]) {
        assert.deepEqual(
            value(
                await call(c, "wiktionary_define", { word: "word", language }),
            ).entries,
            entries,
        );
    }
    const missing = await call(c, "wiktionary_define", {
        word: "word",
        language: "Finnish",
    });
    assert.equal(missing.isError, true);
    assert.match(missing.content[0].text, /No Finnish definitions/);
});

test("rejects malformed language, limits and empty inputs before fetch", async (t) => {
    let count = 0;
    mock.method(globalThis, "fetch", async () => {
        count++;
        throw new Error("unexpected");
    });
    const c = await client(t);
    for (const args of [
        { query: "x", language: "en.evil.test" },
        { query: "x", language: "en/../x" },
        { query: "x", limit: 50 },
        { query: " " },
    ]) {
        const result = await call(c, "wikipedia_search", args).catch(() => ({
            isError: true,
        }));
        assert.equal(result.isError, true);
    }
    assert.equal(count, 0);
});

for (const status of [404, 429, 503]) {
    test(`upstream ${status} becomes a tool error without leaking its body`, async (t) => {
        mock.method(
            globalThis,
            "fetch",
            async () =>
                new Response("private source stack", {
                    status,
                    headers: { "Retry-After": "10" },
                }),
        );
        const result = await call(await client(t), "wikipedia_page", {
            title: "missing",
        });
        assert.equal(result.isError, true);
        assert.match(result.content[0].text, new RegExp(String(status)));
        assert.doesNotMatch(result.content[0].text, /private source stack/);
    });
}

test("missing full page and action API errors are not successful empty responses", async (t) => {
    const c = await client(t);
    for (const [body, message] of [
        [{ query: { pages: [{ missing: true }] } }, /page not found/],
        [{ error: { info: "Please wait." } }, /Please wait/],
    ]) {
        mock.method(globalThis, "fetch", async () => Response.json(body));
        const result = await call(c, "wikipedia_page", {
            title: "missing",
            full: true,
        });
        assert.equal(result.isError, true);
        assert.match(result.content[0].text, message);
    }
});

test("streamed oversized source is bounded, aborted and reported", async (t) => {
    let signal;
    mock.method(globalThis, "fetch", async (_, options) => {
        signal = options.signal;
        return new Response(
            new ReadableStream({
                start(controller) {
                    controller.enqueue(new Uint8Array(513 * 1024));
                    controller.close();
                },
            }),
        );
    });
    const result = await call(await client(t), "wikipedia_search", {
        query: "large",
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /512 KiB/);
    assert.equal(signal.aborted, true);
});

test("declared oversized body is rejected before reading", async (t) => {
    mock.method(
        globalThis,
        "fetch",
        async () =>
            new Response("{}", {
                headers: { "content-length": String(600 * 1024) },
            }),
    );
    const result = await call(await client(t), "wikipedia_search", {
        query: "large",
    });
    assert.equal(result.isError, true);
});

test("CrossRef search and work lookup formats DOIs, authors and citation metrics", async (t) => {
    mock.method(globalThis, "fetch", async (input) => {
        const url = new URL(input);
        assert.equal(url.hostname, "api.crossref.org");
        assert.equal(url.searchParams.get("mailto"), "hello@pollinations.ai");
        if (url.pathname === "/works") {
            return Response.json({
                status: "ok",
                message: {
                    "total-results": 1,
                    items: [
                        {
                            DOI: "10.1038/nature12373",
                            title: [
                                "CRISPR-Cas9 System for Genome Engineering",
                            ],
                            author: [{ given: "Jennifer", family: "Doudna" }],
                            "container-title": ["Nature"],
                            published: { "date-parts": [[2020, 10, 21]] },
                            type: "journal-article",
                            "is-referenced-by-count": 4820,
                            abstract:
                                "<jats:p>A programmable RNA-guided genome editing platform.</jats:p>",
                        },
                    ],
                },
            });
        }
        if (url.pathname.includes("10.1038")) {
            return Response.json({
                status: "ok",
                message: {
                    DOI: "10.1038/nature12373",
                    title: ["CRISPR-Cas9 System for Genome Engineering"],
                    author: [{ given: "Jennifer", family: "Doudna" }],
                    "container-title": ["Nature"],
                    published: { "date-parts": [[2020, 10, 21]] },
                    type: "journal-article",
                    "is-referenced-by-count": 4820,
                    abstract:
                        "A programmable RNA-guided genome editing platform.",
                },
            });
        }
        return new Response("Not found", { status: 404 });
    });

    const c = await client(t);
    const searchRes = await call(c, "crossref_search", {
        query: "CRISPR",
        limit: 1,
    });
    assert.notEqual(searchRes.isError, true, JSON.stringify(searchRes));
    const searchVal = value(searchRes);
    assert.equal(searchVal.totalResults, 1);
    assert.equal(searchVal.works[0].doi, "10.1038/nature12373");
    assert.deepEqual(searchVal.works[0].authors, ["Jennifer Doudna"]);
    assert.equal(searchVal.works[0].citations, 4820);
    assert.match(searchVal.works[0].abstract, /programmable RNA-guided/);

    const workRes = await call(c, "crossref_work", {
        doi: "10.1038/nature12373",
    });
    assert.notEqual(workRes.isError, true, JSON.stringify(workRes));
    const workVal = value(workRes);
    assert.equal(workVal.work.doi, "10.1038/nature12373");
    assert.equal(workVal.work.container, "Nature");
});

// Verbatim live `action=parse&prop=text&section=0` fixtures (Arch Wiki,
// 2026-11-19): the Firefox lead section with its "Related articles"
// navigation box, and the Installation guide lead section.
const ARCHWIKI_FIREFOX_HTML = `<div class="mw-content-ltr mw-parser-output" lang="en" dir="ltr"><div class="archwiki-template-meta-related-articles"><p>Related articles</p><ul>
<li><a href="/title/Firefox/Privacy" title="Firefox/Privacy">/Privacy</a></li>
<li><a href="/title/Firefox/Profile_on_RAM" title="Firefox/Profile on RAM">/Profile on RAM</a></li>
<li><a href="/title/Firefox/Tweaks" title="Firefox/Tweaks">/Tweaks</a></li>
<li><a href="/title/Browser_extensions" title="Browser extensions">Browser extensions</a></li>
<li><a href="/title/Tor" title="Tor">Tor</a></li>
</ul></div>
<p><a rel="nofollow" class="external text" href="https://www.firefox.com/">Firefox</a> is a popular open-source graphical web browser developed by <a rel="nofollow" class="external text" href="https://www.mozilla.org/">Mozilla</a>.
</p>
<!-- 
NewPP limit report
Cached time: 20261118203743
Cache expiry: 86400
Reduced expiry: false
Complications: []
CPU time usage: 0.018 seconds
Real time usage: 0.021 seconds
Preprocessor visited node count: 29/1000000
Revision size: 445/2097152 bytes
Post‐expand include size: 287/2097152 bytes
Template argument size: 67/2097152 bytes
Highest expansion depth: 4/100
Expensive parser function count: 0/100
Unstrip recursion depth: 0/20
Unstrip post‐expand size: 0/5000000 bytes
-->
<!--
Transclusion expansion time report (%,ms,calls,template)
100.00%   10.983      1 -total
 53.76%    5.904      1 Template:Related_articles_start
 22.87%    2.512      1 Template:META_Related_articles_start
 22.84%    2.509      1 Template:Related_articles_end
 21.53%    2.364      5 Template:Related
-->

<!-- Render ID e7901389-e38f-11f1-82f6-fd494e25102f -->
</div>`;
const ARCHWIKI_INSTALL_HTML = `<div class="mw-content-ltr mw-parser-output" lang="en" dir="ltr"><p>This document is a guide for installing <a href="/title/Arch_Linux" title="Arch Linux">Arch Linux</a> using the live system booted from an installation medium made from an official installation image. Its accessibility features are described on the page <a href="/title/Install_Arch_Linux_with_accessibility_options" title="Install Arch Linux with accessibility options">Install Arch Linux with accessibility options</a>. For alternative means of installation, see <a href="/title/Category:Installation_process" title="Category:Installation process">Category:Installation process</a>.
</p><p>Before installing, it would be advised to view the <a href="/title/FAQ" class="mw-redirect" title="FAQ">FAQ</a>. For conventions used in this document, see <a href="/title/Help:Reading" title="Help:Reading">Help:Reading</a>. In particular, code examples may contain placeholders (formatted in <code><i>italics</i></code>) that must be replaced manually.
</p><p>This guide is kept concise and you are advised to follow the instructions in the presented order per section. For more detailed instructions, see the respective <a href="/title/ArchWiki" class="mw-redirect" title="ArchWiki">ArchWiki</a> articles or the various programs' <a href="/title/Man_page" title="Man page">man pages</a>, both linked from this guide. For interactive help, the <a href="/title/IRC_channel" class="mw-redirect" title="IRC channel">IRC channel</a> and the <a rel="nofollow" class="external text" href="https://bbs.archlinux.org/">forums</a> are also available.
</p><p>Arch Linux should run on any <a href="https://en.wikipedia.org/wiki/X86-64" class="extiw" title="wikipedia:X86-64">x86_64</a>-compatible machine with a minimum of 512 MiB RAM, though <a href="/title/Frequently_asked_questions#How_much_RAM_is_needed_to_boot_the_live_environment?" title="Frequently asked questions">more memory is needed to boot the live system</a> for installation. A basic installation should take less than 2 GiB of disk space. As the installation process needs to retrieve packages from a remote repository, this guide assumes a working internet connection is available.
</p>
<!-- 
NewPP limit report
Cached time: 20261118203744
Cache expiry: 86400
Reduced expiry: false
Complications: []
CPU time usage: 0.020 seconds
Real time usage: 0.023 seconds
Preprocessor visited node count: 6/1000000
Revision size: 2107/2097152 bytes
Post‐expand include size: 24/2097152 bytes
Template argument size: 11/2097152 bytes
Highest expansion depth: 3/100
Expensive parser function count: 0/100
Unstrip recursion depth: 0/20
Unstrip post‐expand size: 0/5000000 bytes
-->
<!--
Transclusion expansion time report (%,ms,calls,template)
100.00%    2.288      1 Template:Ic
100.00%    2.288      1 -total
-->

<!-- Render ID e828aa09-e38f-11f1-82f6-fd494e25102f -->
</div>`;
const ARCHWIKI_REDIRECT_HTML = `<div class="mw-content-ltr mw-parser-output" lang="en" dir="ltr"><div class="archwiki-template-meta-related-articles"><p>Related articles</p><ul>
<li><a href="/title/Arch_compared_to_other_distributions" title="Arch compared to other distributions">Arch compared to other distributions</a></li>
<li><a href="/title/Arch_terminology" title="Arch terminology">Arch terminology</a></li>
<li><a href="/title/Arch-based_distributions" title="Arch-based distributions">Arch-based distributions</a></li>
<li><a href="/title/Frequently_asked_questions" title="Frequently asked questions">Frequently asked questions</a></li>
<li><a href="/title/Trademark_policy" class="mw-redirect" title="Trademark policy">Trademark policy</a></li>
<li><a href="/title/Archiso" title="Archiso">archiso</a></li>
</ul></div>
<p><a href="https://en.wikipedia.org/wiki/Arch_Linux" class="extiw" title="wikipedia:Arch Linux">Arch Linux</a> is an independently developed, <a href="https://en.wikipedia.org/wiki/x86-64" class="extiw" title="wikipedia:x86-64">x86-64</a> general-purpose <a href="https://en.wikipedia.org/wiki/GNU/Linux_naming_controversy" class="extiw" title="wikipedia:GNU/Linux naming controversy">GNU/Linux</a> distribution that strives to provide the <b>latest stable versions</b> of most software by following a <a href="https://en.wikipedia.org/wiki/Rolling_release#Model" class="extiw" title="wikipedia:Rolling release">rolling release model</a>.
</p><p>The default installation is a <a href="/title/Installation_guide#Install_essential_packages" title="Installation guide">minimal base system</a>, configured by the user to only add what is purposely required.
</p>
<!-- 
NewPP limit report
Cached time: 20261118203856
Cache expiry: 86400
Reduced expiry: false
Complications: []
CPU time usage: 0.026 seconds
Real time usage: 0.030 seconds
Preprocessor visited node count: 33/1000000
Revision size: 1194/2097152 bytes
Post‐expand include size: 374/2097152 bytes
Template argument size: 141/2097152 bytes
Highest expansion depth: 4/100
Expensive parser function count: 0/100
Unstrip recursion depth: 0/20
Unstrip post‐expand size: 0/5000000 bytes
-->
<!--
Transclusion expansion time report (%,ms,calls,template)
100.00%    9.825      1 -total
 49.21%    4.835      1 Template:Related_articles_start
 26.62%    2.616      6 Template:Related
 23.17%    2.277      1 Template:META_Related_articles_start
 21.64%    2.126      1 Template:Related_articles_end
-->

<!-- Render ID 1312fe07-e390-11f1-82f6-fd494e25102f -->
</div>`;

test("Arch Wiki search returns lead-section text with the navigation box dropped", async (t) => {
    const requests = [];
    mock.method(globalThis, "fetch", async (input, init) => {
        const url = new URL(input);
        requests.push(url.toString());
        const headers = new Headers(init.headers);
        assert.equal(headers.get("authorization"), null);
        assert.equal(headers.get("cookie"), null);
        assert.match(headers.get("user-agent"), /hello@pollinations.ai/);
        assert.equal(url.hostname, "wiki.archlinux.org");
        if (url.searchParams.get("list") === "search") {
            assert.equal(url.searchParams.get("srsearch"), "firefox");
            assert.equal(url.searchParams.get("srlimit"), "2");
            return Response.json({
                query: {
                    searchinfo: { totalhits: 36 },
                    search: [
                        {
                            ns: 0,
                            title: "Firefox",
                            pageid: 3157,
                            snippet:
                                '[[de:<span class="searchmatch">Firefox</span>]]\n[[es:<span class="searchmatch">Firefox</span>]]\n',
                        },
                        {
                            ns: 0,
                            title: "Installation guide",
                            pageid: 2073,
                            snippet:
                                'guide for <span class="searchmatch">firefox</span> install',
                        },
                    ],
                },
            });
        }
        assert.equal(url.searchParams.get("prop"), "text");
        assert.equal(url.searchParams.get("section"), "0");
        assert.equal(url.searchParams.get("redirects"), "1");
        const page = url.searchParams.get("page");
        const html =
            page === "Firefox" ? ARCHWIKI_FIREFOX_HTML : ARCHWIKI_INSTALL_HTML;
        return Response.json({
            parse: { title: page, pageid: 1, text: { "*": html } },
        });
    });
    const c = await client(t);
    const result = await call(c, "archwiki_search", {
        query: "firefox",
        limit: 2,
    });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    const val = value(result);
    assert.equal(val.query, "firefox");
    assert.equal(val.total, 36);
    assert.equal(val.results.length, 2);
    assert.deepEqual(val.results[0], {
        title: "Firefox",
        pageid: 3157,
        snippet: "[[de:Firefox]] [[es:Firefox]]",
        text: "Firefox is a popular open-source graphical web browser developed by Mozilla.",
        truncated: false,
        url: "https://wiki.archlinux.org/title/Firefox",
    });
    assert.deepEqual(val.results[1], {
        title: "Installation guide",
        pageid: 2073,
        snippet: "guide for firefox install",
        text: `This document is a guide for installing Arch Linux using the live system booted from an installation medium made from an official installation image. Its accessibility features are described on the page Install Arch Linux with accessibility options. For alternative means of installation, see Category:Installation process. Before installing, it would be advised to view the FAQ. For conventions used in this document, see Help:Reading. In particular, code examples may contain placeholders (formatted in italics) that must be replaced manually. This guide is kept concise and you are advised to follow the instructions in the presented order per section. For more detailed instructions, see the respective ArchWiki articles or the various programs' man pages, both linked from this guide. For interactive help, the IRC channel and the forums are also available. Arch Linux should run on any x86_64-compatible machine with a minimum of 512 MiB RAM, though more memory is needed to boot the live system for installation. A basic installation should take less than 2 GiB of disk space. As the installation process needs to retrieve packages from a remote repository, this guide assumes a working internet connection is available.`,
        truncated: false,
        url: "https://wiki.archlinux.org/title/Installation%20guide",
    });
    // One search fetch plus one parse fetch per hit.
    assert.equal(requests.length, 3);
});

test("Arch Wiki search returns an empty list for no match and rejects blank queries and out-of-range limits before fetch", async (t) => {
    let count = 0;
    mock.method(globalThis, "fetch", async () => {
        count++;
        return Response.json({
            query: { searchinfo: { totalhits: 0 }, search: [] },
        });
    });
    const c = await client(t);
    const result = await call(c, "archwiki_search", {
        query: "zzzzqqqxxyy",
    });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    assert.deepEqual(value(result), {
        query: "zzzzqqqxxyy",
        total: 0,
        results: [],
    });
    assert.equal(count, 1);
    for (const args of [{ query: " " }, { query: "x", limit: 99 }]) {
        const bad = await call(c, "archwiki_search", args).catch(() => ({
            isError: true,
        }));
        assert.equal(bad.isError, true);
    }
    assert.equal(count, 1);
});

test("Arch Wiki search keeps a result whose page cannot be read, follows redirects, and caps long text at 2000 characters", async (t) => {
    const searchBody = (title) => ({
        query: {
            searchinfo: { totalhits: 1 },
            search: [{ title, pageid: 1, snippet: title }],
        },
    });
    const c = await client(t);

    mock.method(globalThis, "fetch", async (input) => {
        const url = new URL(input);
        if (url.searchParams.get("list") === "search")
            return Response.json(searchBody("Zzzqqqxxyy No Such Page"));
        return Response.json({
            error: {
                code: "missingtitle",
                info: "The page you specified doesn't exist.",
            },
        });
    });
    let result = await call(c, "archwiki_search", {
        query: "zzzzqqqxxyy",
        limit: 1,
    });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    assert.equal(value(result).results[0].text, null);
    assert.equal(value(result).results[0].truncated, false);

    mock.method(globalThis, "fetch", async (input) => {
        const url = new URL(input);
        if (url.searchParams.get("list") === "search")
            return Response.json(searchBody("ArchLinux"));
        assert.equal(url.searchParams.get("redirects"), "1");
        return Response.json({
            parse: {
                title: "Arch Linux",
                pageid: 2072,
                text: { "*": ARCHWIKI_REDIRECT_HTML },
            },
        });
    });
    result = await call(c, "archwiki_search", {
        query: "archlinux",
        limit: 1,
    });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    const redirected = value(result).results[0];
    assert.match(
        redirected.text,
        /^Arch Linux is an independently developed, x86-64 general-purpose GNU\/Linux distribution/,
    );
    assert.equal(redirected.text.includes("Related articles"), false);
    assert.equal(redirected.truncated, false);

    mock.method(globalThis, "fetch", async (input) => {
        const url = new URL(input);
        if (url.searchParams.get("list") === "search")
            return Response.json(searchBody("Installation guide"));
        return Response.json({
            parse: {
                title: "Installation guide",
                pageid: 1,
                text: { "*": ARCHWIKI_INSTALL_HTML.repeat(6) },
            },
        });
    });
    result = await call(c, "archwiki_search", {
        query: "installation",
        limit: 1,
    });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    assert.equal(value(result).results[0].text.length, 2000);
    assert.equal(value(result).results[0].truncated, true);
    assert.match(
        value(result).results[0].text,
        /^This document is a guide for installing Arch Linux/,
    );
});
