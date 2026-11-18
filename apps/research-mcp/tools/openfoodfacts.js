import { z } from "zod";

const API_ROOT = "https://world.openfoodfacts.org/api/v2/product";
const FIELDS =
    "product_name,brands,nutriscore_grade,nova_group,ecoscore_grade,ingredients_text";
const INGREDIENTS_LIMIT = 500;

function cleanString(val) {
    if (!val) return "";
    return String(val).replace(/\s+/g, " ").trim();
}

function formatProduct(code, product) {
    const ingredients = cleanString(product.ingredients_text);
    return {
        barcode: code,
        product_name: cleanString(product.product_name) || null,
        brands: cleanString(product.brands) || null,
        nutriscore_grade: product.nutriscore_grade || null,
        nova_group: product.nova_group ?? null,
        ecoscore_grade: product.ecoscore_grade || null,
        ingredients: ingredients
            ? ingredients.slice(0, INGREDIENTS_LIMIT)
            : null,
        url: `https://world.openfoodfacts.org/product/${code}`,
    };
}

export const openFoodFactsTools = [
    [
        "openfoodfacts_product",
        "Look up a food product on Open Food Facts by barcode (EAN/UPC) and return its name, brands, Nutri-Score, NOVA group, Eco-Score and ingredients. Barcode lookup only — Open Food Facts has no working name search for this tool.",
        {
            barcode: z
                .string()
                .min(1)
                .max(20)
                .describe(
                    "Product barcode, digits only (e.g. '3017620422003' for Nutella)",
                ),
        },
        async ({ barcode }, fetchJson) => {
            const normalized = barcode.trim().replace(/[\s-]/g, "");
            if (!/^\d{8,14}$/.test(normalized))
                throw new Error(
                    "Barcode must be 8-14 digits (EAN-8, UPC-A, EAN-13).",
                );
            const url = `${API_ROOT}/${encodeURIComponent(normalized)}.json?fields=${FIELDS}`;
            const data = await fetchJson(url);
            if (data?.status !== 1 || !data.product)
                throw new Error(
                    `Open Food Facts: product ${normalized} not found.`,
                );
            return {
                product: formatProduct(data.code ?? normalized, data.product),
            };
        },
    ],
];
