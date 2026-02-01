# GSoC 2026 Projects

---
id: 0xprj01
title: Gaming SDKs (Roblox/Godot/Unity)
category: Game Dev
difficulty: Intermediate
duration: 175
mentor: 0xmnt01
technologies: Lua, C#, GDScript, Rest API, Reinforcement Learning, Fine-tuning
---

Create **plug-and-play SDKs** to bring generative AI into popular game engines.

This project involves building and documenting easy-to-use SDKs or "starter kits" for **Roblox**, **Godot**, or **Unity**. The goal is to allow a *vibe coder* (a teenager with no credit card) to add generative AI NPCs, textures, or dialogue to their game in **one line of code**.

**Extensions:** AI NPC behavior using **reinforcement learning** and **fine-tuning** for characters that learn from player interactions, adapt dialogue style, and maintain consistent personalities. This approach has extensive ML community recipes, cloud provider fine-tuning APIs, and benchmark comparisons for performance evaluation.

---
id: 0xprj06
title: CLI Tool
category: Developer Tools
difficulty: Intermediate
duration: 175
mentor: 0xmnt02
technologies: Node.js, TypeScript, Commander.js, pollinations.ai REST API
---

A **command-line interface** for interacting with pollinations.ai APIs.

Full platform management from terminal:
- `polli auth` — login/sessions
- `polli keys` — create/revoke API keys
- `polli apps` — register, set tier, domains
- `polli deploy` — deploy to hosting
- `polli usage` — balance, stats
- `polli generate` — quick image/text/audio
- `polli pollen` — quick checkin on the pollen token count
- `polli deploy status` — check deployment status of any app deployed through pollinations



**Extensions:** `--ui` browser mode, GitHub Action integration.

---
id: 0xprj04
title: Autonomous Platform Health Agent
category: DevOps/Security
difficulty: Advanced
duration: 350
mentor: 0xmnt02
technologies: TypeScript, Docker, GitHub Actions, Claude/GPT Agents
---

**24/7 multi-agent system** monitoring infrastructure, self-maintaining tests, auto-creating issues.

Create a multi-agent system that monitors pollinations.ai infrastructure around the clock. Tests **API reliability**, **security**, **rate limiting**, and **model quality**. Self-maintains test suites and auto-creates GitHub issues/PRs for findings.

**Extensions:** Chaos engineering (intentionally breaking things to test resilience) and a living health dashboard with historical trends.

---
id: 0xprj02
title: Universal Multimodal Semantic Cache
category: Infrastructure
difficulty: Advanced
duration: 350
mentor: 0xmnt01
technologies: CLIP, Cloudflare Vectorize, FAISS, TypeScript
---

**CLIP embeddings** for images, **text embeddings** for prompts, **audio embeddings** for speech — cache hits *before* generation to save compute across all modalities.

Build a semantic caching layer for multimodal AI interactions that uses embeddings to enable cache hits before generation, significantly reducing compute costs. The system will support **configurable similarity thresholds** per model and modality.

**Extensions:** Cache analytics dashboards and per-user/per-app isolation.

---
id: 0xprj07
title: Semantic Steganography for AI Generated Synthetic Media
category: AI/ML
difficulty: Advanced
duration: 350
mentor: 0xmnt01
technologies: Python, TensorFlow/PyTorch, Steganography Techniques
---

**Embedding metadata** in AI-generated media for provenance and authenticity.

Develop techniques to embed semantic metadata (creator info, generation parameters) into AI-generated images, audio, or video files *without affecting perceptual quality*. This helps track the **origin and authenticity** of synthetic media, addressing concerns around deepfakes and misinformation.

---
id: 0xprj05
title: Generative Assistant
category: AI/ML
difficulty: Advanced
duration: 350
mentor: 0xmnt01
technologies: TypeScript, Streaming SSE, Semantic Routing, Markdown
---

**Multi-modal orchestrator** routing to all pollinations.ai models with streaming support.

Build a single chat endpoint that routes to all pollinations.ai models. Supports true **multi-modal responses** combining text, images, and audio in one response. Features *auto model selection* based on intent and streaming with interleaved content.

**Extensions:** Real-time streaming canvas via WebSocket and voice-first mode with duplex audio.

