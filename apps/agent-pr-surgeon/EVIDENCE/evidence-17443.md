## Review of https://github.com/pollinations/pollinations/pull/17443

The JSON seed validation is correct, but multipart image edits still bypass it. Validate multipart seeds in the manual parser so invalid requests cannot reach generation and be billed.

### Findings
- **medium** `shared/schemas/openai.ts:953` — Multipart edits bypass the new seed validation: CreateImageEditRequestSchema is explicitly limited to JSON requests; multipart requests are parsed manually by parseEditInput. Adding seed to this schema therefore does not fix multipart POST /v1/images/edits requests, which can still send out-of-range seeds into the pipeline and receive a billed image using seed 42.

### Fix pushed
Branch `fix-multipart-image-seed-validation` on `rekty/pollinations` at `e47c009e3c7dca61f37ce7fe2c584bb841c5575c`.

```
e47c009 Validate multipart image edit seeds before generation
 gen.pollinations.ai/src/routes/images.ts | 16 ++++++++++++++++
 1 file changed, 16 insertions(+)
```

```diff
diff --git a/gen.pollinations.ai/src/routes/images.ts b/gen.pollinations.ai/src/routes/images.ts
--- a/gen.pollinations.ai/src/routes/images.ts
+++ b/gen.pollinations.ai/src/routes/images.ts
@@ -136,9 +136,25 @@
             formData = c.get("formData") || (await c.req.formData());
         } catch {
             throw new UpstreamError(400, {
                 message: "Invalid multipart form data",
             });
         }
+        const seedValue = formData.get("seed");
+        if (seedValue !== null) {
+            const seed = typeof seedValue === "string" ? Number(seedValue) : NaN;
+            if (
+                typeof seedValue !== "string" ||
+                seedValue.trim() === "" ||
+                !Number.isInteger(seed) ||
+                seed < -1 ||
+                seed > 2147483647
+            ) {
+                throw new UpstreamError(400, {
+                    message: "seed must be an integer between -1 and 2147483647",
+                });
+            }
+            formData.set("seed", String(seed));
+        }
         const prompt = formData.get("prompt") as string;
         if (!prompt)
             throw new UpstreamError(400, {
```

_model openai/gpt-6.1-sol_
