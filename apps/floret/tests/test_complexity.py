"""Unit tests for the prompt-complexity classifier."""

from __future__ import annotations

from floret.complexity import classify_tier, classify_with_score


class TestClassifyTier:
    """Test tier classification for various prompt types."""

    def test_empty_prompt_returns_fast(self):
        """Empty prompt is simple, so it should be classified as fast."""
        assert classify_tier("") == "fast"

    def test_simple_greeting_returns_fast(self):
        """Simple greetings should be classified as fast."""
        assert classify_tier("hello") == "fast"
        assert classify_tier("hi") == "fast"
        assert classify_tier("hey") == "fast"
        assert classify_tier("thanks") == "fast"
        assert classify_tier("ok") == "fast"

    def test_simple_question_returns_fast(self):
        """Simple factual questions should be classified as fast."""
        assert classify_tier("what time is it?") == "fast"
        assert classify_tier("who is the president?") == "fast"
        assert classify_tier("where is Paris?") == "fast"

    def test_short_prompt_returns_fast(self):
        """Very short prompts (<=5 words) should be classified as fast."""
        assert classify_tier("hello world") == "fast"
        assert classify_tier("what is 2+2?") == "fast"

    def test_medium_prompt_returns_balanced(self):
        """Medium-length prompts with moderate complexity should be balanced."""
        assert classify_tier("Write a function to sort an array of integers") == "balanced"
        assert classify_tier("Explain how photosynthesis works in plants") == "balanced"

    def test_reasoning_keywords_returns_quality(self):
        """Prompts with reasoning keywords should be classified as quality."""
        assert classify_tier(
            "Analyze the tradeoffs between microservices and monolithic architecture. "
            "Compare the pros and cons, evaluate the implications for scalability, "
            "and provide a comprehensive critique of each approach."
        ) == "quality"

    def test_code_heavy_prompt_returns_quality(self):
        """Prompts with code blocks should be classified as quality."""
        assert classify_tier(
            "```python\ndef complex_algorithm():\n"
            "    # Implement dynamic programming solution\n"
            "    pass\n```\n"
            "Explain this algorithm step by step."
        ) == "quality"

    def test_tool_call_keywords_returns_quality(self):
        """Prompts with tool-call indicators should be classified as quality."""
        assert classify_tier(
            "Use the tool to call the API endpoint, then execute the pipeline "
            "and orchestrate the multi-agent workflow."
        ) == "quality"

    def test_structured_prompt_returns_quality(self):
        """Prompts with structure (lists, tables) should be classified as quality."""
        assert classify_tier(
            "# Analysis Report\n\n"
            "## Requirements\n"
            "- Requirement 1: Scalability\n"
            "- Requirement 2: Security\n"
            "- Requirement 3: Performance\n\n"
            "## Evaluation Criteria\n"
            "1. Cost\n"
            "2. Complexity\n"
            "3. Maintenance\n\n"
            "Please evaluate each option against these criteria."
        ) == "quality"

    def test_very_long_prompt_returns_quality(self):
        """Very long prompts (>200 words) should be classified as quality."""
        long_prompt = " ".join(["word"] * 250)
        assert classify_tier(long_prompt) == "quality"


class TestClassifyWithScore:
    """Test that classify_with_score returns both tier and score."""

    def test_returns_tuple(self):
        """Should return a (tier, score) tuple."""
        tier, score = classify_with_score("hello")
        assert tier == "fast"
        assert isinstance(score, float)

    def test_score_increases_with_complexity(self):
        """More complex prompts should have higher scores."""
        _, simple_score = classify_with_score("hi")
        _, complex_score = classify_with_score(
            "Analyze the architectural implications of adopting event-driven "
            "microservices, compare with synchronous alternatives, and evaluate "
            "the tradeoffs for our current system."
        )
        assert complex_score > simple_score

    def test_balanced_score_range(self):
        """Balanced prompts should have scores in the middle range."""
        tier, score = classify_with_score(
            "Write a Python function that sorts a list of integers."
        )
        assert tier == "balanced"
        assert 8.0 <= score < 22.0


class TestEdgeCases:
    """Test edge cases and special characters."""

    def test_unicode_characters(self):
        """Prompts with unicode should work."""
        tier = classify_tier("分析这个系统的架构设计")
        assert tier in ("fast", "balanced", "quality")

    def test_special_characters(self):
        """Prompts with special characters should work."""
        tier = classify_tier("What's the @#$%^&*() meaning of life?")
        assert tier in ("fast", "balanced", "quality")

    def test_whitespace_only(self):
        """Whitespace-only prompts are simple, so they should be fast."""
        assert classify_tier("   ") == "fast"

    def test_newlines_only(self):
        """Newline-only prompts are simple, so they should be fast."""
        assert classify_tier("\n\n\n") == "fast"
