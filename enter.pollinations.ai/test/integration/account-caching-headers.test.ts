import { SELF } from "cloudflare:test";
import { describe, expect } from "vitest";
import { test } from "../fixtures.ts";

describe("Account routes send no-store cache headers", () => {
  test("top-level route (GET /api/account/profile) is never cached", async ({
    sessionToken,
  }) => {
    const response = await SELF.fetch(
      "http://localhost:3000/api/account/profile",
      {
        headers: {
          Cookie: `better-auth.session_token=${sessionToken}`,
        },
      },
      );

       expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "private, no-store, max-age=0",
      );
    expect(response.headers.get("Pragma")).toBe("no-cache");
  });

         test("nested route (GET /api/account/my-models) is never cached", async ({
           sessionToken,
         }) => {
           const response = await SELF.fetch(
             "http://localhost:3000/api/account/my-models",
             {
               headers: {
                 Cookie: `better-auth.session_token=${sessionToken}`,
               },
             },
             );

              expect(response.status).toBe(200);
           expect(response.headers.get("Cache-Control")).toBe(
             "private, no-store, max-age=0",
             );
           expect(response.headers.get("Pragma")).toBe("no-cache");
         });
});
