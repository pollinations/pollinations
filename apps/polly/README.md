<p align="center">
  <img src="https://image.pollinations.ai/prompt/A%20cute%20parrot%20mascot%20named%20Polly%20with%20GitHub%20and%20Discord%20logos%2C%20digital%20art%2C%20friendly%2C%20colorful?width=200&height=200&nologo=true" alt="Polly" width="150" height="150">
</p>

<h1 align="center">🦜 Polly</h1>

<p align="center">
  <strong>Bidirectional GitHub ↔ Discord Assistant</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#how-it-works">How It Works</a> •
  <a href="#setup">Setup</a> •
  <a href="#tools">Tools</a> •
  <a href="#architecture">Architecture</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/python-3.10+-blue?style=flat-square&logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/discord.py-2.0+-5865F2?style=flat-square&logo=discord&logoColor=white" alt="Discord.py">
  <img src="https://img.shields.io/badge/GitHub%20API-GraphQL%20%2B%20REST-181717?style=flat-square&logo=github&logoColor=white" alt="GitHub API">
  <img src="https://img.shields.io/badge/AI-Pollinations-green?style=flat-square" alt="Pollinations AI">
</p>

---

## ✨ Features

### 🔄 Bidirectional Communication
| Platform    | Trigger                         | Response          |
| ----------- | ------------------------------- | ----------------- |
| **Discord** | @mention Polly                  | Replies in thread |
| **GitHub**  | @mention in issues/PRs/comments | Replies on GitHub |

### 🎯 Full GitHub Integration

<table>
<tr>
<td width="50%">

**📋 Issues**
- Search, create, comment
- Close, reopen, edit (admin)
- Labels, assignees, milestones
- Sub-issues & linking
- Subscriptions & notifications

</td>
<td width="50%">

**🔀 Pull Requests**
- List, review, approve, merge
- Inline comments & suggestions
- Request reviewers
- AI-powered code review
- Auto-merge support

</td>
</tr>
<tr>
<td>

**📊 Projects V2**
- View project boards
- Add/remove items
- Update status & fields
- Track progress

</td>
<td>

**🤖 Code Agent**
- Autonomous coding tasks
- Create branches & PRs
- Edit files directly
- Run tests & fix issues

</td>
</tr>
</table>

### 🔍 Smart Search
- **`code_search`** - Semantic search across codebase (OpenAI embeddings + ChromaDB)
- **`doc_search`** - Semantic search across documentation (OpenAPI schema, etc.)
- **`web_search`** - Real-time web search via Pollinations API

### 🧠 AI-Powered
- Native tool calling (Kimi k2.5 / GLM-5 / Gemini 3 Pro)
- Parallel tool execution
- Context-aware responses
- Multi-language support

---

## 🚀 How It Works

### Discord → GitHub
```
User: @Polly find 502 errors

   [Thread Created: "Issue: 502 errors"]

Polly: Found 3 open issues:
       • #156 - 502 errors on Flux model
       • #142 - Intermittent 502 on image gen
       • #98 - API returning 502 under load

User: review PR #200

Polly: 🔍 Reviewing PR #200...

       ✅ Overall: LGTM with minor suggestions

       📝 src/api.py:42 - Consider adding error handling
       📝 src/utils.py:15 - This could be simplified
```

### GitHub → Discord
```markdown
<!-- In a GitHub issue comment -->
@pollinations-ci can you explain what this error means?

<!-- Polly replies directly on GitHub -->
This error occurs when... [detailed explanation]
```

---

## 📦 Setup

### Prerequisites
- Python 3.10+
- Discord Bot Token
- GitHub App (recommended) or PAT

### 1️⃣ Clone & Install

```bash
cd apps/polly
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -r requirements.txt
```

### 2️⃣ Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Required
DISCORD_TOKEN=your_discord_bot_token
GITHUB_APP_ID=your_app_id
GITHUB_PRIVATE_KEY=./polly.pem  # file path or inline key
GITHUB_INSTALLATION_ID=your_installation_id

