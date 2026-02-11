"""
Advanced Reasoning Features for Blossom AI
Self-Correction Loop + Multi-Model Consensus
"""

from __future__ import annotations

from typing import Optional, List, Dict, Any, Union
from dataclasses import dataclass
from enum import Enum

from blossom_ai.core.interfaces import LoggerProtocol
from blossom_ai.utils.logging import StructuredLogger
from blossom_ai.utils.reasoning import (
    ReasoningEnhancer,
    ReasoningLevel,
    ReasoningConfig
)


# ============================================================================
# SELF-CORRECTION LOOP
# ============================================================================

@dataclass(frozen=True, slots=True)
class CorrectionConfig:
    """Configuration for self-correction loop."""
    max_iterations: int = 2
    improvement_threshold: float = 0.1  # Минимальное улучшение для продолжения
    check_accuracy: bool = True
    check_completeness: bool = True
    check_clarity: bool = True
    check_logic: bool = True


class SelfCorrectingEnhancer(ReasoningEnhancer):
    """
    Reasoning enhancer with self-correction capabilities.

    The model generates an answer, then critiques and improves it iteratively.

    Example:
        >>> enhancer = SelfCorrectingEnhancer()
        >>> result = await enhancer.enhance_with_correction(
        ...     generator=client.text,
        ...     prompt="Design authentication system",
        ...     level="high",
        ...     max_iterations=2
        ... )
        >>> print(result['final_answer'])
        >>> print(result['iterations'])  # See improvement history
    """

    def __init__(
        self,
        default_config: Optional[ReasoningConfig] = None,
        correction_config: Optional[CorrectionConfig] = None,
        logger: Optional[LoggerProtocol] = None
    ):
        super().__init__(default_config, logger)
        self.correction_config = correction_config or CorrectionConfig()
        self.logger.info(
            "SelfCorrectingEnhancer initialized",
            max_iterations=self.correction_config.max_iterations
        )

    async def enhance_with_correction(
        self,
        generator,
        prompt: str,
        level: Union[str, ReasoningLevel] = ReasoningLevel.HIGH,
        model: Optional[str] = None,
        max_iterations: Optional[int] = None,
        config: Optional[CorrectionConfig] = None
    ) -> Dict[str, Any]:
        """
        Generate answer with iterative self-correction.

        Args:
            generator: TextGenerator instance
            prompt: Original question/problem
            level: Reasoning level
            model: Model to use
            max_iterations: Override default max iterations
            config: Custom correction config

        Returns:
            Dictionary with:
                - final_answer: Best answer after corrections
                - iterations: List of all attempts with critiques
                - improvement_score: Overall improvement metric

        Example:
            >>> result = await enhancer.enhance_with_correction(
            ...     client.text,
            ...     "How to scale a database?",
            ...     max_iterations=3
            ... )
        """
        cfg = config or self.correction_config
        max_iter = max_iterations or cfg.max_iterations

        if isinstance(level, str):
            level = ReasoningLevel(level.lower())

        self.logger.info(
            "Starting self-correction loop",
            prompt=prompt[:100],
            max_iterations=max_iter
        )

        iterations = []
        current_answer = None

        # Initial answer with reasoning
        enhanced_prompt = self.enhance(prompt, level=level)
        kwargs = {"model": model} if model else {}
        current_answer = await generator.generate(enhanced_prompt, **kwargs)

        iterations.append({
            "iteration": 0,
            "answer": current_answer,
            "critique": None,
            "improvements": []
        })

        # Self-correction iterations
        for i in range(1, max_iter + 1):
            self.logger.debug(f"Correction iteration {i}/{max_iter}")

            # Generate critique
            critique_prompt = self._build_critique_prompt(
                original_question=prompt,
                current_answer=current_answer,
                config=cfg
            )

            critique = await generator.generate(critique_prompt, **kwargs)

            # Check if improvements are needed
            if self._is_answer_good_enough(critique):
                self.logger.info(f"Answer satisfactory after {i-1} corrections")
                break

            # Generate improved answer
            improvement_prompt = self._build_improvement_prompt(
                original_question=prompt,
                current_answer=current_answer,
                critique=critique,
                level=level
            )

            improved_answer = await generator.generate(improvement_prompt, **kwargs)

            # Extract improvements from critique
            improvements = self._extract_improvements(critique)

            iterations.append({
                "iteration": i,
                "answer": improved_answer,
                "critique": critique,
                "improvements": improvements
            })

            current_answer = improved_answer

        return {
            "final_answer": current_answer,
            "iterations": iterations,
            "total_corrections": len(iterations) - 1,
            "original_prompt": prompt
        }

    def _build_critique_prompt(
        self,
        original_question: str,
        current_answer: str,
        config: CorrectionConfig
    ) -> str:
        """Build prompt for self-critique."""
        criteria = []

        if config.check_accuracy:
            criteria.append("**Accuracy**: Is the answer factually correct?")
        if config.check_completeness:
            criteria.append("**Completeness**: Are all aspects of the question addressed?")
        if config.check_clarity:
            criteria.append("**Clarity**: Is the explanation clear and well-structured?")
        if config.check_logic:
            criteria.append("**Logic**: Is the reasoning sound and coherent?")

        return f"""
You are a critical reviewer. Analyze this answer and identify areas for improvement.

Original Question:
{original_question}

Current Answer:
{current_answer}

Evaluation Criteria:
{chr(10).join(criteria)}

Provide a structured critique:
1. What is correct and well-explained?
2. What is missing or incomplete?
3. What could be clearer or better structured?
4. Are there any logical flaws or inaccuracies?

If the answer is already excellent, state: "ANSWER_SATISFACTORY"

Otherwise, provide specific, actionable improvements.
"""

    def _build_improvement_prompt(
        self,
        original_question: str,
        current_answer: str,
        critique: str,
        level: ReasoningLevel
    ) -> str:
        """Build prompt for generating improved answer."""
        enhanced_base = self.enhance(
            original_question,
            level=level
        )

        return f"""
{enhanced_base}

Previous Attempt:
{current_answer}

Critique and Improvements Needed:
{critique}

Based on this critique, provide an IMPROVED and MORE COMPLETE answer.
Address all identified issues while maintaining what was already good.
"""

    def _is_answer_good_enough(self, critique: str) -> bool:
        """Check if answer is satisfactory based on critique."""
        return "ANSWER_SATISFACTORY" in critique.upper()

    def _extract_improvements(self, critique: str) -> List[str]:
        """Extract specific improvements from critique."""
        improvements = []

        # Simple extraction - look for numbered lists or bullet points
        lines = critique.split('\n')
        for line in lines:
            line = line.strip()
            if line and (line[0].isdigit() or line.startswith('-') or line.startswith('•')):
                improvements.append(line)

        return improvements[:5]  # Top 5 improvements

    def enhance_with_correction_sync(
        self,
        generator,
        prompt: str,
        **kwargs
    ) -> Dict[str, Any]:
        """Synchronous version of enhance_with_correction."""
        import asyncio
        return asyncio.run(
            self.enhance_with_correction(generator, prompt, **kwargs)
        )


