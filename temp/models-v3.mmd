%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#fff3e0', 'primaryBorderColor': '#e65100', 'primaryTextColor': '#1a1a1a', 'lineColor': '#666', 'secondaryColor': '#e3f2fd', 'tertiaryColor': '#f3e5f5', 'fontSize': '13px', 'fontFamily': 'Inter, system-ui, sans-serif'}}}%%

graph LR
    subgraph CLIENTS["👥 ~2.2M req/day · 40K+ users"]
        direction TB
        WEB["🌐 Web App"]
        SDK["📦 SDK"]
        BOTS["🤖 Bots"]
        APPS["📱 500+ Apps"]
        MCP_C["🔌 MCP"]
    end

    ENTER["⚡ gen → 🔐 enter\nEdge Router → Gateway\nAuth · Tiers · Billing\n280M req/month"]:::cfWorker

    CLIENTS --> ENTER

    ENTER -->|"~1,340 RPM"| TEXT_SVC
    ENTER -->|"~441 img/min"| IMG_SVC
    ENTER -->|"TTS/music"| AUD

    subgraph TEXT_SVC["📝 Text · EC2 :16385 · systemd"]
        PORTKEY["🔀 Portkey Gateway\nCF Worker · 25+ models\n10+ providers"]
    end

    subgraph IMG_SVC["🎨 Image · EC2 :16384 · systemd"]
        LB["⚖️ Queue Router\nLeast-busy · 2/server\nHeartbeat /register (30s)"]
    end

    subgraph AUD["🔊 Audio APIs"]
        ELEVEN["ElevenLabs v3 TTS"]
        ELEVEN_M["ElevenLabs Music"]
        SUNO_A["Suno v4 Music"]
    end

    subgraph AZURE["☁️ Azure OpenAI"]
        GPT5["GPT-5-mini\nGPT-5.2 · GPT-5-nano\nGrok-4 Fast"]:::textModel
        GPTI["GPT Image 1 Mini\nGPT Image 1.5\nKontext (FLUX.1)"]:::imgModel
    end

    subgraph ANTHRO["🟤 Anthropic"]
        CLAUDE["Haiku 4.5\nSonnet 4.6 · Opus 4.6"]:::textModel
    end

    subgraph GOOGLE["🔵 Google Vertex"]
        GEM["Gemini 3 Flash\nGemini 3.1 Pro\n2.5 Flash Lite"]:::textModel
        NANO["Nanobanana (Gemini 2.5/3/3.1)\nVeo 3.1 Fast"]:::imgModel
    end

    subgraph MORE_TEXT["📡 More Text APIs"]
        NOVA["Bedrock Nova Micro v1"]:::textModel
        FIRE_M["Fireworks\nDeepSeek V3.2 · Kimi K2.5\nGLM-5 · MiniMax M2.5"]:::textModel
        OVH_T["OVHcloud\nQwen3 Coder 30B\nMistral Small 3.2"]:::textModel
        PERP["Perplexity\nSonar · Sonar Reasoning Pro"]:::textModel
        AIR_T["api.airforce"]:::textModel
    end

    subgraph GPU_SELF["🖥️ Self-Hosted GPUs"]
        direction TB
        VAST["🟢 Vast.ai · ~11× RTX 5090\n4 instances · QC/NC/TW/CZ\n─────────────\nFlux Schnell · Docker + screen\nZ-Image · systemd + CUDA 12.8\nSana 0.6B · Scaleway tunnel"]:::gpuNode
        IONET["🔵 io.net · 8 workers\n5 VMs · 2 GPUs each\n─────────────\n4× Flux (Docker containers)\n4× Z-Image (systemd + venv)\nSSH-managed · CUDA 12.4"]:::gpuNode
        MODAL["🟣 Modal · Serverless H200\n─────────────\nKlein (Flux 4B)\nLTX-2 Video"]:::gpuNode
    end

    subgraph MORE_IMG["🎬 More Image/Video APIs"]
        ARK["ByteDance ARK\nSeedream 5.0 Lite\nSeedance Lite/Pro"]:::imgModel
        DASH["Alibaba DashScope\nWan 2.6 (720-1080P)"]:::imgModel
        AIR_I["api.airforce\nImagen 4 · Flux 2 Dev"]:::imgModel
        PRUNA["Pruna AI\np-image · p-video · p-edit"]:::imgModel
    end

    PORTKEY --> AZURE
    PORTKEY --> ANTHRO
    PORTKEY --> GOOGLE
    PORTKEY --> MORE_TEXT

    LB --> GPU_SELF
    LB --> AZURE
    LB --> GOOGLE
    LB --> MORE_IMG

    classDef cfWorker fill:#F48120,color:#fff,stroke:#c66000,stroke-width:2px,font-weight:bold
    classDef textModel fill:#e3f2fd,stroke:#1565c0,color:#0d47a1
    classDef imgModel fill:#fce4ec,stroke:#c62828,color:#b71c1c
    classDef gpuNode fill:#e8f5e9,stroke:#2e7d32,color:#1b5e20,stroke-width:2px