# Optional
OPENAI_EMBEDDINGS_API=your_openai_key  # for code/doc embeddings
POLLINATIONS_TOKEN=your_pollinations_token
```

### 3️⃣ Run

```bash
python main.py
```

### 4️⃣ Optional: Media Handlers (Tables, LaTeX, Code Rendering)

For enhanced Discord message formatting with markdown tables, LaTeX equations, and smart code block rendering:

```bash
# Install optional dependencies
pip install -r requirements-media.txt
```

Enables:
- 📊 **Markdown Tables** → Rendered as PNG images
- ∑ **LaTeX Expressions** → Rendered as PNG images (inline `$...$` and display `$$...$$`)
- 💻 **Code Blocks** → Smart splitting without breaking lines

See [MEDIA_HANDLERS.md](docs/MEDIA_HANDLERS.md) for details.

> Note: Graceful degradation if dependencies not installed — tables/LaTeX will render as text, code still works.

---

## 🛠️ Tools

| Tool              | Description                                               | Access                       |
| ----------------- | --------------------------------------------------------- | ---------------------------- |
| `github_overview` | Quick repo summary (issues, labels, milestones, projects) | Everyone                     |
| `github_issue`    | All issue operations                                      | Read: Everyone, Write: Admin |
| `github_pr`       | All PR operations                                         | Read: Everyone, Write: Admin |
| `github_project`  | Project board operations                                  | Read: Everyone, Write: Admin |
| `github_code`     | Code agent (branches, edits, PRs)                         | Admin only                   |
| `code_search`     | Semantic code search                                      | Everyone                     |
| `doc_search`      | Semantic doc search (OpenAPI schema)                      | Everyone                     |
| `web_search`      | Real-time web search                                      | Everyone                     |
| `discord_search`  | Search Discord messages, members, channels                | Everyone                     |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         ENTRY POINTS                            │
├────────────────────────────┬────────────────────────────────────┤
│     Discord (@mention)     │     GitHub Webhook (port 8002)     │
│     └─ Thread-based        │     └─ Issues, PRs, Comments       │
└────────────────────────────┴────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    POLLINATIONS AI ENGINE                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  Kimi k2.5  │  │    GLM-5    │  │    Gemini 3 Pro         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│                    Native Tool Calling                          │
└─────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
            ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
            │   GitHub    │ │    Code     │ │  Embeddings │
            │    APIs     │ │   Agent     │ │  (OpenAI)   │
            │ GraphQL+REST│ │  Sandbox    │ │  ChromaDB   │
            └─────────────┘ └─────────────┘ └─────────────┘
```

---

## 📁 Project Structure

```
Polly/
├── 📄 main.py                    # Entry point
├── 📄 requirements.txt           # Dependencies
├── 📄 .env.example               # Environment template
├── 📁 src/
│   ├── 📄 bot.py                 # Discord bot + webhook server
│   ├── 📄 config.py              # Configuration
│   ├── 📄 constants.py           # Tools, prompts, schemas
│   ├── 📁 context/               # Session management + repo_info.txt
│   ├── 📁 api/                   # OpenAI-compatible REST API
│   └── 📁 services/
│       ├── 📄 github.py          # GitHub REST API
│       ├── 📄 github_graphql.py  # GitHub GraphQL API
│       ├── 📄 github_pr.py       # PR operations
│       ├── 📄 pollinations.py    # AI client
│       ├── 📄 embeddings.py      # Code embeddings (OpenAI + ChromaDB)
│       ├── 📄 doc_embeddings.py  # Doc embeddings (crawl + embed)
│       ├── 📄 discord_search.py  # Discord guild search
│       ├── 📄 web_scraper.py     # Crawl4AI web scraper
│       └── 📄 webhook_server.py  # GitHub webhooks
└── 📁 .github/workflows/
    └── 📄 deploy.yml             # Auto-deploy on push
```

---

## ⚡ Performance

| Optimization            | Benefit                     |
| ----------------------- | --------------------------- |
| GraphQL batching        | 40-90% fewer API calls      |
| Parallel tool execution | Multiple ops simultaneously |
| Connection pooling      | Reused HTTP connections     |
| Local embeddings        | Instant code search         |
| Stateless design        | No database overhead        |

---

## 🔐 Permissions

| Role         | Capabilities                                     |
| ------------ | ------------------------------------------------ |
| **Everyone** | Search, read issues/PRs, code search, web search |
| **Admin**    | + Close, edit, label, assign, merge, code agent  |

Admin = Users with configured Discord role(s)

---

## 🤝 Contributing

This is a private bot for Pollinations.AI. For issues or suggestions, reach out on Discord!

---

<p align="center">
  Made with 💜 for <a href="https://pollinations.ai">Pollinations.AI</a>
</p>