# ============================================================================
# MULTI-MODEL CONSENSUS
# ============================================================================

class ConsensusStrategy(str, Enum):
    """Strategies for combining multiple model responses."""
    MAJORITY_VOTE = "majority"           # Простое голосование
    WEIGHTED_QUALITY = "weighted"        # Взвешенное по качеству
    SYNTHESIZE = "synthesize"            # Синтез лучших частей
    DEBATE = "debate"                    # Модели "дебатируют"


@dataclass(frozen=True, slots=True)
class ConsensusConfig:
    """Configuration for multi-model consensus."""
    strategy: ConsensusStrategy = ConsensusStrategy.SYNTHESIZE
    min_agreement: float = 0.6           # Минимальный консенсус
    include_reasoning: bool = True       # Включать reasoning от каждой модели
    synthesis_prompt: Optional[str] = None


class ConsensusReasoning:
    """
    Multi-model consensus reasoning.

    Multiple models solve the same problem, then results are synthesized
    into a more reliable and comprehensive answer.

    Example:
        >>> consensus = ConsensusReasoning(client.text)
        >>> result = await consensus.solve_with_consensus(
        ...     "Design a caching strategy",
        ...     models=["gemini", "claude", "mistral"],
        ...     strategy="synthesize"
        ... )
        >>> print(result['consensus_answer'])
        >>> for model_result in result['individual_responses']:
        ...     print(f"{model_result['model']}: {model_result['answer'][:100]}")
    """

    def __init__(
        self,
        text_generator,
        enhancer: Optional[ReasoningEnhancer] = None,
        config: Optional[ConsensusConfig] = None,
        logger: Optional[LoggerProtocol] = None
    ):
        self.generator = text_generator
        self.enhancer = enhancer or ReasoningEnhancer()
        self.config = config or ConsensusConfig()
        self.logger = logger or StructuredLogger("consensus_reasoning")

    async def solve_with_consensus(
        self,
        problem: str,
        models: List[str],
        level: Union[str, ReasoningLevel] = ReasoningLevel.HIGH,
        strategy: Optional[Union[str, ConsensusStrategy]] = None,
        config: Optional[ConsensusConfig] = None
    ) -> Dict[str, Any]:
        """
        Solve problem using multiple models and synthesize consensus.

        Args:
            problem: Problem to solve
            models: List of model names (e.g., ["gemini", "claude", "mistral"])
            level: Reasoning level
            strategy: Consensus strategy (override config)
            config: Custom consensus config

        Returns:
            Dictionary with:
                - consensus_answer: Synthesized final answer
                - individual_responses: List of responses from each model
                - agreement_score: How much models agree (0.0-1.0)
                - strategy_used: Which consensus strategy was applied

        Example:
            >>> result = await consensus.solve_with_consensus(
            ...     "Best practices for API design",
            ...     models=["gemini", "claude"],
            ...     strategy="synthesize"
            ... )
        """
        cfg = config or self.config
        strat = ConsensusStrategy(strategy) if strategy else cfg.strategy

        if isinstance(level, str):
            level = ReasoningLevel(level.lower())

        if len(models) < 2:
            raise ValueError("Need at least 2 models for consensus")

        self.logger.info(
            "Starting consensus reasoning",
            problem=problem[:100],
            models=models,
            strategy=strat.value
        )

        # Enhance prompt once
        enhanced_prompt = self.enhancer.enhance(problem, level=level)

        # Get responses from all models
        individual_responses = []

        for model in models:
            self.logger.debug(f"Querying model: {model}")

            try:
                response = await self.generator.generate(
                    enhanced_prompt,
                    model=model
                )

                # Extract reasoning if available
                parsed = self.enhancer.extract_reasoning(response)

                individual_responses.append({
                    "model": model,
                    "answer": parsed['answer'],
                    "reasoning": parsed['reasoning'] if cfg.include_reasoning else None,
                    "confidence": parsed['confidence']
                })
            except Exception as e:
                self.logger.error(f"Model {model} failed", error=str(e))
                # Continue with other models

        if len(individual_responses) < 2:
            raise RuntimeError("Not enough successful model responses for consensus")

        # Apply consensus strategy
        if strat == ConsensusStrategy.SYNTHESIZE:
            consensus = await self._synthesize_responses(
                problem, individual_responses, level
            )
        elif strat == ConsensusStrategy.MAJORITY_VOTE:
            consensus = self._majority_vote(individual_responses)
        elif strat == ConsensusStrategy.WEIGHTED_QUALITY:
            consensus = self._weighted_consensus(individual_responses)
        elif strat == ConsensusStrategy.DEBATE:
            consensus = await self._debate_consensus(
                problem, individual_responses, level
            )
        else:
            consensus = individual_responses[0]['answer']  # Fallback

        # Calculate agreement score
        agreement = self._calculate_agreement(individual_responses)

        return {
            "consensus_answer": consensus,
            "individual_responses": individual_responses,
            "agreement_score": agreement,
            "strategy_used": strat.value,
            "models_used": models,
            "original_problem": problem
        }

    async def _synthesize_responses(
        self,
        problem: str,
        responses: List[Dict[str, Any]],
        level: ReasoningLevel
    ) -> str:
        """Synthesize best parts from all responses."""
        # Build synthesis prompt
        responses_text = "\n\n".join([
            f"### Response from {r['model']}:\n{r['answer']}"
            for r in responses
        ])

        synthesis_prompt = f"""
You are an expert synthesizer. Multiple AI models have answered this question:

**Original Question:**
{problem}

**Responses from different models:**
{responses_text}

Your task:
1. Identify the strongest points from each response
2. Resolve any contradictions with reasoning
3. Combine insights into one comprehensive, coherent answer
4. Preserve technical accuracy and depth

Provide a SYNTHESIZED answer that represents the best collective intelligence.
"""

        # Use high-quality model for synthesis (first in list)
        best_model = responses[0]['model']

        enhanced = self.enhancer.enhance(synthesis_prompt, level=level)
        synthesis = await self.generator.generate(enhanced, model=best_model)

        return synthesis

    def _majority_vote(self, responses: List[Dict[str, Any]]) -> str:
        """Simple majority vote (most common answer wins)."""
        # For simplicity, just return the longest answer
        # In production, you'd compare semantic similarity
        return max(responses, key=lambda r: len(r['answer']))['answer']

    def _weighted_consensus(self, responses: List[Dict[str, Any]]) -> str:
        """Weight responses by confidence level."""
        # Weight by confidence: HIGH=3, MEDIUM=2, LOW=1, None=1
        weights = {"HIGH": 3, "MEDIUM": 2, "LOW": 1}

        weighted = []
        for r in responses:
            weight = weights.get(r['confidence'], 1)
            weighted.append((r['answer'], weight))

        # Return answer with highest weight (or longest if tied)
        return max(weighted, key=lambda x: (x[1], len(x[0])))[0]

    async def _debate_consensus(
        self,
        problem: str,
        responses: List[Dict[str, Any]],
        level: ReasoningLevel
    ) -> str:
        """Models "debate" their answers to reach consensus."""
        # Find points of disagreement
        debate_prompt = f"""
Multiple models answered this question differently:

**Question:** {problem}

**Model A ({responses[0]['model']}):**
{responses[0]['answer']}

**Model B ({responses[1]['model']}):**
{responses[1]['answer']}

Identify key differences in their approaches and reasoning.
Then provide a UNIFIED answer that resolves disagreements with clear justification.
"""

        enhanced = self.enhancer.enhance(debate_prompt, level=level)
        unified = await self.generator.generate(
            enhanced,
            model=responses[0]['model']
        )

        return unified

    def _calculate_agreement(self, responses: List[Dict[str, Any]]) -> float:
        """
        Calculate agreement score between responses.

        Simple heuristic: compare answer lengths and confidence levels.
        Real implementation would use semantic similarity.
        """
        if len(responses) < 2:
            return 1.0

        # Check confidence agreement
        confidences = [r['confidence'] for r in responses if r['confidence']]
        if confidences and len(set(confidences)) == 1:
            confidence_bonus = 0.2
        else:
            confidence_bonus = 0.0

        # Check length similarity (proxy for depth)
        lengths = [len(r['answer']) for r in responses]
        avg_len = sum(lengths) / len(lengths)
        length_variance = sum(abs(l - avg_len) for l in lengths) / len(lengths)
        length_score = max(0, 1 - (length_variance / avg_len))

        # Combined score
        return min(1.0, length_score * 0.8 + confidence_bonus)

    def solve_with_consensus_sync(
        self,
        problem: str,
        models: List[str],
        **kwargs
    ) -> Dict[str, Any]:
        """Synchronous version of solve_with_consensus."""
        import asyncio
        return asyncio.run(
            self.solve_with_consensus(problem, models, **kwargs)
        )


