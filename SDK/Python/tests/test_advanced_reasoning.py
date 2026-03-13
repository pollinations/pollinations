# tests/test_advanced_reasoning.py
"""Tests for advanced reasoning features (self-correction and consensus)."""

import pytest
from unittest.mock import Mock, AsyncMock

from blossom_ai.utils.reasoning.advanced import (
    SelfCorrectingEnhancer,
    CorrectionConfig,
    ConsensusReasoning,
    ConsensusStrategy,
    ConsensusConfig,
    create_self_correcting_enhancer,
    create_consensus_reasoning,
)
from blossom_ai.utils.reasoning import ReasoningLevel


class TestCorrectionConfig:
    """Tests for CorrectionConfig."""

    def test_default_config(self):
        """Test default correction configuration."""
        config = CorrectionConfig()
        assert config.max_iterations == 2
        assert config.check_accuracy is True
        assert config.check_completeness is True
        assert config.check_clarity is True
        assert config.check_logic is True

    def test_custom_config(self):
        """Test custom correction configuration."""
        config = CorrectionConfig(
            max_iterations=3,
            check_accuracy=False,
            improvement_threshold=0.2
        )
        assert config.max_iterations == 3
        assert config.check_accuracy is False
        assert config.improvement_threshold == 0.2


class TestSelfCorrectingEnhancer:
    """Tests for SelfCorrectingEnhancer."""

    @pytest.fixture
    def mock_generator(self):
        """Create a mock text generator."""
        generator = Mock()
        generator.generate = AsyncMock()
        return generator

    @pytest.fixture
    def enhancer(self):
        """Create enhancer instance."""
        return SelfCorrectingEnhancer()

    def test_init_default(self):
        """Test initialization with defaults."""
        enhancer = SelfCorrectingEnhancer()
        assert enhancer.correction_config.max_iterations == 2

    def test_init_custom_config(self):
        """Test initialization with custom config."""
        config = CorrectionConfig(max_iterations=3)
        enhancer = SelfCorrectingEnhancer(correction_config=config)
        assert enhancer.correction_config.max_iterations == 3

    @pytest.mark.asyncio
    async def test_enhance_with_correction_basic(self, enhancer, mock_generator):
        """Test basic self-correction flow."""
        # Mock responses
        mock_generator.generate.side_effect = [
            "Initial answer",  # First attempt
            "Needs improvement in clarity",  # Critique
            "Improved answer with more detail"  # Corrected answer
        ]

        result = await enhancer.enhance_with_correction(
            mock_generator,
            "Test question",
            max_iterations=1
        )

        assert result['final_answer'] == "Improved answer with more detail"
        assert result['total_corrections'] == 1
        assert len(result['iterations']) == 2  # Initial + 1 correction

    @pytest.mark.asyncio
    async def test_enhance_with_correction_satisfactory(self, enhancer, mock_generator):
        """Test early exit when the answer is satisfactory."""
        mock_generator.generate.side_effect = [
            "Perfect answer",
            "ANSWER_SATISFACTORY - this is excellent"  # Critique says stop
        ]

        result = await enhancer.enhance_with_correction(
            mock_generator,
            "Test question",
            max_iterations=3
        )

        assert result['final_answer'] == "Perfect answer"
        assert result['total_corrections'] == 0  # Stopped early
        assert len(result['iterations']) == 1

    @pytest.mark.asyncio
    async def test_enhance_with_correction_multiple_iterations(self, enhancer, mock_generator):
        """Test multiple correction iterations."""
        mock_generator.generate.side_effect = [
            "Answer v1",
            "Needs work",
            "Answer v2",
            "Still not great",
            "Answer v3 final"
        ]

        result = await enhancer.enhance_with_correction(
            mock_generator,
            "Complex question",
            max_iterations=2
        )

        assert result['final_answer'] == "Answer v3 final"
        assert result['total_corrections'] == 2
        assert len(result['iterations']) == 3

    @pytest.mark.asyncio
    async def test_enhance_with_correction_with_model(self, enhancer, mock_generator):
        """Test correction with a specific model."""
        mock_generator.generate.side_effect = [
            "Initial",
            "Critique",
            "Improved"
        ]

        result = await enhancer.enhance_with_correction(
            mock_generator,
            "Test",
            model="gemini",
            max_iterations=1
        )

        # Verify model was passed to generator
        calls = mock_generator.generate.call_args_list
        assert any("model" in str(call) for call in calls)

    def test_build_critique_prompt(self, enhancer):
        """Test critique prompt generation."""
        config = CorrectionConfig(
            check_accuracy=True,
            check_completeness=True,
            check_clarity=False,
            check_logic=False
        )

        prompt = enhancer._build_critique_prompt(
            "What is AI?",
            "AI is a technology",
            config
        )

        assert "Accuracy" in prompt
        assert "Completeness" in prompt
        assert "Clarity" not in prompt
        assert "Logic" not in prompt

    def test_is_answer_good_enough(self, enhancer):
        """Test answer satisfaction check."""
        assert enhancer._is_answer_good_enough("ANSWER_SATISFACTORY") is True
        assert enhancer._is_answer_good_enough("answer_satisfactory") is True
        assert enhancer._is_answer_good_enough("Needs improvement") is False

    def test_extract_improvements(self, enhancer):
        """Test improvement extraction from critique."""
        critique = """
1. Add more examples
2. Improve clarity
- Fix typos
- Better structure
"""
        improvements = enhancer._extract_improvements(critique)
        assert len(improvements) > 0
        assert any("examples" in imp.lower() for imp in improvements)


