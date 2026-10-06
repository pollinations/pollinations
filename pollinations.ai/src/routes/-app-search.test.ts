import { parseSearchWith, stringifySearchWith } from "@tanstack/react-router";
import { expect, test } from "vitest";
import { validateAppSearch } from "./-app-search";

test("preserves query whitespace through successive search URL updates", () => {
    const parse = parseSearchWith(JSON.parse);
    const stringify = stringifySearchWith(JSON.stringify);
    let q = "";
    for (const character of " hello world ") {
        const next = q + character;
        const search = validateAppSearch(parse(stringify({ q: next })));
        expect(search.q).toBe(next);
        q = search.q ?? "";
    }
});

test("clears an empty query and ignores non-string queries", () => {
    for (const q of [undefined, "", 42, ["hello"]]) {
        expect(validateAppSearch({ q }).q).toBeUndefined();
    }
});
