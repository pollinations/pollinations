"""Prompt-complexity classifier for automatic tier-based model routing.

Maps a prompt to a complexity tier (fast / balanced / quality) using
lightweight heuristic scoring.  The classifier is designed to be fast,
deterministic, and have zero external dependencies.

Signals considered:
  - Prompt length (word count, character count)
  - Reasoning keywords (analysis, planning, multi-step logic)
  - Tool-call / multi-step task indicators
  - Code presence (language tags, function definitions)
  - Structure indicators (lists, tables, numbered steps)
  - Question complexity (simple vs. open-ended)

The inferred tier feeds into ``registry.pick_model(modality, tier, ...)``
so callers get automatic complexity-aware routing without any extra work.
"""

from __future__ import annotations

import re
from typing import Literal

Tier = Literal["fast", "balanced", "quality"]

# ---------------------------------------------------------------------------
# Keyword sets
# ---------------------------------------------------------------------------

_REASONING_KEYWORDS: set[str] = {
    "analyze",
    "analysis",
    "analyse",
    "compare",
    "contrast",
    "evaluate",
    "explain",
    "reason",
    "reasoning",
    "think",
    "thinking",
    "step by step",
    "step-by-step",
    "first principles",
    "pros and cons",
    "tradeoff",
    "trade-offs",
    "tradeoffs",
    "implications",
    "consequences",
    "critique",
    "critically",
    "deconstruct",
    "synthesize",
    "synthesis",
    "elaborate",
    "deep dive",
    "in depth",
    "in-depth",
    "thorough",
    "comprehensive",
    "detailed analysis",
    "root cause",
    "why does",
    "how does",
    "what would happen",
    "what are the tradeoffs",
    "what are the implications",
    "design a system",
    "architect",
    "architecture",
    "strategy",
    "strategic",
    "plan for",
    "planning",
    "roadmap",
    "outline a plan",
    "multi-step",
    "multi step",
    "chain of thought",
    "chain-of-thought",
    "cot",
    "let's think",
    "let us think",
    "think carefully",
    "think through",
    "walk me through",
    "break down",
    "breakdown",
    "dissect",
    "examine",
    "investigate",
    "research",
    "survey",
    "literature review",
    "meta-analysis",
    "systematic",
    "methodology",
    "hypothesis",
    "hypotheses",
    "experiment design",
    "controlled experiment",
}

_TOOL_CALL_KEYWORDS: set[str] = {
    "use the tool",
    "call the api",
    "invoke",
    "function call",
    "tool call",
    "use a function",
    "execute",
    "run a script",
    "run code",
    "call endpoint",
    "api call",
    "webhook",
    "pipeline",
    "workflow",
    "orchestrate",
    "chain",
    "agentic",
    "agent",
    "multi-agent",
    "swarm",
    "collaborate",
    "delegate",
    "parallel",
    "concurrent",
}

_CODE_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"```"),  # fenced code blocks
    re.compile(r"\b(def |class |function |import |from |const |let |var |async |await )\b"),
    re.compile(r"\b(python|javascript|typescript|rust|go|java|c\+\+|ruby|swift|kotlin|sql|html|css|bash|shell| powershell)\b", re.IGNORECASE),
    re.compile(r"\bfor\s*\(|while\s*\(|if\s*\(|switch\s*\(|return\s+"),
    re.compile(r"[{}\[\]();].*[{}\[\]();]"),  # multiple brackets on one line
    re.compile(r"\bprint\(|console\.log\(|fmt\.Print|System\.out\.|printf\("),
]

_STRUCTURE_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"^\s*[-*+]\s+", re.MULTILINE),  # bullet lists
    re.compile(r"^\s*\d+\.\s+", re.MULTILINE),  # numbered lists
    re.compile(r"^\s*\|.*\|.*\|", re.MULTILINE),  # tables
    re.compile(r"^\s*#{1,6}\s+", re.MULTILINE),  # markdown headers
    re.compile(r"^\s*>", re.MULTILINE),  # blockquotes
]

