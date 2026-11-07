# Run 6 (2026-10-15, 02:20–03:20 UTC)

Thomas asked to repeat run 5's DeepSeek quick reviews at a lower reasoning
effort ("Yes, low and medium"). Run 6 reran both of run 5's cases with
DeepSeek v4.1-flash at `--effort low` and `medium`, plus one review of #16911
at `high` as a control.

Dry run: nothing was posted to GitHub. The box was killed after its records
were copied.

## Setup

- Harness ea6f5e6817 adds two options to `quick-review`:
  - `--effort`, passed to `claude --effort`;
  - `--base`, which repeats a review on an earlier commit.
- Same base and diffs as run 5: `d3309b1d8`, with run 5's cached diffs. Since
  run 5, #17057 has merged and #17045 has closed.
- One `pollinations-large` box running Claude Code 2.1.296 from the template.
  - The model is `deepseek/deepseek-v4.1-flash`, through gen's `/v1/messages`.
  - The Claude Code settings use the box's own key. Only DeepSeek ran, so
    there was no Claude key and no Codex.
- Claude Code sends `thinking: adaptive` and `output_config.effort`, and gen
  turns that into `reasoning_effort`. The probes below show the setting
  reaches the provider.
- The provider changed since run 5. #17227 made DeepInfra the primary provider
  for v4.1-flash, with Fireworks as the fallback. Run 5 ran on Fireworks.
  Every run 6 call was served by DeepInfra.
- The run started a day late. Sandbox creation returned 429: at most 3
  sandboxes per user, and 3 were in use. #17428 raised the limit to 8.

## Results

All five reviews hit the hospital's 600 s stage limit, and none gave a verdict.

| Review | Effort | Model calls | Tool calls | Reasoning tokens | Other output | Model time | Pollen |
|---|---|---:|---:|---:|---:|---:|---:|
| [#16911](quick/16911/deepseek-v4.1-flash-low.md) | low | 27 | 43 | 28,448 | 4,103 | 551 s | 0.044 |
| [#16911](quick/16911/deepseek-v4.1-flash-medium.md) | medium | 29 | 45 | 25,995 | 4,320 | 592 s | 0.042 |
| [#16911](quick/16911/deepseek-v4.1-flash-high.md) | high | 27 | 48 | 30,198 | 4,331 | 562 s | 0.044 |
| [#17045 vs #17057](quick/17045/deepseek-v4.1-flash-low.md) | low | 23 | 43 | 27,263 | 4,237 | 561 s | 0.052 |
| [#17045 vs #17057](quick/17045/deepseek-v4.1-flash-medium.md) | medium | 25 | 43 | 22,405 | 3,812 | 534 s | 0.033 |
| Run 5, #16911 (Fireworks) | high | 37 | 69 | 52,981 | 6,358 | 534 s | 0.09 |

- Model calls, tokens, time and price come from gen's records of the box
  key's calls. Tool calls come from the logs.
- No call came near a gateway timeout. Across the 132 calls:
  - half took 18 s or less, 90% took 46 s or less, and the slowest took 85 s;
  - Claude Code streams, so Cloudflare's 125 s wait for response headers
    doesn't apply;
  - one request got DeepInfra's "429 Model busy", and gen's fallback served
    it from Fireworks in 4 s. The caller saw no error.
- The stop came from the harness's 600 s limit per review, spread over 23–29
  ordinary calls. Tools ran for only 7–23 s per review. The rest was model
  time.
- The partial notes list steps only. The reviews wrote no interim
  conclusions.
- In their last few steps, all three #16911 reviews were checking how
  `refusal` deltas are handled. That is the gap gpt-6.1-sol found in run 5.
  None of them got as far as saying anything about it.

### Effort made no difference inside the agent loop

| Per model call, #16911 | Reasoning tokens | Seconds | Output tokens/s |
|---|---:|---:|---:|
| Run 6, low | 1,054 | 20.4 | 59 |
| Run 6, medium | 896 | 20.4 | 51 |
| Run 6, high | 1,118 | 20.8 | 61 |
| Run 5, high (Fireworks) | 1,432 | 14.4 | 111 |

- At every effort level, each step used about 900–1,200 reasoning tokens.
- The setting does reach the provider. The same setting on one large
  code-review prompt to `deepseek/deepseek-v4.1-flash`:

  | Endpoint | Low | Medium | High |
  |---|---|---|---|
  | `/v1/chat/completions`, reasoning tokens | 1,609 (23.5 s) | 4,174 (62.7 s) | 6,811 (70 s) |
  | `/v1/messages`, adaptive thinking: output tokens | 4,208 (37.1 s) | not run | 7,696 (54.9 s) |

  An agent step ("read this file", "run this test") needs little thought at
  any level, so lowering the effort leaves little to cut.
- Per review, reasoning roughly halved against run 5: 22–30k tokens instead of
  53–55k. Most of that is because each review got through fewer calls before
  the limit. The high control shows the same drop, so it isn't the effort
  setting.

### Speed decided the outcome

- DeepInfra produced 49–61 output tokens/s on these calls. Fireworks produced
  about 111 in run 5.
- Each step took 20–24 s instead of 14 s. So in 600 s, a review got through
  23–29 model calls. In run 5 it got through 37.
- Run 5's DeepSeek review of #17045 needed 29 calls to reach a verdict. At run
  6's speed, that is about 640 s.

### DeepSeek took more steps than asked

- The prompt asks for about 15 tool calls. DeepSeek made 43–48, in 22–29 model
  calls: 1.6–2.0 tools per call. In run 5, gpt-6.1-sol made 29–34 tool calls
  in 9 model calls: 3.2–3.8 per call.
- Some steps were wasted:
  - Three of the five reviews first ran vitest from the repo root, where
    `cloudflare:test` and `@shared/…` imports don't resolve.
  - Two passed `--help` to `hospital.py run-test` as if it were a command.
- Correction to run 5's report: it said DeepSeek ran one shell command per
  call. It ran 1.7–1.9 tool calls per model call.

## Cost

| Item | Pollen |
|---|---:|
| Quick reviews (5) | 0.21 |
| Smoke test | 0.0004 |
| Effort probes | ~0.02 |
| Box time (4 vCPU / 8 GB, about 1 hour) | ~0.1 |
| **Total** | **~0.35** |

The box key started with a 1.5 Pollen budget and had about 1.28 left, which
matches the model spend.

## Lessons

- With Claude Code's agent loop, DeepSeek v4.1-flash on DeepInfra can't finish
  these quick reviews within 600 s. Five out of five ran out of time.
- Lowering the effort doesn't help. The time goes to the number of steps and
  the provider's speed, not to thinking per step.
- In run 5, gpt-6.1-sol did the same reviews in 2.5 minutes for 0.15–0.18
  each, and matched the hospital's verdict both times. These DeepSeek runs
  cost 0.03–0.05 each and produced no verdict.
- Three options, not tested yet:
  - Fireworks: `deepseek/deepseek-v4.1-flash:fireworks` is gen's fallback slug
    for it. Whether a caller can request it directly is not checked.
  - A longer stage limit.
  - A prompt that tells the model where to run vitest and asks it to batch
    commands.
