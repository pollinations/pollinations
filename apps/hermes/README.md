# Pollinations x Hermes

Setup page for connecting [Nous Research Hermes Agent](https://hermes-agent.nousresearch.com/docs/) to Pollinations' OpenAI-compatible API.

The page documents the verified interactive flow:

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
hermes model
```

In the wizard, use `https://gen.pollinations.ai/v1`, choose **Chat Completions**, select a live text model such as `kimi`, and name the provider `Pollinations`. Hermes stores the provider in `~/.hermes/config.yaml` and the secret in `~/.hermes/.env`.

The model count is fetched from the live `/v1/models` endpoint in the browser. Pricing, paid status, and community ownership should always be read from that catalog because they can change independently of this page.