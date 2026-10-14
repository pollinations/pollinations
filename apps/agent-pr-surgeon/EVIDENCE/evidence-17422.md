## Review of https://github.com/pollinations/pollinations/pull/17422

The enclosure parser rejects valid Link headers when rel is unquoted, follows another parameter, or contains multiple relation types. Parse the link parameters so these responses return their stored URL instead of throwing NO_VIDEO_URL.

### Findings
- **medium** `packages/sdk/src/client.ts:765` — Accept valid enclosure Link header forms: The regex requires rel="enclosure" immediately after the URL. Valid headers such as <url>; type="video/mp4"; rel="enclosure", <url>; rel=enclosure, and <url>; rel="alternate enclosure" all produce undefined and cause videoUrl() to throw despite an enclosure being present. The added regression tests only the exact format accepted by this regex.

### Fix pushed
Branch `fix-sdk-enclosure-link-parsing` on `rekty/pollinations` at `c29a8e41d9e768e1532547a0548990fa540e194b`.

```
c29a8e4 Fix enclosure Link parsing for valid parameter forms
 packages/sdk/src/client.test.ts |  2 +-
 packages/sdk/src/client.ts      | 18 +++++++++++++++---
 2 files changed, 16 insertions(+), 4 deletions(-)
```

```diff
diff --git a/packages/sdk/src/client.ts b/packages/sdk/src/client.ts
--- a/packages/sdk/src/client.ts
+++ b/packages/sdk/src/client.ts
@@ -757,12 +757,24 @@
                 }
 
                 const buffer = await response.arrayBuffer();
                 const contentType =
                     response.headers.get("content-type") || "video/mp4";
 
-                const storedUrl = response.headers
-                    .get("link")
-                    ?.match(/<([^>]+)>;\s*rel="enclosure"/)?.[1];
+                const storedUrl = Array.from(
+                    (response.headers.get("link") || "").matchAll(
+                        /<([^>]+)>((?:[^",<>]|"(?:\\.|[^"\\])*")*)/g,
+                    ),
+                ).find((link) =>
+                    Array.from(
+                        link[2].matchAll(
+                            /;\s*([!#$%&'*+.^_`|~0-9A-Za-z-]+)\s*=\s*(?:"((?:\\.|[^"\\])*)"|([^;\s,]+))/g,
+                        ),
+                    ).some(
+                        (param) =>
+                            param[1].toLowerCase() === "rel" &&
+                            (param[2] ?? param[3]).split(/\s+/).includes("enclosure"),
+                    ),
+                )?.[1];
 
                 return { buffer, contentType, url: storedUrl };
             },
diff --git a/packages/sdk/src/client.test.ts b/packages/sdk/src/client.test.ts
--- a/packages/sdk/src/client.test.ts
+++ b/packages/sdk/src/client.test.ts
@@ -661,10 +661,15 @@
         expect(await files[2].text()).toBe("RIFF sample audio");
         expect(await files[3].text()).toBe("WebM sample audio");
     });
 });
 
 describe("Pollinations video reference media", () => {
-    it("videoUrl returns the stored media enclosure URL for sharing", async () => {
+    it.each([
+        'rel="enclosure"',
+        'type="video/mp4"; rel="enclosure"',
+        'rel=enclosure',
+        'rel="alternate enclosure"',
+    ])("videoUrl returns the stored media enclosure URL for sharing (%s)", async (parameters) => {
         const storedUrl = "https://media.pollinations.ai/0123456789abcdef.mp4";
         fetchMock
             .mockResolvedValueOnce(
diff --git a/packages/sdk/src/client.test.ts b/packages/sdk/src/client.test.ts
--- a/packages/sdk/src/client.test.ts
+++ b/packages/sdk/src/client.test.ts
@@ -668,10 +668,10 @@
         const storedUrl = "https://media.pollinations.ai/0123456789abcdef.mp4";
         fetchMock
             .mockResolvedValueOnce(
                 new Response(new Uint8Array([0, 1]), {
                     headers: {
                         "Content-Type": "video/mp4",
-                        Link: `<${storedUrl}>; rel="enclosure"`,
+                        Link: `<https://example.com/other>; title="a, b; rel=enclosure"; rel="alternate", <${storedUrl}>; ${parameters}`,
                     },
                 }),
             )
```

_model openai/gpt-6.1-sol_
