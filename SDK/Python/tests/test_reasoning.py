# tests/test_reasoning.py
"""Tests for reasoning module."""

import pytest
from unittest.mock import Mock, AsyncMock

from blossom_ai.utils.reasoning import (
    ReasoningEnhancer,
    ReasoningChain,
    ReasoningLevel,
    ReasoningConfig,
    create_reasoning_enhancer,
    quick_enhance,
)


class TestReasoningConfig:
    """Tests for ReasoningConfig."""

    def test_default_config(self):
        """Test default configuration values."""
        config = ReasoningConfig()
        assert config.level == ReasoningLevel.MEDIUM
        assert config.include_confidence is False
        assert config.structured_thinking is True
        assert config.chain_of_thought is True
        assert config.self_critique is False
        assert config.alternative_approaches is False
        assert config.step_verification is False
        assert config.max_reasoning_tokens is None

    def test_custom_config(self):
        """Test custom configuration values."""
        config = ReasoningConfig(
            level=ReasoningLevel.HIGH,
            include_confidence=True,
            self_critique=True,
            alternative_approaches=True,
            max_reasoning_tokens=2000
        )
        assert config.level == ReasoningLevel.HIGH
        assert config.include_confidence is True
        assert config.self_critique is True
        assert config.alternative_approaches is True
        assert config.max_reasoning_tokens == 2000

    def test_immutability(self):
        """Test config is immutable."""
        config = ReasoningConfig()
        with pytest.raises(AttributeError):
            config.level = ReasoningLevel.HIGH


class TestReasoningEnhancer:
    """Tests for ReasoningEnhancer."""

    @pytest.fixture
    def enhancer(self):
        """Create enhancer instance."""
        return ReasoningEnhancer()

    def test_init_default(self):
        """Test initialization with defaults."""
        enhancer = ReasoningEnhancer()
        assert enhancer.default_config.level == ReasoningLevel.MEDIUM

    def test_init_custom_config(self):
        """Test initialization with custom config."""
        config = ReasoningConfig(level=ReasoningLevel.HIGH)
        enhancer = ReasoningEnhancer(default_config=config)
        assert enhancer.default_config.level == ReasoningLevel.HIGH

    def test_enhance_basic(self, enhancer):
        """Test basic prompt enhancement."""
        prompt = "Explain quantum computing"
        enhanced = enhancer.enhance(prompt)

        assert isinstance(enhanced, str)
        assert len(enhanced) > len(prompt)
        assert prompt in enhanced
        assert "reasoning" in enhanced.lower() or "systematically" in enhanced.lower()

    def test_enhance_with_level(self, enhancer):
        """Test enhancement with specific level."""
        prompt = "Test prompt"

        low = enhancer.enhance(prompt, level=ReasoningLevel.LOW)
        medium = enhancer.enhance(prompt, level=ReasoningLevel.MEDIUM)
        high = enhancer.enhance(prompt, level=ReasoningLevel.HIGH)

        # Higher levels should produce longer prompts
        assert len(low) < len(medium) < len(high)
        assert "deep_reasoning" in high
        assert "<reasoning>" in medium

    def test_enhance_with_string_level(self, enhancer):
        """Test enhancement with string level."""
        prompt = "Test"
        enhanced = enhancer.enhance(prompt, level="high")

        assert "deep_reasoning" in enhanced

    def test_enhance_with_context(self, enhancer):
        """Test enhancement with context."""
        prompt = "Test"
        context = "For beginners"
        enhanced = enhancer.enhance(prompt, context=context)

        assert context in enhanced

    def test_enhance_with_examples(self, enhancer):
        """Test enhancement with examples."""
        prompt = "Test"
        examples = ["Example 1", "Example 2"]
        enhanced = enhancer.enhance(prompt, examples=examples)

        assert examples[0] in enhanced
        assert examples[1] in enhanced

    def test_adaptive_level_simple(self, enhancer):
        """Test adaptive level for simple query."""
        prompt = "What is AI?"
        enhanced = enhancer.enhance(prompt, level=ReasoningLevel.ADAPTIVE)

        # Should choose LOW level
        assert "briefly" in enhanced.lower()

    def test_adaptive_level_complex(self, enhancer):
        """Test adaptive level for complex query."""
        prompt = "Explain how to design a scalable microservices architecture with proper security considerations"
        enhanced = enhancer.enhance(prompt, level=ReasoningLevel.ADAPTIVE)

        # Should choose HIGH level
        assert "deep_reasoning" in enhanced

    def test_extract_reasoning_simple(self, enhancer):
        """Test extracting reasoning from response."""
        response = """
<reasoning>
This is the reasoning part.
</reasoning>

This is the answer part.
"""
        result = enhancer.extract_reasoning(response)

        assert result['reasoning'] is not None
        assert "reasoning part" in result['reasoning']
        assert "answer part" in result['answer']

    def test_extract_reasoning_deep(self, enhancer):
        """Test extracting deep reasoning."""
        response = """
<deep_reasoning>
### Analysis
Deep thinking here
</deep_reasoning>

Final answer here.
"""
        result = enhancer.extract_reasoning(response)

        assert result['reasoning'] is not None
        assert "Deep thinking" in result['reasoning']
        assert "Final answer" in result['answer']

    def test_extract_reasoning_with_confidence(self, enhancer):
        """Test extracting confidence level."""
        response = """
<reasoning>
Analysis here
</reasoning>

Answer with confidence: HIGH
"""
        result = enhancer.extract_reasoning(response)

        assert result['confidence'] == "HIGH"

    def test_extract_reasoning_no_tags(self, enhancer):
        """Test extraction when no reasoning tags present."""
        response = "Just a simple answer"
        result = enhancer.extract_reasoning(response)

        assert result['reasoning'] is None
        assert result['answer'] == response
        assert result['confidence'] is None


