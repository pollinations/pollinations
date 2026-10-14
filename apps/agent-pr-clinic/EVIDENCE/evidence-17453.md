# Run #17453 — FIX + pushed branch

- PR: https://github.com/pollinations/pollinations/pull/17453 — author NamanSoni78, open.
- Pinned head: `37399d640e231be3ad3833bacaa59f3ecd2b6e39` (branch `solution9-client-ip-edge-egress-gate`), base `e3d14460bdabf0b3a9c44661f20d2ba9600ef3fb`.
- Model: `openai/gpt-6.1-sol`, served `gpt-6.1-sol`. Verdict: **FIX**.
- Usage: prompt 1610, completion 1051.
  Cost: see costs.md. No retries.
- Review text (verbatim): see `review-17453.md`.

## Finding (model)

PR #17453 closes the X-Forwarded-Host spoof that lets a direct-hit caller pick an
arbitrary `X-Original-Client-IP`. Its `shared/client-ip.ts` gates on
`cf-connecting-ip` starting with the string prefixes `"64.252."` / `"130.176."`
(a /16 each), while the same file documents the trusted spaces as
`64.252.64.0/18` and `130.176.0.0/17`. A caller whose real address sits in the
untested remainder of the /16s (e.g. `64.252.128.1` or `130.176.128.1`) would
still be treated as edge egress and could keep spoofing X-Original-Client-IP.

## Human verification (independent of the model verdict)

1. `shared/client-ip.ts` at PR head:
   `const TRUSTED_EDGE_EGRESS_PREFIXES = ["64.252.", "130.176."] as const;` with
   comments documenting `/18` and `/17` — the mismatch is real.
2. Subnet arithmetic: `64.252.64.0/18` = 64.252.64.0-127.255; `130.176.0.0/17` =
   130.176.0.0-127.255. `64.252.128.1` is outside the documented /18 and
   `130.176.128.1` outside the /17; both match the /16 string prefixes.
3. `getRealClientIp` genuinely prefers `x-original-client-ip` when
   `cameThroughEdgeEgress` returns true (read at head), so the widened trust is
   exploitable.
4. Suggested patch (see `patch-17453.diff`, model-generated) reviewed and
   refined: exact-subnet match + IPv4 shape validation + regression tests.

## Result: FIX — pushed

Branch **`agent-pr-clinic/fix-17453`** in `mhmdrizzzki/pollinations`
(head `983ca0cdf342c86d8ff65dbb46434dfab5dd8a80`) — base is PR head
`37399d640e231be3ad3833bacaa59f3ecd2b6e39` plus the proposed fix commits (`shared/client-ip.ts`,
`gen.pollinations.ai/test/proxy-client-ip.test.ts`). The branch exists so a
maintainer can fetch the diff in one move; it is intentionally not pointed at
pollinations/pollinations.
