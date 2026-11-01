import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_tes...oped";
const EXPECTED_TOOLS = ["random_recipe", "recipe_details", "search_recipes"];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "recipe-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://recipe-mcp.pollinations.ai"),
        {
            fetch: localFetch,
            requestInit: {
                headers: { Authorization: `Bearer ${token}` },
            },
        },
    );
    await client.connect(transport);
    return client;
}

test("serves health and requires bearer auth", async () => {
    const health = await worker.fetch(
        new Request("https://recipe-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://recipe-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="recipe-mcp.pollinations.ai"',
    );

    const oldEndpoint = await worker.fetch(
        new Request("https://recipe-mcp.pollinations.ai/mcp"),
    );
    assert.equal(oldEndpoint.status, 404);
});

test("serves current and 2025 Streamable HTTP without sessions", async () => {
    const modern = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    assert.equal(modern.getProtocolEra(), "modern");
    const modernTools = (await modern.listTools()).tools;
    assert.deepEqual(
        modernTools.map(({ name }) => name).sort(),
        EXPECTED_TOOLS,
    );
    await modern.close();

    const legacy = await connectClient();
    assert.equal(legacy.getProtocolEra(), "legacy");
    assert.deepEqual(
        (await legacy.listTools()).tools.map(({ name }) => name).sort(),
        EXPECTED_TOOLS,
    );
    await legacy.close();
});

test("rejects JSON-RPC batches", async () => {
    const response = await worker.fetch(
        new Request("https://recipe-mcp.pollinations.ai", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify([
                { jsonrpc: "2.0", id: 1, method: "tools/list" },
            ]),
        }),
    );
    assert.equal(response.status, 400);
});

const MEALS = [
    {
        idMeal: "52795",
        strMeal: "Chicken Handi",
        strCategory: "Chicken",
        strArea: "Indian",
        strInstructions: "Take a large pot or wok...",
        strTags: "Indian,Chicken",
        strMealThumb:
            "https://www.themealdb.com/images/media/meals/wvxxwy1468478234.jpg",
        strYoutube: "https://www.youtube.com/watch?v=eNuDm4dDYgo",
        strDrinkAlternate: null,
        strCreativeCommonsConfirmed: null,
    },
    {
        idMeal: "52819",
        strMeal: "Chicken Biryani",
        strCategory: "Chicken",
        strArea: "Indian",
        strInstructions: "Rinse the rice...",
        strTags: null,
        strMealThumb:
            "https://www.themealdb.com/images/media/meals/xrttsx1487339570.jpg",
        strYoutube: null,
        strDrinkAlternate: null,
        strCreativeCommonsConfirmed: null,
    },
    {
        idMeal: "52929",
        strMeal: "Chicken Cocotte",
        strCategory: "Chicken",
        strArea: "French",
        strInstructions: "Preheat the oven...",
        strTags: "Meat",
        strMealThumb:
            "https://www.themealdb.com/images/media/meals/sxxyrv1511816575.jpg",
        strYoutube: "https://www.youtube.com/watch?v=VMDWDyyRuPY",
        strDrinkAlternate: null,
        strCreativeCommonsConfirmed: null,
    },
];

test("search_recipes queries TheMealDB without forwarding caller credentials", async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (input, init) => {
        calls++;
        const url = new URL(String(input));
        assert.equal(url.origin, "https://www.themealdb.com");
        assert.equal(url.pathname, "/api/json/v1/1/search.php");
        assert.equal(url.searchParams.get("s"), "chicken");
        assert.equal(
            new Headers(init.headers).get("authorization"),
            null,
            "caller credentials must not reach TheMealDB",
        );
        return Response.json({ meals: MEALS });
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    const result = await client.callTool({
        name: "search_recipes",
        arguments: { query: "chicken", limit: 2 },
    });
    assert.notEqual(result.isError, true);
    assert.equal(calls, 1);
    const report = JSON.parse(result.content[0].text);
    assert.equal(report.query, "chicken");
    assert.equal(report.count, 2);
    assert.deepEqual(report.results, [
        {
            id: "52795",
            name: "Chicken Handi",
            category: "Chicken",
            area: "Indian",
            thumbnail:
                "https://www.themealdb.com/images/media/meals/wvxxwy1468478234.jpg",
            youtube: "https://www.youtube.com/watch?v=eNuDm4dDYgo",
            tags: "Indian,Chicken",
        },
        {
            id: "52819",
            name: "Chicken Biryani",
            category: "Chicken",
            area: "Indian",
            thumbnail:
                "https://www.themealdb.com/images/media/meals/xrttsx1487339570.jpg",
            youtube: null,
            tags: null,
        },
    ]);
});