class TestConsensusConfig:
    """Tests for ConsensusConfig."""

    def test_default_config(self):
        """Test default consensus configuration."""
        config = ConsensusConfig()
        assert config.strategy == ConsensusStrategy.SYNTHESIZE
        assert config.min_agreement == 0.6
        assert config.include_reasoning is True

    def test_custom_config(self):
        """Test custom consensus configuration."""
        config = ConsensusConfig(
            strategy=ConsensusStrategy.MAJORITY_VOTE,
            min_agreement=0.8
        )
        assert config.strategy == ConsensusStrategy.MAJORITY_VOTE
        assert config.min_agreement == 0.8


class TestConsensusReasoning:
    """Tests for ConsensusReasoning."""

    @pytest.fixture
    def mock_generator(self):
        """Create a mock text generator."""
        generator = Mock()
        generator.generate = AsyncMock()
        return generator

    @pytest.fixture
    def consensus(self, mock_generator):
        """Create a consensus reasoning instance."""
        return ConsensusReasoning(mock_generator)

    @pytest.mark.asyncio
    async def test_solve_with_consensus_basic(self, consensus, mock_generator):
        """Test basic consensus solving."""
        # Mock different responses from models
        mock_generator.generate.side_effect = [
            "Response from model 1",
            "Response from model 2",
            "Synthesized consensus answer"  # Synthesis
        ]

        result = await consensus.solve_with_consensus(
            "Test problem",
            models=["gemini", "claude"]
        )

        assert result['consensus_answer'] == "Synthesized consensus answer"
        assert len(result['individual_responses']) == 2
        assert result['models_used'] == ["gemini", "claude"]

    @pytest.mark.asyncio
    async def test_solve_with_consensus_insufficient_models(self, consensus):
        """Test error when too few models provided."""
        with pytest.raises(ValueError, match="Need at least 2 models"):
            await consensus.solve_with_consensus(
                "Test",
                models=["gemini"]  # Only 1 model
            )

    @pytest.mark.asyncio
    async def test_solve_with_consensus_model_failure(self, consensus, mock_generator):
        """Test handling when one model fails."""
        # First model succeeds, second fails, third succeeds
        mock_generator.generate.side_effect = [
            "Response 1",
            Exception("Model 2 failed"),
            "Response 3",
            "Synthesized"
        ]

        result = await consensus.solve_with_consensus(
            "Test",
            models=["model1", "model2", "model3"]
        )

        # Should still work with 2 successful responses
        assert len(result['individual_responses']) == 2

    @pytest.mark.asyncio
    async def test_solve_with_consensus_strategies(self, consensus, mock_generator):
        """Test different consensus strategies."""
        mock_generator.generate.side_effect = [
            "Answer A",
            "Answer B",
            "Synthesized"
        ]

        # Test synthesize strategy
        result = await consensus.solve_with_consensus(
            "Test",
            models=["m1", "m2"],
            strategy=ConsensusStrategy.SYNTHESIZE
        )
        assert result['strategy_used'] == "synthesize"

    @pytest.mark.asyncio
    async def test_solve_with_consensus_majority_vote(self, consensus, mock_generator):
        """Test majority vote strategy."""
        mock_generator.generate.side_effect = [
            "Short answer",
            "Much longer and more detailed answer"
        ]

        config = ConsensusConfig(strategy=ConsensusStrategy.MAJORITY_VOTE)
        consensus_custom = ConsensusReasoning(mock_generator, config=config)

        result = await consensus_custom.solve_with_consensus(
            "Test",
            models=["m1", "m2"]
        )

        # Majority vote picks the longest answer
        assert "longer" in result['consensus_answer'].lower()

    def test_calculate_agreement(self, consensus):
        """Test agreement score calculation."""
        responses = [
            {"model": "m1", "answer": "A" * 100, "confidence": "HIGH"},
            {"model": "m2", "answer": "B" * 100, "confidence": "HIGH"},
        ]

        score = consensus._calculate_agreement(responses)
        assert 0.0 <= score <= 1.0

    def test_calculate_agreement_single_response(self, consensus):
        """Test agreement with a single response."""
        responses = [{"model": "m1", "answer": "A", "confidence": None}]
        score = consensus._calculate_agreement(responses)
        assert score == 1.0

    @pytest.mark.asyncio
    async def test_synthesize_responses(self, consensus, mock_generator):
        """Test response synthesis."""
        responses = [
            {"model": "m1", "answer": "Answer 1", "reasoning": None},
            {"model": "m2", "answer": "Answer 2", "reasoning": None}
        ]

        mock_generator.generate.return_value = "Synthesized result"

        result = await consensus._synthesize_responses(
            "Problem",
            responses,
            ReasoningLevel.HIGH
        )

        assert result == "Synthesized result"
        mock_generator.generate.assert_called_once()


