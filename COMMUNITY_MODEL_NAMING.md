# Community Model Naming

Community models are published under an `owner/model` id and called through Pollinations. This guide helps you choose a stable model id and clear public name for your model. It does **not** impose the stricter naming scheme used for first-party models; you are free to pick a name that fits your project.

Three fields in the [Add model](https://enter.pollinations.ai/my-models) form work together:

| Field | Role | Guidance |
|---|---|---|
| **Model id** (`owner/model`) | The stable, machine-readable identifier used in API calls. | Make it short, lowercase, hyphenated, and **fixed**. Avoid any value that is likely to change. |
| **Title** | The short display name shown in the Models list. | Human-readable and memorable. Custom names are welcome. |
| **Description** | One line that tells users what the model is or what it routes to. | Use it to be transparent about what the model really is. |

## A stable id stays stable

The id is part of the public API. Once people call `owner/my-model`, that id is effectively a contract. Prefer ids that describe the **model**, not the circumstances around it. A stable id avoids mutable details:

- **Pricing** — prices change; a model named `my-model-free` or `my-model-cheap` goes stale.
- **Provider routing** — if you switch upstream providers, a name like `my-model-openai` misleads users after the switch.
- **Context size** — models are upgraded; `my-model-128k` becomes wrong when the limit grows.

If a meaningful characteristic changes, prefer publishing a **new id** over silently reusing an old one with different behavior.

## Four common cases

**Direct upstream model.** You proxy an existing model with your own id. Match the upstream so the mapping is obvious.

- id: `owner/flux-dev`, title: `Flux Dev`, description: `Direct proxy of BFL flux-dev.`

**Custom model.** You host a fine-tune or a model built with your own tooling. The id is your name for it.

- id: `owner/synth-chat`, title: `Synth Chat`, description: `My coding fine-tune of Qwen2.5-Coder.`

**Router.** Your endpoint dispatches to different upstreams (by capability, content, or the request itself). Say so up front.

- id: `owner/omnigate`, title: `OmniGate`, description: `Router: text generation across a pool of upstream models.`

**Rebranded model.** You serve a known model under your own brand. Be transparent about what it actually is.

- id: `owner/aurora`, title: `Aurora`, description: `Rebranded hosting of mistral-small-3.`

## Summary

- Pick a short, lowercase, hyphenated `owner/model` id that names the model, not its price, provider, or context size.
- Give it a clear display title.
- Use the description to say what the model is or what it routes to, especially when the id is a custom name.
- When behavior changes materially, publish a new id instead of reusing one.
