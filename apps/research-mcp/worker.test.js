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

test("medlineplus topics return plain-text titles and snippets with retmax", async (t) => {
    const fixture = `<?xml version="1.0" encoding="UTF-8"?>
<nlmSearchResult>
  <term>diabetes</term>
  <count>295</count>
  <retstart>0</retstart>
  <retmax>2</retmax>
  <list num="295" start="0" per="2">
<document rank="2" url="https://medlineplus.gov/diabetes.html">
      <content name="title">&lt;span class="qt0"&gt;Diabetes&lt;/span&gt;</content>
      <content name="organizationName">National Library of Medicine</content>
      <content name="altTitle">&lt;span class="qt0"&gt;Diabetes Mellitus&lt;/span&gt;</content>
      <content name="altTitle">Sugar &lt;span class="qt0"&gt;Diabetes&lt;/span&gt;</content>
      <content name="altTitle">DM</content>
      <content name="FullSummary">What is &lt;span class="qt0"&gt;diabetes&lt;/span&gt;?&lt;p&gt;&lt;span class="qt0"&gt;Diabetes&lt;/span&gt;, also known as &lt;span class="qt0"&gt;diabetes mellitus&lt;/span&gt;, is a disease in which your blood glucose, or blood sugar, levels are too high. Glucose is your body's main source of energy. Your body can make glucose, but it also comes from the food you eat. Insulin is a hormone made by your pancreas. Insulin helps move glucose from your bloodstream into your cells, where it can be used for energy.&lt;/p&gt;&lt;p&gt;If you have &lt;span class="qt0"&gt;diabetes&lt;/span&gt;, your body can't make insulin, can't use insulin as well as it should, or both. Too much glucose stays in your blood and doesn't reach your cells. This can cause glucose levels to get too high. Over time, high blood glucose levels can lead to serious health conditions. But you can take steps to manage your &lt;span class="qt0"&gt;diabetes&lt;/span&gt; and try to prevent these health problems.&lt;/p&gt;What are the types of &lt;span class="qt0"&gt;diabetes&lt;/span&gt;?&lt;p&gt;There are different types of &lt;span class="qt0"&gt;diabetes&lt;/span&gt;:&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Type 1 &lt;span class="qt0"&gt;diabetes&lt;/span&gt;. If you have type 1 &lt;span class="qt0"&gt;diabetes&lt;/span&gt;, your body makes little or no insulin. It happens when your immune system attacks and destroys the cells that produce insulin. &lt;/li&gt;&lt;li&gt;Type 2 &lt;span class="qt0"&gt;diabetes&lt;/span&gt;. This is the most common form of &lt;span class="qt0"&gt;diabetes&lt;/span&gt;. If you have type 2 &lt;span class="qt0"&gt;diabetes&lt;/span&gt;, your body may still be able to make insulin, but your cells don't respond well to insulin. They can't easily take up enough glucose from your blood.&lt;/li&gt;&lt;li&gt;Gestational &lt;span class="qt0"&gt;diabetes&lt;/span&gt;. This is a form of &lt;span class="qt0"&gt;diabetes&lt;/span&gt; that develops during pregnancy. It happens when your body can't make the extra insulin it needs during pregnancy.&lt;/li&gt;&lt;/ul&gt;What causes &lt;span class="qt0"&gt;diabetes&lt;/span&gt;?&lt;p&gt;The different types of &lt;span class="qt0"&gt;diabetes&lt;/span&gt; have different causes:&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Researchers think type 1 &lt;span class="qt0"&gt;diabetes&lt;/span&gt; is caused by genes and factors in the environment that might trigger the disease.&lt;/li&gt;&lt;li&gt;Type 2 &lt;span class="qt0"&gt;diabetes&lt;/span&gt; is caused by several factors, including lifestyle factors and genes. The lifestyle factors include not being physically active and being overweight or having obesity.&lt;/li&gt;&lt;li&gt;Researchers think gestational &lt;span class="qt0"&gt;diabetes&lt;/span&gt; is caused by the hormonal changes of pregnancy along with genetic and lifestyle factors.&lt;/li&gt;&lt;/ul&gt;Who is more likely to develop &lt;span class="qt0"&gt;diabetes&lt;/span&gt;?&lt;p&gt;The different types of &lt;span class="qt0"&gt;diabetes&lt;/span&gt; have different risk factors:&lt;/p&gt;&lt;ul&gt;&lt;li&gt;You can develop type 1 &lt;span class="qt0"&gt;diabetes&lt;/span&gt; at any age, but it most often starts in childhood. Having a parent or sibling with type 1 &lt;span class="qt0"&gt;diabetes&lt;/span&gt; may increase your chance of developing it.&lt;/li&gt;&lt;li&gt;You are at higher risk of developing type 2 &lt;span class="qt0"&gt;diabetes&lt;/span&gt; if you:&lt;/li&gt;&lt;ul&gt;&lt;li&gt;Are overweight or have obesity.&lt;/li&gt;&lt;li&gt;Are over age 35. Children, teenagers, and younger adults can get &lt;span class="qt0"&gt;diabetes&lt;/span&gt;, but it is more common in middle-aged and older adults.&lt;/li&gt;&lt;li&gt;Have a family history of &lt;span class="qt0"&gt;diabetes&lt;/span&gt;.&lt;/li&gt;&lt;li&gt;Have prediabetes. This means that your blood glucose is higher than normal, but it's not high enough to be called &lt;span class="qt0"&gt;diabetes&lt;/span&gt;.&lt;/li&gt;&lt;li&gt;Had gestational &lt;span class="qt0"&gt;diabetes&lt;/span&gt;.&lt;/li&gt;&lt;li&gt;Have given birth to a baby weighing 9 pounds or more.&lt;/li&gt;&lt;li&gt;Are African American, American Indian, Asian American, Hispanic/Latino, or Pacific Islander.&lt;/li&gt;&lt;li&gt;Are not physically active.&lt;/li&gt;&lt;li&gt;Have certain other health conditions, such as high blood pressure or polycystic ovary syndrome (PCOS).&lt;/li&gt;&lt;/ul&gt;&lt;li&gt;You are at higher risk of developing gestational &lt;span class="qt0"&gt;diabetes&lt;/span&gt; if you:&lt;/li&gt;&lt;ul&gt;&lt;li&gt;Are overweight or have obesity.&lt;/li&gt;&lt;li&gt;Have a family history of &lt;span class="qt0"&gt;diabetes&lt;/span&gt;.&lt;/li&gt;&lt;li&gt;Had gestational &lt;span class="qt0"&gt;diabetes&lt;/span&gt; in a previous pregnancy.&lt;/li&gt;&lt;li&gt;Have given birth to a baby weighing 9 pounds or more.&lt;/li&gt;&lt;li&gt;Have polycystic ovary syndrome (PCOS).&lt;/li&gt;&lt;li&gt;Are African American, Hispanic/Latino, American Indian, Alaska Native, Native Hawaiian, or Pacific Islander.&lt;/li&gt;&lt;/ul&gt;&lt;/ul&gt;What are the symptoms of &lt;span class="qt0"&gt;diabetes&lt;/span&gt;?&lt;p&gt;The symptoms of &lt;span class="qt0"&gt;diabetes&lt;/span&gt; may include:&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Feeling very thirsty&lt;/li&gt;&lt;li&gt;Feeling very hungry&lt;/li&gt;&lt;li&gt;Urinating (peeing) more often, including at night&lt;/li&gt;&lt;li&gt;Fatigue&lt;/li&gt;&lt;li&gt;Blurry vision&lt;/li&gt;&lt;li&gt;Numbness or tingling in the feet or hands&lt;/li&gt;&lt;li&gt;Sores that do not heal&lt;/li&gt;&lt;li&gt;Losing weight without trying&lt;/li&gt;&lt;/ul&gt;&lt;p&gt;But it's important to know that your symptoms may vary, depending on which type you have:&lt;/p&gt;&lt;ul&gt;&lt;li&gt;The symptoms of type 1 &lt;span class="qt0"&gt;diabetes&lt;/span&gt; usually come on quickly and can be severe.&lt;/li&gt;&lt;li&gt;With type 2 &lt;span class="qt0"&gt;diabetes&lt;/span&gt;, the symptoms often develop slowly, over several years. The symptoms can be so mild that you might not even notice them.&lt;/li&gt;&lt;li&gt;Gestational &lt;span class="qt0"&gt;diabetes&lt;/span&gt; often has no symptoms. If you do have symptoms, they may be mild. If you are pregnant, you will usually be screened for this condition between 24 and 28 weeks of pregnancy. &lt;/li&gt;&lt;/ul&gt;How is &lt;span class="qt0"&gt;diabetes&lt;/span&gt; diagnosed?&lt;p&gt;To find out if you have &lt;span class="qt0"&gt;diabetes&lt;/span&gt;, your health care provider will use one or more glucose blood tests. There are several types, including the A1C test.&lt;/p&gt;What are the treatments for &lt;span class="qt0"&gt;diabetes&lt;/span&gt;?&lt;p&gt;Treatment for &lt;span class="qt0"&gt;diabetes&lt;/span&gt; involves managing your blood glucose levels:&lt;/p&gt;&lt;ul&gt;&lt;li&gt;If you have type 1 &lt;span class="qt0"&gt;diabetes&lt;/span&gt;, you will need to take daily doses of insulin, either by injection or through a special pump. Some people also need to take another type of &lt;span class="qt0"&gt;diabetes&lt;/span&gt; medicine that works with insulin.&lt;/li&gt;&lt;li&gt;If you have type 2 &lt;span class="qt0"&gt;diabetes&lt;/span&gt;, you may be able to manage or even reverse it by making lifestyle changes. These include eating a healthy diet, staying at healthy weight, and getting regular physical activity. Some people also need to take &lt;span class="qt0"&gt;diabetes&lt;/span&gt; medicines to manage their &lt;span class="qt0"&gt;diabetes&lt;/span&gt;.&lt;/li&gt;&lt;li&gt;If you have gestational &lt;span class="qt0"&gt;diabetes&lt;/span&gt;, you may be able to lower your glucose levels by eating a healthy diet and getting regular exercise. But be sure to talk to your provider about your treatment options. Gestational &lt;span class="qt0"&gt;diabetes&lt;/span&gt; usually goes away after you give birth. But you will have a higher risk of developing type 2 &lt;span class="qt0"&gt;diabetes&lt;/span&gt; later.&lt;/li&gt;&lt;/ul&gt;&lt;p&gt;Checking your blood glucose levels is also an important part of managing your &lt;span class="qt0"&gt;diabetes&lt;/span&gt;. Ask your provider about the best way to check your blood glucose level and how often you should check it.&lt;/p&gt;Can &lt;span class="qt0"&gt;diabetes&lt;/span&gt; be prevented?&lt;p&gt;Type 1 &lt;span class="qt0"&gt;diabetes&lt;/span&gt; can't be prevented.&lt;/p&gt;&lt;p&gt;You may be able to delay or prevent type 2 &lt;span class="qt0"&gt;diabetes&lt;/span&gt; through the same lifestyle changes that are used to manage &lt;span class="qt0"&gt;diabetes&lt;/span&gt; (eating a healthy diet, staying at a healthy weight, and getting regular physical activity). These lifestyle changes may also help prevent gestational &lt;span class="qt0"&gt;diabetes&lt;/span&gt;.&lt;/p&gt;&lt;p&gt;NIH: National Institute of &lt;span class="qt0"&gt;Diabetes&lt;/span&gt; and Digestive and Kidney Diseases&lt;/p&gt;</content>
      <content name="mesh">&lt;span class="qt0"&gt;Diabetes Mellitus&lt;/span&gt;</content>
      <content name="groupName">Older Adults</content>
      <content name="groupName">Endocrine System</content>
      <content name="groupName">Metabolic Problems</content>
      <content name="groupName">&lt;span class="qt0"&gt;Diabetes Mellitus&lt;/span&gt;</content>
      <content name="snippet">What is &lt;span class="qt0"&gt;diabetes? Diabetes&lt;/span&gt;, also known as &lt;span class="qt0"&gt;diabetes mellitus&lt;/span&gt;, is a disease in which your blood glucose, or blood sugar, levels are too high. Glucose is  ... </content>
    </document>
<document rank="0" url="https://medlineplus.gov/diabetestype1.html">
      <content name="title">&lt;span class="qt0"&gt;Diabetes&lt;/span&gt; Type 1</content>
      <content name="organizationName">National Library of Medicine</content>
      <content name="altTitle">Insulin-Dependent &lt;span class="qt0"&gt;Diabetes Mellitus&lt;/span&gt;</content>
      <content name="altTitle">Juvenile &lt;span class="qt0"&gt;Diabetes&lt;/span&gt;</content>
      <content name="altTitle">Type 1 &lt;span class="qt0"&gt;Diabetes&lt;/span&gt;</content>
      <content name="altTitle">Insulin-dependent &lt;span class="qt0"&gt;diabetes&lt;/span&gt;</content>
      <content name="altTitle">Type I &lt;span class="qt0"&gt;diabetes&lt;/span&gt;</content>
      <content name="FullSummary">What is type 1 &lt;span class="qt0"&gt;diabetes&lt;/span&gt;?&lt;p&gt;&lt;span class="qt0"&gt;Diabetes&lt;/span&gt; means your blood glucose, also called blood sugar, is too high. With type 1 &lt;span class="qt0"&gt;diabetes&lt;/span&gt;, your body makes little or no insulin. Insulin is a hormone from your pancreas that helps glucose move from your body into your cells, where it is used for energy. Your body can make glucose, but it also comes from the food you eat. Without insulin, too much glucose stays in your blood. &lt;/p&gt;&lt;p&gt;Over time, high blood glucose can lead to serious problems with your heart, eyes, kidneys, nerves, gums, and teeth.  &lt;/p&gt;&lt;p&gt;If your blood glucose gets very high, you can develop diabetic ketoacidosis (DKA). It happens when your body doesn't have enough insulin to allow glucose into your cells. Instead, your liver breaks down fat for energy, which produces ketones. When ketones build up too quickly, they can reach dangerous levels. DKA is a life-threatening emergency. &lt;/p&gt;What causes type 1 &lt;span class="qt0"&gt;diabetes&lt;/span&gt;?&lt;p&gt;Type 1 &lt;span class="qt0"&gt;diabetes&lt;/span&gt; is an autoimmune disease. Your immune system mistakenly attacks the cells in your pancreas that make insulin. Researchers don't yet know exactly why this happens. Genes and environmental factors may play a role in triggering the disease. &lt;/p&gt;Who is more likely to develop type 1 &lt;span class="qt0"&gt;diabetes&lt;/span&gt;?&lt;p&gt;Type 1 &lt;span class="qt0"&gt;diabetes&lt;/span&gt; often begins in children and young adults, but it can appear at any age. Having a parent or sibling with type 1 &lt;span class="qt0"&gt;diabetes&lt;/span&gt; may increase your chance of developing it. &lt;/p&gt;What are the symptoms of type 1 &lt;span class="qt0"&gt;diabetes&lt;/span&gt;?&lt;p&gt;Symptoms often start quickly, especially in children. In adults, they may develop more slowly. Symptoms may include: &lt;/p&gt;&lt;ul&gt;&lt;li&gt;Feeling very thirsty &lt;/li&gt;&lt;li&gt;Feeling very hungry &lt;/li&gt;&lt;li&gt;Urinating (peeing) more often, including at night &lt;/li&gt;&lt;li&gt;Having fatigue&lt;/li&gt;&lt;li&gt;Having blurry vision &lt;/li&gt;&lt;li&gt;Losing feeling in your feet, or having tingling in your feet or hands &lt;/li&gt;&lt;li&gt;Having sores that don't heal  &lt;/li&gt;&lt;li&gt;Losing weight without trying &lt;/li&gt;&lt;/ul&gt;How is type 1 &lt;span class="qt0"&gt;diabetes&lt;/span&gt; diagnosed?&lt;p&gt;Blood tests that measure your blood glucose level can show whether it is higher than normal for you. &lt;/p&gt;What are the treatments for type 1 &lt;span class="qt0"&gt;diabetes&lt;/span&gt;?&lt;p&gt;Type 1 &lt;span class="qt0"&gt;diabetes&lt;/span&gt; is a chronic (long-term) condition. You will need daily insulin, either through injections or an insulin pump. Some people also take another &lt;span class="qt0"&gt;diabetes&lt;/span&gt; medicine that works with insulin. &lt;/p&gt;&lt;p&gt;Ask your health care provider about the best way to check your blood glucose level and how often you should check it. &lt;/p&gt;Can type 1 &lt;span class="qt0"&gt;diabetes&lt;/span&gt; be prevented?&lt;p&gt;Type 1 &lt;span class="qt0"&gt;diabetes&lt;/span&gt; can't be prevented. But you may be able to prevent or delay health problems related to &lt;span class="qt0"&gt;diabetes&lt;/span&gt; by: &lt;/p&gt;&lt;ul&gt;&lt;li&gt;Managing your blood glucose level with finger prick tests or a continuous glucose monitor (CGM) &lt;/li&gt;&lt;li&gt;Making healthy food choices&lt;/li&gt;&lt;li&gt;Getting regular exercise&lt;/li&gt;&lt;/ul&gt;&lt;p&gt;A blood test called the A1C can show how well you are managing your &lt;span class="qt0"&gt;diabetes&lt;/span&gt; over time. &lt;/p&gt;&lt;p&gt;NIH: National Institute of &lt;span class="qt0"&gt;Diabetes&lt;/span&gt; and Digestive and Kidney Diseases&lt;/p&gt;</content>
      <content name="mesh">&lt;span class="qt0"&gt;Diabetes Mellitus&lt;/span&gt;, Type 1</content>
      <content name="groupName">Children and Teenagers</content>
      <content name="groupName">Immune System</content>
      <content name="groupName">Endocrine System</content>
      <content name="groupName">&lt;span class="qt0"&gt;Diabetes Mellitus&lt;/span&gt;</content>
      <content name="snippet">What is type 1 &lt;span class="qt0"&gt;diabetes? Diabetes&lt;/span&gt; means your blood glucose, also called blood sugar, is too high. With type 1 &lt;span class="qt0"&gt;diabetes&lt;/span&gt;, your body makes little or no insulin.  ... </content>
    </document>
  </list>
</nlmSearchResult>
`;
    const noMatch = `<?xml version="1.0" encoding="UTF-8"?>
<nlmSearchResult>
  <term>zzzzqqqxxyy</term>
  <count>0</count>
</nlmSearchResult>
`;
    mock.method(globalThis, "fetch", async (url, options) => {
        const request = new Request(url, options);
        const target = new URL(request.url);
        assert.equal(target.hostname, "wsearch.nlm.nih.gov");
        assert.equal(target.searchParams.get("db"), "healthTopics");
        assert.equal(target.searchParams.get("term"), "diabetes");
        assert.equal(target.searchParams.get("retmax"), "2");
        assert.equal(request.redirect, "follow");
        const headers = request.headers;
        assert.equal(headers.get("authorization"), null);
        assert.equal(headers.get("cookie"), null);
        assert.match(headers.get("user-agent"), /hello@pollinations.ai/);
        assert.equal(headers.get("accept"), "application/xml");
        return new Response(fixture, {
            headers: { "Content-Type": "application/xml" },
        });
    });
    const c = await client(t);
    const result = await call(c, "medlineplus_topics", {
        query: "diabetes",
        limit: 2,
    });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    assert.deepEqual(value(result), {
        query: "diabetes",
        total: 295,
        topics: [
            {
                "rank": 2,
                "title": "Diabetes",
                "snippet":
                    "What is diabetes? Diabetes, also known as diabetes mellitus, is a disease in which your blood glucose, or blood sugar, levels are too high. Glucose is ...",
                "truncated": false,
                "url": "https://medlineplus.gov/diabetes.html",
            },
            {
                "rank": 0,
                "title": "Diabetes Type 1",
                "snippet":
                    "What is type 1 diabetes? Diabetes means your blood glucose, also called blood sugar, is too high. With type 1 diabetes, your body makes little or no insulin. ...",
                "truncated": false,
                "url": "https://medlineplus.gov/diabetestype1.html",
            },
        ],
    });
    mock.method(
        globalThis,
        "fetch",
        async () =>
            new Response(noMatch, {
                headers: { "Content-Type": "application/xml" },
            }),
    );
    const empty = await call(c, "medlineplus_topics", {
        query: "zzzzqqqxxyy",
    });
    assert.deepEqual(value(empty), {
        query: "zzzzqqqxxyy",
        total: 0,
        topics: [],
    });
});

test("medlineplus rejects blank queries and out-of-range limits before fetch", async (t) => {
    let count = 0;
    mock.method(globalThis, "fetch", async () => {
        count++;
        throw new Error("unexpected");
    });
    const c = await client(t);
    for (const args of [
        { query: " " },
        { query: "diabetes", limit: 99 },
        { query: "diabetes", limit: 0 },
    ]) {
        const result = await call(c, "medlineplus_topics", args).catch(() => ({
            isError: true,
        }));
        assert.equal(result.isError, true);
    }
    assert.equal(count, 0);
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
                "medlineplus_topics",
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
