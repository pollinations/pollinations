import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

const MEALDB = "https://www.themealdb.com/api/json/v1/1";

// TheMealDB needs no key, so the caller's Pollinations key is never forwarded.
async function fetchJson(url) {
    const response = await fetch(url, {
        headers: { accept: "application/json" },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
        const reason =
            body?.message ||
            `TheMealDB request failed with status ${response.status}`;
        throw new Error(reason);
    }
    return body;
}

function toSummary(meal) {
    return {
        id: meal.idMeal,
        name: meal.strMeal,
        category: meal.strCategory,
        area: meal.strArea,
        thumbnail: meal.strMealThumb,
        youtube: meal.strYoutube || null,
        tags: meal.strTags || null,
    };
}

function toDetails(meal) {
    const ingredients = [];
    for (let i = 1; i <= 20; i++) {
        const name = meal[`strIngredient${i}`];
        if (name?.trim()) {
            ingredients.push({
                name,
                measure: meal[`strMeasure${i}`] || null,
            });
        }
    }
    return {
        id: meal.idMeal,
        name: meal.strMeal,
        category: meal.strCategory,
        area: meal.strArea,
        instructions: meal.strInstructions,
        tags: meal.strTags || null,
        thumbnail: meal.strMealThumb,
        youtube: meal.strYoutube || null,
        source: `https://www.themealdb.com/meal/${meal.idMeal}`,
        ingredients,
    };
}

async function fetchRecipeDetails(id) {
    const url = new URL(`${MEALDB}/lookup.php`);
    url.searchParams.set("i", id);
    const body = await fetchJson(url);
    const meal = body.meals?.[0];
    if (!meal) {
        throw new Error(`Recipe ${id} not found`);
    }
    return toDetails(meal);
}

function buildServer() {
    const server = new McpServer(
        { name: "recipe-mcp", title: "Recipe MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );
    server.registerTool(
        "search_recipes",
        {
            description:
                "Search TheMealDB recipes by name or ingredient and return " +
                "matching dishes with id, name, category, area, tags, " +
                "thumbnail and a YouTube link. Use recipe_details for the " +
                "full ingredients and instructions.",
            inputSchema: {
                query: z
                    .string()
                    .min(1)
                    .describe("Recipe name or ingredient, e.g. 'chicken'"),
                limit: z
                    .number()
                    .int()
                    .min(1)
                    .max(10)
                    .optional()
                    .describe("Maximum results, 1-10 (default 5)"),
            },
        },
        async ({ query, limit }) => {
            const url = new URL(`${MEALDB}/search.php`);
            url.searchParams.set("s", query);
            const body = await fetchJson(url);
            if (!body.meals) {
                throw new Error(`No recipes found for ${query}`);
            }
            const results = body.meals.slice(0, limit ?? 5).map(toSummary);
            return createMCPResponse([
                createTextContent(
                    { query, count: results.length, results },
                    true,
                ),
            ]);
        },
    );
    server.registerTool(
        "recipe_details",
        {
            description:
                "Full recipe for a TheMealDB meal id: complete instructions " +
                "plus the paired ingredient and measure list. Get ids from " +
                "search_recipes or random_recipe.",
            inputSchema: {
                id: z
                    .string()
                    .min(1)
                    .describe("TheMealDB meal id (idMeal), e.g. '52795'"),
            },
        },
        async ({ id }) => {
            const recipe = await fetchRecipeDetails(id);
            return createMCPResponse([createTextContent(recipe, true)]);
        },
    );
    server.registerTool(
        "random_recipe",
        {
            description:
                "A random TheMealDB recipe with full instructions and " +
                "ingredients, optionally filtered to a category such as " +
                "'Dessert' or 'Seafood'.",
            inputSchema: {
                category: z
                    .string()
                    .min(1)
                    .optional()
                    .describe(
                        "Only pick from this category, e.g. 'Dessert'. Omit for a fully random recipe.",
                    ),
            },
        },
        async ({ category }) => {
            if (category) {
                const url = new URL(`${MEALDB}/filter.php`);
                url.searchParams.set("c", category);
                const body = await fetchJson(url);
                if (!body.meals) {
                    throw new Error("No random recipe available");
                }
                const pick =
                    body.meals[Math.floor(Math.random() * body.meals.length)];
                return createMCPResponse([
                    createTextContent(
                        await fetchRecipeDetails(pick.idMeal),
                        true,
                    ),
                ]);
            }
            const body = await fetchJson(new URL(`${MEALDB}/random.php`));
            if (!body.meals) {
                throw new Error("No random recipe available");
            }
            return createMCPResponse([
                createTextContent(toDetails(body.meals[0]), true),
            ]);
        },
    );
    return server;
}

const mcpHandler = createMcpHandler(() => buildServer(), {
    legacy: "stateless",
    onerror: (error) => console.error(error),
});

function readBearerToken(request) {
    const authorization = request.headers.get("authorization");
    if (!authorization) return null;

    const [scheme, token] = authorization.trim().split(/\s+/, 2);
    if (scheme?.toLowerCase() !== "bearer" || !token) {
        return null;
    }
    return token;
}

function unauthorizedResponse() {
    return Response.json(
        {
            error: "unauthorized",
            message: "Send a Pollinations API key as a bearer token.",
        },
        {
            status: 401,
            headers: {
                "WWW-Authenticate": 'Bearer realm="recipe-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "recipe-mcp",
                transport: "streamable-http",
                endpoint: "/",
                stateless: true,
            });
        }

        if (url.pathname !== "/") {
            return new Response("Not found", { status: 404 });
        }

        const token = readBearerToken(request);
        if (!token) return unauthorizedResponse();

        if (
            request.method === "POST" &&
            Array.isArray(
                await request
                    .clone()
                    .json()
                    .catch(() => null),
            )
        ) {
            return Response.json(
                {
                    error: "invalid_request",
                    message: "Batch requests are not supported.",
                },
                { status: 400 },
            );
        }

        return mcpHandler.fetch(request, {
            authInfo: {
                token,
                clientId: "pollinations-api-key",
                scopes: [],
            },
        });
    },
};