const FULL_MEAL = {
    idMeal: "52795",
    strMeal: "Chicken Handi",
    strCategory: "Chicken",
    strArea: "Indian",
    strInstructions: "Take a large pot or wok...",
    strTags: "Indian,Chicken",
    strMealThumb:
        "https://www.themealdb.com/images/media/meals/wvxxwy1468478234.jpg",
    strYoutube: "https://www.youtube.com/watch?v=eNuDm4dDYgo",
    strIngredient1: "Chicken Breasts",
    strMeasure1: "500g",
    strIngredient2: "Onion",
    strMeasure2: "1 large",
    strIngredient3: "Garlic",
    strMeasure3: "3 cloves",
    strIngredient4: "Ginger",
    strMeasure4: "1 tbsp",
    strIngredient5: null,
    strMeasure5: null,
    strIngredient6: "",
    strMeasure6: "",
    strIngredient7: "",
    strMeasure7: "",
    strIngredient8: "",
    strMeasure8: "",
    strIngredient9: "",
    strMeasure9: "",
    strIngredient10: "",
    strMeasure10: "",
    strIngredient11: "",
    strMeasure11: "",
    strIngredient12: "",
    strMeasure12: "",
    strIngredient13: "",
    strMeasure13: "",
    strIngredient14: "",
    strMeasure14: "",
    strIngredient15: "",
    strMeasure15: "",
    strIngredient16: "",
    strMeasure16: "",
    strIngredient17: "",
    strMeasure17: "",
    strIngredient18: "",
    strMeasure18: "",
    strIngredient19: "",
    strMeasure19: "",
    strIngredient20: "",
    strMeasure20: "",
};

test("recipe_details returns the full recipe with paired ingredients", async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (input, init) => {
        calls++;
        const url = new URL(String(input));
        assert.equal(url.origin, "https://www.themealdb.com");
        assert.equal(url.pathname, "/api/json/v1/1/lookup.php");
        assert.equal(url.searchParams.get("i"), "52795");
        assert.equal(
            new Headers(init.headers).get("authorization"),
            null,
            "caller credentials must not reach TheMealDB",
        );
        return Response.json({ meals: [FULL_MEAL] });
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "recipe_details",
        arguments: { id: "52795" },
    });
    assert.notEqual(result.isError, true);
    assert.equal(calls, 1);
    const recipe = JSON.parse(result.content[0].text);
    assert.equal(recipe.id, "52795");
    assert.equal(recipe.name, "Chicken Handi");
    assert.equal(recipe.instructions, "Take a large pot or wok...");
    assert.equal(recipe.source, "https://www.themealdb.com/meal/52795");
    assert.equal(recipe.tags, "Indian,Chicken");
    assert.equal(recipe.ingredients.length, 4);
    assert.deepEqual(recipe.ingredients[0], {
        name: "Chicken Breasts",
        measure: "500g",
    });
    assert.deepEqual(recipe.ingredients[3], {
        name: "Ginger",
        measure: "1 tbsp",
    });
});

test("random_recipe serves a fully random meal", async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (input, init) => {
        calls++;
        const url = new URL(String(input));
        assert.equal(url.pathname, "/api/json/v1/1/random.php");
        assert.equal(
            new Headers(init.headers).get("authorization"),
            null,
            "caller credentials must not reach TheMealDB",
        );
        return Response.json({ meals: [FULL_MEAL] });
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "random_recipe",
        arguments: {},
    });
    assert.notEqual(result.isError, true);
    assert.equal(calls, 1);
    const recipe = JSON.parse(result.content[0].text);
    assert.equal(recipe.name, "Chicken Handi");
    assert.equal(recipe.ingredients.length, 4);
});

test("random_recipe filters by category then looks up the picked meal", async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (input, init) => {
        calls++;
        const url = new URL(String(input));
        assert.equal(
            new Headers(init.headers).get("authorization"),
            null,
            "caller credentials must not reach TheMealDB",
        );
        if (url.pathname === "/api/json/v1/1/filter.php") {
            assert.equal(url.searchParams.get("c"), "Dessert");
            return Response.json({
                meals: [{ idMeal: "52893", strMeal: "Apple Pie" }],
            });
        }
        assert.equal(url.pathname, "/api/json/v1/1/lookup.php");
        assert.equal(url.searchParams.get("i"), "52893");
        return Response.json({ meals: [FULL_MEAL] });
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "random_recipe",
        arguments: { category: "Dessert" },
    });
    assert.notEqual(result.isError, true);
    assert.equal(calls, 2);
    const recipe = JSON.parse(result.content[0].text);
    assert.equal(recipe.id, "52795");
    assert.equal(recipe.source, "https://www.themealdb.com/meal/52795");
});

test("search_recipes reports no matches as a tool error", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        Response.json({ meals: null }),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "search_recipes",
        arguments: { query: "xyzzy" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /No recipes found for xyzzy/);
});

test("maps upstream error bodies into tool errors", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        Response.json({ message: "Too many requests" }, { status: 429 }),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "search_recipes",
        arguments: { query: "chicken" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Too many requests/);
});

test("network failures become tool errors, not crashes", async (t) => {
    t.mock.method(globalThis, "fetch", async () => {
        throw new TypeError("fetch failed");
    });
    const client = await connectClient();
    t.after(() => client.close());
    for (const [name, args] of [
        ["search_recipes", { query: "chicken" }],
        ["recipe_details", { id: "52795" }],
        ["random_recipe", {}],
    ]) {
        const result = await client.callTool({ name, arguments: args });
        assert.equal(result.isError, true);
    }
});

test("rejects invalid arguments before fetching", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected fetch for invalid arguments");
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    for (const [name, args] of [
        ["search_recipes", {}],
        ["search_recipes", { query: "" }],
        ["search_recipes", { query: "chicken", limit: 0 }],
        ["search_recipes", { query: "chicken", limit: 11 }],
        ["search_recipes", { query: "chicken", limit: 1.5 }],
        ["recipe_details", {}],
        ["recipe_details", { id: "" }],
        ["random_recipe", { category: "" }],
    ]) {
        const result = await client.callTool({ name, arguments: args });
        assert.equal(result.isError, true);
    }
    assert.equal(fetchMock.mock.callCount(), 0);
});
