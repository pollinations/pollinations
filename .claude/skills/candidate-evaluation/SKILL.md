---
name: candidate-evaluation
description: Assess GitHub contributors for engineering hiring, compare candidates, or record hiring assessments in CONTRIBUTORS.md.
allowed-tools: "Read, Write, Edit, Grep, Bash(gh api:*), Bash(git:*)"
---

# Candidate Evaluation

Assess engineering candidates for Pollinations using evidence from their repositories and contributions. Ordinary GitHub profile lookups and code reviews do not need this skill.

## Hiring criteria

Use the requested role's requirements. For MLOps roles, the default priorities are:

- **High:** Python proficiency, Docker/CI/CD/infrastructure, GPU model serving and inference optimization.
- **Medium:** Kubernetes, vLLM/TGI, quantization (GGUF/ONNX), and GitHub Actions experience.
- **Work practices:** focused PRs, review interactions, documentation quality, and meaningful tests.

## Evidence and assessment

Inspect relevant repositories and Pollinations contributions through GitHub tools or `gh api`. Prefer concrete code and merged PRs; use open PRs, issues, discussions, and app submissions for additional context. Repository popularity and activity are context, not substitutes for demonstrated ability.

Return a concise hiring recommendation with linked evidence, strengths, gaps, and uncertainty. A repository table or comparison matrix is useful when comparing candidates; use a fit score only when requested and explain its basis. Missing public evidence is an unknown, not proof that a candidate lacks a skill.

Check that the recommendation follows the role criteria and cited evidence before delivering. Update `CONTRIBUTORS.md` when requested, following its existing structure and the contributor-attribution rules in `AGENTS.md`.
