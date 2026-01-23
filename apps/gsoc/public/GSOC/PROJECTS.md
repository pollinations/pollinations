# GSoC 2026 Project Ideas

---
id: 0xprj01
title: Pollinations Gaming SDKs (Roblox/Godot/Unity)
category: Game Dev
difficulty: Intermediate
duration: 175
mentor: 0xmnt01
technologies: Lua, C#, GDScript, Rest API
---

Create plug-and-play SDKs to bring generative AI into popular game engines.

The 'Roblox for AI' vision needs concrete tools. This project involves building and documenting easy-to-use SDKs or 'starter kits' for Roblox, Godot, or Unity. The goal is to allow a 'vibe coder' (a teenager with no credit card) to add generative AI NPCs, textures, or dialogue to their game in one line of code.

---
id: 0xprj06
title: Pollinations CLI Tool
category: Developer Tools
difficulty: Intermediate
duration: 175
mentor: 0xmnt02
technologies: Node.js, TypeScript, Commander.js, Pollinations REST API
---

A command-line interface for interacting with Pollinations APIs.

Full platform management from terminal: polli auth (login/sessions), polli keys (create/revoke API keys), polli apps (register, set tier, domains), polli deploy (deploy to hosting), polli usage (balance, stats), polli test (API tests), polli ai (conversational assistant), polli skills (install/manage tools), polli generate (quick image/text/audio). Extensions: --ui browser mode, GitHub Action for pollinations ai.

---
id: 0xprj04
title: Autonomous Platform Health Agent
category: DevOps/Security
difficulty: Advanced
duration: 350
mentor: 0xmnt02
technologies: TypeScript, Docker, GitHub Actions, Claude/GPT Agents
---

24/7 multi-agent system monitoring infrastructure, self-maintaining tests, auto-creating issues.

Create a 24/7 multi-agent system that monitors Pollinations infrastructure. Tests API reliability, security, rate limiting, and model quality. Self-maintains test suites and auto-creates GitHub issues/PRs for findings. Extensions include chaos engineering (intentionally breaking things to test resilience) and a living health dashboard with historical trends.

---
id: 0xprj02
title: Universal Semantic Cache
category: Infrastructure
difficulty: Advanced
duration: 350
mentor: 0xmnt01
technologies: CLIP, Cloudflare Vectorize, FAISS, TypeScript
---

CLIP embeddings for images, text embeddings for prompts, cache hits before generation to save compute.

Build a semantic caching layer that uses CLIP embeddings for images and text embeddings for prompts to enable cache hits before generation, significantly reducing compute costs. The system will support configurable similarity thresholds per model, with extensions for cache analytics dashboards and per-user/per-app isolation.

---
id: 0xprj07
title: Semantic Steganography for AI Generated Synthetic Media
category: AI/ML
difficulty: Advanced
duration: 350
mentor: 0xmnt01
technologies: Python, TensorFlow/PyTorch, Steganography Techniques
---

Embedding metadata in AI-generated media for provenance and authenticity.

Develop techniques to embed semantic metadata (like creator info, generation parameters) into AI-generated images, audio, or video files without affecting perceptual quality. This helps in tracking the origin and authenticity of synthetic media, addressing concerns around deepfakes and misinformation.

---
id: 0xprj05
title: Pollinations Assistant
category: AI/ML
difficulty: Advanced
duration: 350
mentor: 0xmnt01
technologies: TypeScript, Streaming SSE, Semantic Routing, Markdown
---

Multi-modal orchestrator routing to all Pollinations models with streaming support.

Build a single chat endpoint that routes to all Pollinations models. Supports true multi-modal responses combining text, images, and audio in one response. Features auto model selection based on intent and streaming with interleaved content. Markdown responses with embedded media. Extensions include real-time streaming canvas via WebSocket and voice-first mode with duplex audio.

---
id: 0xprj03
title: Pluggable Memory Layer
category: AI/ML
difficulty: Advanced
duration: 350
mentor: 0xmnt01
technologies: TypeScript, Cloudflare KV, GitHub API, SQLite, MCP
---

Memory-as-tools with remember(), recall(), forget() and pluggable backends.

Build a memory-as-a-service system exposing remember(), recall(), and forget() as tools. Supports pluggable backends including Cloudflare KV (hosted), GitHub repos, local SQLite, or custom adapters (MCP supported). Features auto-extraction of memories from conversations. Extensions include 'Connect your GitHub' for coding context and cross-app sharing with OAuth-like scopes.
