# Pollinations x Hermes

Setup page for connecting [Nous Research Hermes Agent](https://hermes-agent.nousresearch.com/docs/) to Pollinations' OpenAI-compatible API.

The page documents the verified interactive flow:

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
hermes model
```

In the wizard, use `https://gen.pollinations.ai/v1`, choose **Chat Completions**, select a live text model such as `kimi`, and name the provider `Pollinations`. Hermes stores the provider in `~/.hermes/config.yaml` and the secret in `~/.hermes/.env`.

The model count is fetched from the live `/v1/models` endpoint in the browser. Paid models use Pollen according to the live metadata; quest models use earned Pollen; community models may have separate pricing and availability. New users should complete and claim the setup quests at [enter.pollinations.ai/pollen](https://enter.pollinations.ai/pollen) to get initial Pollen. Pricing and status can change independently of this page, so the live catalog is authoritative.