# ============================================================================
# CONVENIENCE FUNCTIONS
# ============================================================================

def create_self_correcting_enhancer(
    max_iterations: int = 2,
    **kwargs
) -> SelfCorrectingEnhancer:
    """
    Create self-correcting enhancer with custom config.

    Example:
        >>> enhancer = create_self_correcting_enhancer(
        ...     max_iterations=3,
        ...     check_accuracy=True,
        ...     check_completeness=True
        ... )
    """
    correction_config = CorrectionConfig(
        max_iterations=max_iterations,
        **{k: v for k, v in kwargs.items()
           if k in CorrectionConfig.__dataclass_fields__}
    )
    return SelfCorrectingEnhancer(correction_config=correction_config)


def create_consensus_reasoning(
    text_generator,
    strategy: str = "synthesize",
    **kwargs
) -> ConsensusReasoning:
    """
    Create consensus reasoning with custom config.

    Example:
        >>> consensus = create_consensus_reasoning(
        ...     client.text,
        ...     strategy="synthesize",
        ...     min_agreement=0.7
        ... )
    """
    config = ConsensusConfig(
        strategy=ConsensusStrategy(strategy),
        **{k: v for k, v in kwargs.items()
           if k in ConsensusConfig.__dataclass_fields__}
    )
    return ConsensusReasoning(
        text_generator,
        config=config
    )


__all__ = [
    # Self-Correction
    "SelfCorrectingEnhancer",
    "CorrectionConfig",
    "create_self_correcting_enhancer",

    # Consensus
    "ConsensusReasoning",
    "ConsensusStrategy",
    "ConsensusConfig",
    "create_consensus_reasoning",
]