import { test } from "../fixtures.ts";

test("Api key fixture should work", async ({ sessionToken }) => {
    console.log("Api key:", sessionToken);
});
