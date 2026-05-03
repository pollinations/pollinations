# surfaces/cli

Smallest possible CatGPT surface. ~15 LOC. Talks straight to `core/`, no HTTP framework, no SDK.

```bash
# zero install — Node 22.6+ ships --experimental-strip-types
node --experimental-strip-types main.ts "why are boxes magic?"

# with auth
POLLINATIONS_KEY=sk_... node --experimental-strip-types main.ts "..."
```

Output:

```
Q: why are boxes magic?
A: They contain me. Obviously.
comic: https://gen.pollinations.ai/image/...
```

Why it lives here, not under `implementations/`: it's a *surface*, not a *framework*. Every implementation produces some adaptation of `core/`; the CLI is the trivial adaptation — useful as proof that `core/` is portable and as a fast smoke-test for the network path.
