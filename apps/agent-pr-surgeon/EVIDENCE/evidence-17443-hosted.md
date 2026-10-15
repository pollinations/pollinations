## Review of https://github.com/pollinations/pollinations/pull/17443

The new schema validates JSON requests, but multipart image edits still bypass it. Validate the multipart seed before manual parsing so out-of-range seeds cannot still produce billed images using seed 42.

### Findings
- **high** `shared/schemas/openai.ts:953` — Multipart image edits still bypass seed validation: CreateImageEditRequestSchema is explicitly JSON-only; multipart/form-data is parsed manually in parseEditInput. Adding seed to this schema therefore does not reject multipart edits with seed=-5 or seed=3000000000, leaving the reported silent fallback reachable through a documented input format. The added regression test exercises only JSON generations.

### Fix pushed
Branch `fix-multipart-image-seed-validation` on `rekty/pollinations` at `1ff09aa1b2ecb9520aaa69a8fdd530f1867b380e`.

```

```

```diff
diff --git a/gen.pollinations.ai/src/routes/images.ts b/gen.pollinations.ai/src/routes/images.ts
--- a/gen.pollinations.ai/src/routes/images.ts
+++ b/gen.pollinations.ai/src/routes/images.ts
@@ -136,9 +136,21 @@
             formData = c.get("formData") || (await c.req.formData());
         } catch {
             throw new UpstreamError(400, {
                 message: "Invalid multipart form data",
             });
         }
+        const rawSeed = formData.get("seed");
+        if (
+            rawSeed !== null &&
+            (typeof rawSeed !== "string" ||
+                !Number.isInteger(Number(rawSeed)) ||
+                Number(rawSeed) < -1 ||
+                Number(rawSeed) > 2147483647)
+        ) {
+            throw new UpstreamError(400, {
+                message: "Seed must be an integer between -1 and 2147483647",
+            });
+        }
         const prompt = formData.get("prompt") as string;
         if (!prompt)
             throw new UpstreamError(400, {
```

_model openai/gpt-6.1-sol_
