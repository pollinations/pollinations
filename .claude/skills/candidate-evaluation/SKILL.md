---
name: candidate-evaluation
description: Evaluate GitHub contributors for MLOps/engineering roles. Use when analyzing candidates, researching GitHub profiles, or updating CONTRIBUTORS.md with hiring assessments.
allowed-tools: "Read, Write, Edit, Grep, Bash(gh api:*), Bash(git:*)"
---

# Candidate Evaluation Skill

Evaluate GitHub contributors for engineering roles at Pollinations.

## When to Use

- User asks to evaluate a contributor or candidate
- User wants to research GitHub profiles for hiring
- User needs to update CONTRIBUTORS.md with candidate analysis
- User mentions "hiring", "candidate", "MLOps", or "evaluate contributor"

## Evaluation Criteria

### Must-Have Skills (Weight: High)
- **Python**: Primary language proficiency
- **DevOps**: Docker, CI/CD, infrastructure
- **GPU/ML Deployment**: Model serving, inference optimization

### Nice-to-Have Skills (Weight: Medium)
- Kubernetes, vLLM, TGI
- Quantization (GGUF, ONNX)
- CI/CD pipelines (GitHub Actions)

### Work Style Indicators (Weight: Medium)
- PR size preference (small, focused = good)
- Response time to reviews
- Documentation quality
- Test coverage habits

## Evaluation Process

1. **Gather Data** via GitHub MCP or `gh api`:
   ```bash
   # Get user repos
   gh api users/{username}/repos --jq '.[].name'
   
   # Search PRs in pollinations
   gh api search/issues -X GET -f q='repo:pollinations/pollinations author:{username}'
   
   # Search code for MLOps keywords
   gh api search/code -X GET -f q='user:{username} docker OR kubernetes OR gpu OR vllm'
   ```

2. **Analyze Repositories** for:
   - ML/AI projects (ComfyUI, HuggingFace, PyTorch)
   - DevOps tooling (Docker, CI/CD, scripts)
   - API/backend experience
   - Star counts and activity

3. **Check Pollinations Contributions**:
   - Merged PRs (high signal)
   - Open issues/discussions
   - Project submissions

4. **Generate Profile** with:
   - Fit score (1-10)
   - Strengths (bullet points)
   - Weaknesses (bullet points)
   - Key repositories table
   - Hiring recommendation

## Output Format

Use ASCII box art for visual appeal:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FIT: X.X/10  │  GitHub: username  │  Repos: N  │  Focus: Area             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**✅ STRENGTHS**
- Point 1
- Point 2

**❌ WEAKNESSES**
- Point 1
- Point 2

**📦 KEY REPOS**
| Repo | Tech | What It Does |
|------|------|--------------|

**🎯 VERDICT**: Recommendation

## Skills Matrix Format

```
╔═══════════════════╦════════╦════════╦════════╦═══════════════╗
║     CANDIDATE     ║ Python ║ GPU/ML ║ Docker ║   FIT SCORE   ║
╠═══════════════════╬════════╬════════╬════════╬═══════════════╣
║ username          ║ █████  ║ ███    ║ ████   ║     X.X/10    ║
╚═══════════════════╩════════╩════════╩════════╩═══════════════╝

Legend: █ = Skill Level (1-5)
```

## Reference Files

- `AGENTS.md` - Project guidelines and contributor attribution

## Example Queries

- "Evaluate @username for MLOps role"
- "Research GitHub profile for {username}"
- "Add {username} to CONTRIBUTORS.md"
- "Compare candidates X and Y"
