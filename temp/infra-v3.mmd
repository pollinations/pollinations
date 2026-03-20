%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#fff3e0', 'primaryBorderColor': '#e65100', 'primaryTextColor': '#1a1a1a', 'lineColor': '#555', 'secondaryColor': '#e3f2fd', 'tertiaryColor': '#f3e5f5', 'fontSize': '14px', 'fontFamily': 'Inter, system-ui, sans-serif'}}}%%

graph TD
    CDN["🌍 Cloudflare CDN\nDNS · WAF · DDoS\n~280M req/month"]:::cfEdge

    CDN --> GEN

    GEN["⚡ gen.pollinations.ai\nEdge Router"]:::cfWorker

    GEN -->|"service binding\n(zero latency)"| ENTER

    subgraph CF["☁️ Cloudflare Workers"]
        ENTER["🔐 enter.pollinations.ai · API Gateway\n─────────────────\n🔑 OAuth + API Keys (pk_ / sk_)\n🏷️ 6 Tiers: microbe → router\n💰 Pollen balance (tier + packs + crypto)\n⏱️ Rate Limiting (Durable Objects)\n📊 Usage → TinyBird\n🔄 Response dedup"]:::cfWorker
        PORTKEY_W["🔀 portkey.pollinations.ai\nText routing worker"]:::cfWorkerLight
        MEDIA["📁 media.pollinations.ai\nSHA-256 uploads · 10MB"]:::cfWorkerLight
        FRONT["🌐 pollinations.ai\nReact + Vite SPA"]:::cfWorkerLight
    end

    subgraph STORAGE["💾 Cloudflare Storage"]
        D1["🗃️ D1 SQLite\n40K users · auth\nkeys · tiers · balance"]:::cfStorage
        KV_S["⚡ KV Store\nstats · refills · dedup"]:::cfStorage
        R2["📦 R2 · 48 TB\n4 buckets · images\ntext · media · cache"]:::cfStorage
        DO["🔒 Durable Objects\nPollenRateLimiter\n10K req/10s per IP"]:::cfStorage
    end

    ENTER --> D1
    ENTER --> KV_S
    ENTER --> R2
    ENTER --> DO

    subgraph COMPUTE["🖥️ AWS EC2 · us-east-1 · g6e"]
        TEXT["📝 text :16385\nNode.js · Hono · systemd\nOpenAI-compat API"]:::ec2
        IMAGE["🎨 image :16384\nNode.js · Hono · systemd\nQueue router + heartbeat\nSharp · ImageMagick"]:::ec2
    end

    ENTER -->|"text / chat"| TEXT
    ENTER -->|"image / video"| IMAGE
    ENTER -->|"audio"| AUD_API

    TEXT --> PORTKEY_W

    subgraph PROVIDERS["🔌 AI Provider APIs"]
        PROV_TEXT["☁️ Text Providers\nAzure · Anthropic · Vertex\nBedrock · Fireworks · OVH\nPerplexity · airforce"]:::provider
        IMG_API["🖼️ Image/Video\nAzure · Vertex · ByteDance\nAlibaba · Pruna · airforce"]:::provider
        AUD_API["🔊 Audio\nElevenLabs · Suno"]:::provider
    end

    PORTKEY_W --> PROV_TEXT
    IMAGE --> IMG_API

    subgraph GPU["⚡ Self-Hosted GPUs"]
        VAST["🟢 Vast.ai · ~11 RTX 5090\n4 inst · QC/NC/TW/CZ\nFlux · Z-Image · Sana"]:::gpu
        IONET["🔵 io.net · 8 workers\n5 VMs · Flux + Z-Image"]:::gpu
        MODAL["🟣 Modal · H200\nKlein · LTX-2 Video"]:::gpu
    end

    IMAGE -->|"heartbeat /register"| VAST
    IMAGE --> IONET
    IMAGE --> MODAL

    subgraph OBS["📊 TinyBird · ClickHouse"]
        TB_S["📈 Analytics\n10 tables · 18 API pipes\nusage · payments · health\nKPIs · retention · revenue"]:::tinybird
    end

    ENTER -.->|"async NDJSON"| TB_S

    subgraph PAY["💳 Payments"]
        STRIPE["Stripe · packs"]:::payment
        POLAR["Polar · subs"]:::payment
        NOWPAY["NOWPay · crypto"]:::payment
    end

    STRIPE -.->|"webhooks"| ENTER
    POLAR -.->|"webhooks"| ENTER
    NOWPAY -.->|"IPN"| ENTER

    subgraph SOCIAL["📢 Social Automation"]
        BUFFER["Buffer\nX · LinkedIn · IG"]:::social
        REDDIT["Reddit VPS\nSSH deploy"]:::social
        DISCORD_W["Discord\nWebhooks"]:::social
    end

    subgraph CICD["🔧 GitHub Actions · CI/CD"]
        GH["29 workflows\n5 deploys · 7 crons\nPolly bot · app review\nBiome · CodeQL · tests"]:::cicd
        SOPS_S["🔒 SOPS + AGE\n28 secrets"]:::cicd
    end

    GH -.->|"wrangler deploy"| CF
    GH -.->|"SSH + systemd"| COMPUTE
    SOPS_S -.->|"decrypt .env"| COMPUTE

    ENTER -.->|"cron: refills\nabuse · D1 sync"| D1

    classDef cfEdge fill:#F48120,color:#fff,stroke:#c66000,stroke-width:2px,font-weight:bold
    classDef cfWorker fill:#F48120,color:#fff,stroke:#c66000,stroke-width:2px,font-weight:bold
    classDef cfWorkerLight fill:#FFE0B2,color:#1a1a1a,stroke:#F48120,stroke-width:1px
    classDef cfStorage fill:#FFF3E0,color:#1a1a1a,stroke:#E65100,stroke-width:1px
    classDef ec2 fill:#232F3E,color:#fff,stroke:#FF9900,stroke-width:2px
    classDef gpu fill:#e8f5e9,color:#1b5e20,stroke:#2e7d32,stroke-width:2px
    classDef provider fill:#e3f2fd,color:#0d47a1,stroke:#1565c0,stroke-width:1px
    classDef tinybird fill:#E0F7FA,color:#006064,stroke:#00838F,stroke-width:1px
    classDef payment fill:#EDE7F6,color:#311B92,stroke:#4527A0,stroke-width:1px
    classDef social fill:#FFF9C4,color:#333,stroke:#F9A825,stroke-width:1px
    classDef cicd fill:#F5F5F5,color:#333,stroke:#999,stroke-width:1px
