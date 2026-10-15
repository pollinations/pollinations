# Live runs (2026-10-13)

The agent's real `review()` ran through `demos/run-live.mjs` against live GitHub and `gen.pollinations.ai`. Costs are the agent's own figures from live catalog prices; the four runs together cost 0.0083 Pollen.

| PR | Model | Tokens in / out | Cost (Pollen) | Verdict | Pushed |
| --- | --- | --- | --- | --- | --- |
| [Drjacky/pollinations#2](https://github.com/Drjacky/pollinations/pull/2) (planted off-by-one) | `openai/gpt-6.1-sol` | 474 / 132 | 0.0023 | problems found | [`bc46d60`](https://github.com/Drjacky/pollinations/commit/bc46d608d13b99d2796485752b8b5c20bb835126) on `pr-fixer/Drjacky-pollinations-2-bc46d60` |
| [#17197](https://github.com/pollinations/pollinations/pull/17197) retry empty news answers | `openai/gpt-6-luna` | 5766 / 1283 | 0.0012 | nothing wrong | no (nothing to fix) |
| [#17240](https://github.com/pollinations/pollinations/pull/17240) legacy image cache misses | `openai/gpt-6-luna` | 1759 / 163 | 0.0003 | nothing wrong | no |
| [#17223](https://github.com/pollinations/pollinations/pull/17223) pin sandbox template versions | `openai/gpt-6-luna` | 2392 / 799 | 0.0006 | nothing wrong | no |

The three upstream PRs are already merged, so "nothing wrong" is the expected answer. They ran on the cheaper `gpt-6-luna` to keep the test budget small. The default is `gpt-6.1-sol`, and it costs about 20× more per input token.

## Planted bug, fixed and pushed

```
## Review of Drjacky/pollinations#2
**Verdict:** problems found
The offset calculation treats page numbers as zero-based, contrary to the documented one-based contract.

**Findings**
- `demo-pr-fixer/paginate.js:4` Using page * size makes page 1 skip the first size items. The offset must be (page - 1) * size so the first page starts at index 0.

**Fix**
Pushed `pr-fixer/Drjacky-pollinations-2-bc46d60` (bc46d60): https://github.com/Drjacky/pollinations/commit/bc46d608d13b99d2796485752b8b5c20bb835126

-    const start = page * size;
+    const start = (page - 1) * size;

Model `openai/gpt-6.1-sol`, 474 in / 132 out tokens, about 0.0023 Pollen.
```

The GitHub API confirms that the commit's only parent is the PR head `8c1b0fd`, so the branch reads as "the PR plus one fix commit".

## Context matters

The first run on #17197 was made before large files were shown as excerpts. Both changed files are over 50 KB, so the model saw only the patch. It flagged the retry seeds (`attempt + 1`) as repeating across runs. With 40 lines of context around each hunk, the rerun read the surrounding retry loop and found nothing wrong. Which answer is right is not proven, but a review from the patch alone is weaker. That is why the agent now sends excerpts of large files instead of dropping them.
