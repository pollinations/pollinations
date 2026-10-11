# Polli quick tasks

## Connect OpenCode

Install [OpenCode](https://opencode.ai/docs/) if it is not installed yet. Then run:

```bash
npx @pollinations/cli@latest harness opencode on
npx @pollinations/cli@latest harness opencode status
opencode run --model pollinations/enter/openai/gpt-5.4-nano "Reply with POLLI_OK"
```

`on` opens Pollinations device login if needed and creates a dedicated key for OpenCode. The final command should print `POLLI_OK`; that reply is the first verified result through the OpenCode connection. If the reply does not appear, check the `status` output and your [Pollen balance](https://enter.pollinations.ai/pollen). See the [full harness guide](https://gen.pollinations.ai/docs/llm.txt?section=coding-harnesses) for configuration details and removal.

## Generate an image from the terminal

```bash
npx @pollinations/cli@latest auth login
output="polli-first-$(date +%s).png"
npx @pollinations/cli@latest gen image "a red fox in a meadow" --output "$output" && test -s "$output" && echo "Image saved: $output"
```

The last line confirms that a new image file exists and is nonempty on macOS or Linux. Open the saved file to check the result. On Windows, run the generation command with `--output polli-first.png` and inspect the saved file in Explorer. If generation returns 402, check your [balance](https://enter.pollinations.ai/pollen), [Quests](https://enter.pollinations.ai/quests), or [top-up](https://enter.pollinations.ai/pollen#buy-pollen).
