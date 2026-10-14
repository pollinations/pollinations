# Review of #17453 — FIX

VERDICT: FIX
ISSUES:
- `shared/client-ip.ts:11–20`: The string prefixes trust entire `/16` networks, not the documented `64.252.64.0/18` and `130.176.0.0/17`. Consequently, direct callers with addresses such as `64.252.128.1` or `130.176.128.1` can still supply spoofed proxy headers and choose their rate-limit identity. Check the actual subnet boundaries and add regression cases for addresses outside them.
PATCH:
```diff
diff --git a/shared/client-ip.ts b/shared/client-ip.ts
--- a/shared/client-ip.ts
+++ b/shared/client-ip.ts
@@ -11,11 +11,22 @@
-const TRUSTED_EDGE_EGRESS_PREFIXES = ["64.252.", "130.176."] as const;
-
 function cameThroughEdgeEgress(c: Context): boolean {
     const connectingIp = c.req.header("cf-connecting-ip");
+    if (!connectingIp) return false;
+
+    const octets = connectingIp.split(".");
+    if (
+        octets.length !== 4 ||
+        !octets.every(
+            (octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255,
+        )
+    ) {
+        return false;
+    }
+
+    const [first, second, third] = octets.map(Number);
     return (
-        !!connectingIp &&
-        TRUSTED_EDGE_EGRESS_PREFIXES.some((prefix) =>
-            connectingIp.startsWith(prefix),
-        )
+        (first === 64 && second === 252 && third >= 64 && third < 128) ||
+        (first === 130 && second === 176 && third < 128)
     );
 }
diff --git a/gen.pollinations.ai/test/proxy-client-ip.test.ts b/gen.pollinations.ai/test/proxy-client-ip.test.ts
--- a/gen.pollinations.ai/test/proxy-client-ip.test.ts
+++ b/gen.pollinations.ai/test/proxy-client-ip.test.ts
@@ -98,5 +98,14 @@
             "cf-connecting-ip": "2a01:4f8:1c17::1",
         });
         expect(getRealClientIp(ipv6Direct)).toBe("2a01:4f8:1c17::1");
+
+        for (const ip of ["64.252.128.1", "130.176.128.1"]) {
+            const outsideEgress = mockContext("https://gen.myceli.ai/text/hi", {
+                "x-forwarded-host": "gen.pollinations.ai",
+                "x-original-client-ip": "9.9.9.9",
+                "cf-connecting-ip": ip,
+            });
+            expect(getRealClientIp(outsideEgress)).toBe(ip);
+        }
     });
 });
```
