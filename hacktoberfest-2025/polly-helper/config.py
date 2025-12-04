"""Configuration for Polly Helper Bot."""

import os
from dotenv import load_dotenv

load_dotenv()

# Discord Configuration
DISCORD_TOKEN = os.getenv("DISCORD_TOKEN")

# GitHub Configuration
# Use POLLY_GITHUB_TOKEN to avoid conflict with Codespace's built-in GITHUB_TOKEN
GITHUB_TOKEN = os.getenv("POLLY_GITHUB_TOKEN")
GITHUB_REPO = os.getenv("GITHUB_REPO")

# Pollinations API Configuration
POLLINATIONS_API_KEY = os.getenv("POLLINATIONS_API_KEY", "")
POLLINATIONS_API_BASE = "https://enter.pollinations.ai"

# System prompt for enhancing issue descriptions
ISSUE_ENHANCE_PROMPT = """You are an issue parser for Pollinations.AI GitHub issues.

Given a user's issue description from Discord, create a well-formatted GitHub issue.

Return JSON with exactly these fields:
{
  "title": "Brief, descriptive title (max 80 chars)",
  "description": "Detailed description in markdown format"
}

The description should include:
- Clear summary of the issue
- Steps to reproduce (if applicable)
- Expected vs actual behavior (if applicable)
- Any relevant technical details mentioned

Keep it professional and concise. Do NOT add information that wasn't mentioned.
Return ONLY valid JSON, no other text."""