class TestConvenienceFunctions:
    """Tests for convenience functions."""

    def test_create_self_correcting_enhancer(self):
        """Test factory for self-correcting enhancer."""
        enhancer = create_self_correcting_enhancer(
            max_iterations=3,
            check_accuracy=True
        )

        assert isinstance(enhancer, SelfCorrectingEnhancer)
        assert enhancer.correction_config.max_iterations == 3
        assert enhancer.correction_config.check_accuracy is True

    def test_create_consensus_reasoning(self):
        """Test factory for consensus reasoning."""
        mock_gen = Mock()
        consensus = create_consensus_reasoning(
            mock_gen,
            strategy="majority",
            min_agreement=0.7
        )

        assert isinstance(consensus, ConsensusReasoning)
        assert consensus.config.strategy == ConsensusStrategy.MAJORITY_VOTE
        assert consensus.config.min_agreement == 0.7


class TestConsensusStrategy:
    """Tests for ConsensusStrategy enum."""

    def test_enum_values(self):
        """Test enum has correct values."""
        assert ConsensusStrategy.MAJORITY_VOTE == "majority"
        assert ConsensusStrategy.WEIGHTED_QUALITY == "weighted"
        assert ConsensusStrategy.SYNTHESIZE == "synthesize"
        assert ConsensusStrategy.DEBATE == "debate"