_SIMPLE_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"^(hi|hello|hey|yo|sup|thanks|thank you|ok|okay|yes|no|sure|cool|great|nice)\s*[!.?]?\s*$", re.IGNORECASE),
    re.compile(r"^(what time|what day|what date|who is|when is|where is)\b", re.IGNORECASE),
    re.compile(r"^(tell me a joke|say something funny|one word|one line)\b", re.IGNORECASE),
    re.compile(r"^(translate|summarize|tldr|tl;dr|short|brief|quick)\b", re.IGNORECASE),
]


def _word_count(text: str) -> int:
    return len(text.split())


def _char_count(text: str) -> int:
    return len(text)


def _has_reasoning_keywords(text: str) -> int:
    lower = text.lower()
    return sum(1 for kw in _REASONING_KEYWORDS if kw in lower)


def _has_tool_keywords(text: str) -> int:
    lower = text.lower()
    return sum(1 for kw in _TOOL_CALL_KEYWORDS if kw in lower)


def _has_code(text: str) -> int:
    return sum(1 for p in _CODE_PATTERNS if p.search(text))


def _has_structure(text: str) -> int:
    return sum(1 for p in _STRUCTURE_PATTERNS if p.search(text))


def _is_simple(text: str) -> bool:
    return any(p.match(text.strip()) for p in _SIMPLE_PATTERNS)


def _line_count(text: str) -> int:
    return len(text.strip().splitlines())


def _avg_line_length(text: str) -> float:
    lines = text.strip().splitlines()
    if not lines:
        return 0.0
    return sum(len(line) for line in lines) / len(lines)


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------

def _complexity_score(text: str) -> float:
    """Return a raw complexity score for *text*.  Higher = more complex."""
    if not text or not text.strip():
        return 0.0

    words = _word_count(text)
    chars = _char_count(text)
    lines = _line_count(text)

    score = 0.0

    # Length signals (logarithmic to avoid dominating)
    import math
    score += min(math.log2(max(words, 1)) * 2.0, 12.0)   # up to ~12 pts
    score += min(math.log2(max(chars, 1)) * 0.5, 6.0)    # up to ~6 pts
    score += min(math.log2(max(lines, 1)) * 1.5, 6.0)    # up to ~6 pts

    # Reasoning keywords (strong signal)
    reasoning = _has_reasoning_keywords(text)
    score += reasoning * 3.0  # up to ~15 pts (5 keywords)

    # Tool-call / multi-step
    tool_calls = _has_tool_keywords(text)
    score += tool_calls * 2.5  # up to ~10 pts

    # Code presence
    code = _has_code(text)
    score += code * 2.0  # up to ~8 pts

    # Structure (lists, tables, headers)
    structure = _has_structure(text)
    score += structure * 1.5  # up to ~6 pts

    # Simple prompt penalty
    if _is_simple(text):
        score -= 15.0

    # Very short = definitely fast
    if words <= 5:
        score -= 10.0
    elif words <= 15:
        score -= 3.0

    # Very long = definitely quality
    if words > 200:
        score += 5.0
    if lines > 20:
        score += 3.0

    return max(score, 0.0)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

# Thresholds (tuned for balanced distribution)
_FAST_THRESHOLD = 8.0
_QUALITY_THRESHOLD = 22.0


def classify_tier(text: str) -> Tier:
    """Classify prompt complexity into a routing tier.

    Returns one of ``"fast"``, ``"balanced"``, or ``"quality"``.

    The classification is purely heuristic — no model calls, no network,
    no async.  Typical execution is < 1 ms for any reasonable prompt.
    """
    if _is_simple(text):
        return "fast"

    score = _complexity_score(text)

    if score < _FAST_THRESHOLD:
        return "fast"
    if score >= _QUALITY_THRESHOLD:
        return "quality"
    return "balanced"


def classify_with_score(text: str) -> tuple[Tier, float]:
    """Like :func:`classify_tier` but also returns the raw score."""
    if _is_simple(text):
        return "fast", 0.0
    score = _complexity_score(text)
    if score < _FAST_THRESHOLD:
        return "fast", score
    if score >= _QUALITY_THRESHOLD:
        return "quality", score
    return "balanced", score
