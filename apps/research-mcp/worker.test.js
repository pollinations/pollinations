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
                "biorxiv_recent",
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

test("bioRxiv lists recent preprints newest-first, validates dates and categories", async (t) => {
    // Trimmed real fixtures from live api.biorxiv.org responses
    // (2026-11-16, details endpoint, 15-day window).
    const page0 = [
        {
            title: "Lymphangiogenesis is Critical for Healing and Survival in a Murine Model of Laryngotracheal Injury",
            authors:
                "Gulleman, P.; Zhang, Y.; Clark, F.; Litvak, M.; Clinton, A.; Hillel, A.; Deutsch, G.; Yang, T. S.; Gelbard, A.; Sucre, J. M.; Park, J. S.",
            date: "2026-11-02",
            doi: "10.64898/2026.08.19.745806",
            category: "physiology",
            type: "new results",
            version: 2,
            license: "cc_by_nc_nd",
            server: "bioRxiv",
            abstract:
                "Objective: Lymphatic dysfunction has been implicated in exacerbating fibrosis in numerous diseases, yet the role of the lymphatic system in laryngotracheal injury has not previously been explored. This study aims to evaluate lymphatic vascular remodeling in a murine model of laryngotracheal stenosis (LTS) and determine how pharmacologic blockade of lymphangiogenesis impacts airway healing after mucosal injury. Methods: LTS was induced in C57BL6 mice using an established chemomechanical injury model. Lymphatic density was quantified using LYVE-1 immunohistochemistry. Mice were treated with the ",
        },
        {
            title: "Head movement allocation in freely-moving macaques learning object-context sequences",
            authors:
                "Rahman, K. F.; Abbaspoor, S.; Zinke, W.; Tamaki, H.; Hoffman, K. L.",
            date: "2026-11-02",
            doi: "10.1101/2023.12.11.571113",
            category: "neuroscience",
            type: "new results",
            version: 2,
            license: "cc_by_nc",
            server: "bioRxiv",
            abstract:
                "Flexible learning and long-term memory are hallmark features of primate cognition that are shaped by interactions with changing environments. A comprehensive understanding of these brain-body-environm",
        },
        {
            title: "A rational design strategy and validation for protease-resistant fusion-inhibitor antiviral peptides",
            authors: "Yang, K.; Wang, C.; Topi, F.",
            date: "2026-11-02",
            doi: "10.64898/2026.09.12.750390",
            category: "microbiology",
            type: "new results",
            version: 2,
            license: "cc_by",
            server: "bioRxiv",
            abstract:
                "Peptide-based fusion inhibitors are promising pharmaceuticals in the fight against enveloped viruses relying on membrane fusion for host infection. However, peptide therapeutic applications have long ",
        },
    ];
    const lastPage = [
        {
            title: "Metabolic rewiring of sugar alcohols drives lichen symbiosis in Trebouxiophyceae microalgae",
            authors: "Perez-Rodrigo, M.; Calvo, D.; Carrasco, P.; Marco, F.",
            date: "2026-11-17",
            doi: "10.64898/2026.11.13.766367",
            category: "plant biology",
            type: "new results",
            version: 1,
            license: "cc_no",
            server: "bioRxiv",
            abstract:
                "Lichen symbioses are among the most successful mutualisms in extreme environments, yet the biochemical traits that enable algal pa",
        },
        {
            title: "Human tau compromises neuronal structural integrity in C. elegans independently of disease-associated modifications",
            authors:
                "Joshi, M.; van Schijndel, V.; Tiggelaar, J.; van Falier, S. J. A.; Sinnige, T.",
            date: "2026-11-17",
            doi: "10.1101/2025.08.01.668095",
            category: "neuroscience",
            type: "new results",
            version: 2,
            license: "cc_by_nc",
            server: "bioRxiv",
            abstract:
                "Tauopathies are a group of progressive neurodegenerative diseases amongst which Alzheimer's disease is the most prevalent. They ty",
        },
        {
            title: "A Latent Variable Perspective on EEG Measures of Attentional Control",
            authors: "Sabo, M.; von Bastian, C. C.; Wascher, E.; Schneider, D.",
            date: "2026-11-17",
            doi: "10.64898/2026.11.13.766498",
            category: "neuroscience",
            type: "new results",
            version: 1,
            license: "cc_by_nc_nd",
            server: "bioRxiv",
            abstract:
                "Attentional control is a core cognitive function, yet there is still a significant debate revolving around its definition, factori",
        },
        {
            title: "In vitro and in vivo validation of recombinant Syrian hamster interferon-α",
            authors: "Neven, V.; Beelen, S.; Broeckhoven, E.",
            date: "2026-11-17",
            doi: "10.64898/2026.11.12.766184",
            category: "immunology",
            type: "new results",
            version: 1,
            license: "cc_by",
            server: "bioRxiv",
            abstract:
                "The Syrian hamster (Mesocricetus auratus) is an important model for the study of viral pathogenesis and the development of antivir",
        },
        {
            title: "Periodic spatial patterning of gene expression via a natural quorum-synchronized oscillator",
            authors: "Sridhar, V.; Guenther, S.; Guo, K.",
            date: "2026-11-17",
            doi: "10.64898/2026.11.13.766566",
            category: "microbiology",
            type: "new results",
            version: 1,
            license: "cc0_ng",
            server: "bioRxiv",
            abstract:
                "In many biological systems, genetic oscillators that function in growing tissues can establish spatially repetitive patt",
        },
        {
            title: "An Optimized ChIP-sequencing protocol for transcription factors in embryonic mouse brains",
            authors: "Li, A.; Lim, Y.; Cho, G.",
            date: "2026-11-17",
            doi: "10.64898/2026.11.13.766299",
            category: "molecular biology",
            type: "new results",
            version: 1,
            license: "cc_no",
            server: "bioRxiv",
            abstract:
                "Chromatin immunoprecipitation followed by sequencing (ChIP-Seq) is widely used to identify genome-wide protein-chromatin interactions. However, obtaining reliable ChIP-seq data for transcription factors has been challenging for several reasons, including their low abundance, transient or weak DNA binding, and poor antibody performance. Here, we present an improved ChIP-Seq protocol for mapping transcription factor occupancy in embryonic mouse brains. We describe critical steps in tissue preparation, fixation and antigen unmasking steps, and chromatin fragmentation by prolonged sonication, spec",
        },
    ];

    let fetchCount = 0;
    const seenUrls = [];
    mock.method(globalThis, "fetch", async (input, init) => {
        fetchCount++;
        const request = new Request(input, init);
        const url = new URL(request.url);
        seenUrls.push(url.toString());
        assert.equal(url.hostname, "api.biorxiv.org");
        assert.equal(request.headers.get("authorization"), null);
        assert.equal(request.headers.get("cookie"), null);
        const [, , server, start, end, cursor] = url.pathname.split("/");
        assert.equal(url.pathname.split("/").at(-1), "json");
        if (start === "2000-01-01")
            return Response.json({ messages: [{ status: "no posts found" }] });
        const category = url.searchParams.get("category");
        // Live behavior: an unknown category is silently ignored and the
        // API echoes "all" instead.
        const echo =
            category === "not_a_category" ? "all" : (category ?? "all");
        if (category === "neuroscience")
            return Response.json({
                messages: [
                    {
                        status: "ok",
                        category: "neuroscience",
                        interval: `${start}:${end}`,
                        cursor,
                        count: 1,
                        total: "1",
                    },
                ],
                collection: [page0[1]],
            });
        if (server === "medrxiv")
            return Response.json({
                messages: [
                    {
                        status: "ok",
                        category: "all",
                        interval: `${start}:${end}`,
                        cursor,
                        count: page0.length,
                        total: "12",
                    },
                ],
                collection: page0.map((p) => ({ ...p, server: "medRxiv" })),
            });
        return Response.json({
            messages: [
                {
                    status: "ok",
                    category: echo,
                    interval: `${start}:${end}`,
                    cursor,
                    count: cursor === "30" ? lastPage.length : page0.length,
                    total: "35",
                },
            ],
            collection: cursor === "30" ? lastPage : page0,
        });
    });

    const c = await client(t);
    const today = new Date().toISOString().slice(0, 10);
    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

    // Default call: last 7 days, two fetches (total 35 > page size 30),
    // newest first from the last page.
    const before = fetchCount;
    const result = await call(c, "biorxiv_recent", {
        start_date: "2026-11-02",
        end_date: "2026-11-17",
        limit: 3,
    });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    assert.equal(fetchCount - before, 2, "page 0 + newest page");
    const val = value(result);
    assert.equal(val.server, "biorxiv");
    assert.equal(val.startDate, "2026-11-02");
    assert.equal(val.endDate, "2026-11-17");
    assert.equal(val.totalResults, 35);
    assert.equal(val.preprints.length, 3);
    assert.deepEqual(
        val.preprints.map((p) => p.title),
        [
            "An Optimized ChIP-sequencing protocol for transcription factors in embryonic mouse brains",
            "Periodic spatial patterning of gene expression via a natural quorum-synchronized oscillator",
            "In vitro and in vivo validation of recombinant Syrian hamster interferon-α",
        ],
    );
    const first = val.preprints[0];
    assert.deepEqual(first.authors, ["Li, A.", "Lim, Y.", "Cho, G."]);
    assert.equal(first.date, "2026-11-17");
    assert.equal(first.doi, "10.64898/2026.11.13.766299");
    assert.equal(first.url, "https://doi.org/10.64898/2026.11.13.766299");
    assert.equal(first.category, "molecular biology");
    assert.equal(first.type, "new results");
    assert.equal(first.version, 1);
    assert.equal(first.license, "cc_no");
    assert.equal(first.server, "bioRxiv");
    assert.equal(first.abstractSnippet.length, 500);
    assert.match(
        first.abstractSnippet,
        /^Chromatin immunoprecipitation followed by sequencing/,
    );
    // Short abstracts pass through untruncated.
    assert.equal(
        val.preprints[1].abstractSnippet,
        "In many biological systems, genetic oscillators that function in growing tissues can establish spatially repetitive patt",
    );

    // Category filter is applied server-side and echoed back.
    const neuro = await call(c, "biorxiv_recent", {
        start_date: "2026-11-02",
        end_date: "2026-11-17",
        category: "neuroscience",
    });
    assert.notEqual(neuro.isError, true, JSON.stringify(neuro));
    assert.equal(value(neuro).category, "neuroscience");
    assert.equal(value(neuro).totalResults, 1);
    assert.equal(value(neuro).preprints[0].category, "neuroscience");
    assert.ok(
        seenUrls.some((u) => u.includes("category=neuroscience")),
        seenUrls.join("\n"),
    );

    // Unknown categories are rejected, not silently unfiltered.
    const badCat = await call(c, "biorxiv_recent", {
        start_date: "2026-11-02",
        end_date: "2026-11-17",
        category: "not_a_category",
    });
    assert.equal(badCat.isError, true);

    // Empty ranges are clean empty results, not errors.
    const empty = await call(c, "biorxiv_recent", {
        start_date: "2000-01-01",
        end_date: "2000-01-02",
    });
    assert.notEqual(empty.isError, true, JSON.stringify(empty));
    assert.equal(value(empty).totalResults, 0);
    assert.deepEqual(value(empty).preprints, []);

    // medRxiv is a separate server on the same API.
    const med = await call(c, "biorxiv_recent", {
        server: "medrxiv",
        start_date: "2026-11-02",
        end_date: "2026-11-17",
        limit: 2,
    });
    assert.notEqual(med.isError, true, JSON.stringify(med));
    assert.equal(value(med).server, "medrxiv");
    assert.equal(value(med).preprints[0].server, "medRxiv");
    assert.ok(
        seenUrls.some((u) => u.includes("/details/medrxiv/")),
        seenUrls.join("\n"),
    );

    // Defaults: no dates means the last 7 days ending today.
    const def = await call(c, "biorxiv_recent", {});
    assert.notEqual(def.isError, true, JSON.stringify(def));
    assert.equal(value(def).startDate, sixDaysAgo);
    assert.equal(value(def).endDate, today);

    // Bad inputs are rejected before any fetch.
    const beforeBad = fetchCount;
    for (const args of [
        { start_date: "2026-13-01", end_date: "2026-11-17" },
        { start_date: "2026-02-30", end_date: "2026-11-17" },
        { start_date: "11/02/2026", end_date: "2026-11-17" },
        { start_date: "2026-11-17", end_date: "2026-11-02" },
        { start_date: "2026-11-02", end_date: "2026-11-17", limit: 0 },
        { start_date: "2026-11-02", end_date: "2026-11-17", limit: 31 },
    ]) {
        const bad = await call(c, "biorxiv_recent", args);
        assert.equal(bad.isError, true, JSON.stringify(args));
    }
    assert.equal(fetchCount, beforeBad, "no fetch for invalid inputs");
});