class TestReasoningChain:
    """Tests for ReasoningChain."""

    @pytest.fixture
    def mock_generator(self):
        """Create mock text generator."""
        generator = Mock()
        generator.generate = AsyncMock(return_value="Generated response")
        return generator

    @pytest.fixture
    def chain(self, mock_generator):
        """Create chain instance."""
        return ReasoningChain(mock_generator)

    @pytest.mark.asyncio
    async def test_solve_default_steps(self, chain, mock_generator):
        """Test solving with default steps."""
        problem = "Test problem"
        result = await chain.solve(problem)

        assert result['problem'] == problem
        assert len(result['steps']) == 4  # Default: understand, plan, execute, verify
        assert result['final_answer'] is not None

        # Generator should be called: 4 steps + 1 final synthesis
        assert mock_generator.generate.call_count == 5

    @pytest.mark.asyncio
    async def test_solve_custom_steps(self, chain, mock_generator):
        """Test solving with custom steps."""
        problem = "Test"
        steps = ["analyze", "design"]
        result = await chain.solve(problem, steps=steps)

        assert len(result['steps']) == 2
        assert result['steps'][0]['step'] == "analyze"
        assert result['steps'][1]['step'] == "design"

    @pytest.mark.asyncio
    async def test_solve_with_level(self, chain, mock_generator):
        """Test solving with specific level."""
        problem = "Test"
        result = await chain.solve(problem, level=ReasoningLevel.HIGH)

        assert result is not None
        # Verify HIGH level was used (generator should receive enhanced prompts)
        assert mock_generator.generate.called

    @pytest.mark.asyncio
    async def test_solve_with_model(self, chain, mock_generator):
        """Test solving with specific model."""
        problem = "Test"
        result = await chain.solve(problem, model="gemini")

        # Verify model was passed to generator
        calls = mock_generator.generate.call_args_list
        assert any("model" in str(call) for call in calls)

    @pytest.mark.asyncio
    async def test_solve_context_accumulation(self, chain, mock_generator):
        """Test that context accumulates across steps."""
        problem = "Test problem"
        steps = ["step1", "step2"]

        # Mock different responses for each step
        mock_generator.generate.side_effect = [
            "Step 1 output",
            "Step 2 output",
            "Final synthesis"
        ]

        result = await chain.solve(problem, steps=steps)

        # Check that context was accumulated
        assert len(result['steps']) == 2
        assert result['steps'][0]['output'] == "Step 1 output"
        assert result['steps'][1]['output'] == "Step 2 output"


class TestConvenienceFunctions:
    """Tests for convenience functions."""

    def test_create_reasoning_enhancer(self):
        """Test creating enhancer with factory."""
        enhancer = create_reasoning_enhancer(
            level="high",
            include_confidence=True
        )

        assert isinstance(enhancer, ReasoningEnhancer)
        assert enhancer.default_config.level == ReasoningLevel.HIGH
        assert enhancer.default_config.include_confidence is True

    def test_quick_enhance(self):
        """Test quick enhancement function."""
        prompt = "Test prompt"
        enhanced = quick_enhance(prompt, level="medium")

        assert isinstance(enhanced, str)
        assert len(enhanced) > len(prompt)
        assert prompt in enhanced


class TestReasoningLevel:
    """Tests for ReasoningLevel enum."""

    def test_enum_values(self):
        """Test enum has correct values."""
        assert ReasoningLevel.LOW == "low"
        assert ReasoningLevel.MEDIUM == "medium"
        assert ReasoningLevel.HIGH == "high"
        assert ReasoningLevel.ADAPTIVE == "adaptive"

    def test_from_string(self):
        """Test creating enum from string."""
        level = ReasoningLevel("high")
        assert level == ReasoningLevel.HIGH