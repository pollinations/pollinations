"""
Blossom AI - Reasoning Module
Enhances prompts with reasoning capabilities for models that don't support native reasoning.

For models with native reasoning support (like openai-reasoning), use them directly.
This module provides reasoning through prompt engineering for other models.
"""

from __future__ import annotations

from enum import Enum
from typing import Optional, List, Dict, Any, Union
from dataclasses import dataclass, field

from blossom_ai.core.interfaces import LoggerProtocol
from blossom_ai.utils.logging import StructuredLogger


class ReasoningLevel(str, Enum):
    """Reasoning complexity levels."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    ADAPTIVE = "adaptive"


@dataclass(frozen=True, slots=True)
class ReasoningConfig:
    """
    Immutable configuration for reasoning enhancement.

    Attributes:
        level: Reasoning complexity level
        include_confidence: Add confidence scores to output
        structured_thinking: Use structured reasoning blocks
        chain_of_thought: Enable chain-of-thought reasoning
        self_critique: Add self-critique phase
        alternative_approaches: Consider multiple approaches
        step_verification: Verify each reasoning step
        max_reasoning_tokens: Approximate token budget for reasoning
    """
    level: ReasoningLevel = ReasoningLevel.MEDIUM
    include_confidence: bool = False
    structured_thinking: bool = True
    chain_of_thought: bool = True
    self_critique: bool = False
    alternative_approaches: bool = False
    step_verification: bool = False
    max_reasoning_tokens: Optional[int] = None


# Reasoning prompt templates for different levels
_REASONING_PROMPTS = {
    ReasoningLevel.LOW: """Before answering, briefly consider:
1. What is the core question?
2. What's the most direct approach?

Now provide your answer:""",

    ReasoningLevel.MEDIUM: """Let's approach this systematically:

<reasoning>
1. Understanding: What exactly is being asked?
2. Key factors: What are the important considerations?
3. Approach: What's the best way to handle this?
4. Potential issues: What could go wrong?
</reasoning>

Based on this analysis, here's my response:""",

    ReasoningLevel.HIGH: """Let me think through this carefully and thoroughly:

<deep_reasoning>
### Problem Analysis
- Core question and objectives
- Context and constraints
- Assumptions to validate

### Solution Exploration
- Approach 1: [describe and evaluate]
- Approach 2: [describe and evaluate]
- Approach 3: [describe and evaluate]

### Critical Evaluation
- Strengths and weaknesses of each approach
- Trade-offs and implications
- Edge cases and potential failures

### Verification
- Does this solution actually address the problem?
- What could go wrong?
- How confident am I? (1-10 scale)

### Final Synthesis
- Best approach and why
- Implementation considerations
- Limitations and caveats
</deep_reasoning>

Based on this thorough analysis, here's my detailed response:"""
}


class ReasoningEnhancer:
    """
    Enhances prompts with reasoning instructions for models without native reasoning.

    This module uses prompt engineering to simulate reasoning capabilities.
    For models with native reasoning (like openai-reasoning), use them directly instead.

    Example:
        >>> from blossom_ai import BlossomClient
        >>> from blossom_ai.utils.reasoning import ReasoningEnhancer, ReasoningLevel
        >>>
        >>> client = BlossomClient()
        >>> enhancer = ReasoningEnhancer()
        >>>
        >>> # Enhance prompt with reasoning
        >>> enhanced = enhancer.enhance(
        ...     "How to optimize database queries?",
        ...     level=ReasoningLevel.HIGH
        ... )
        >>>
        >>> # Generate with enhanced prompt
        >>> response = await client.text.generate(enhanced, model="gemini")
        >>>
        >>> # Extract reasoning from response
        >>> result = enhancer.extract_reasoning(response)
        >>> print(result['reasoning'])
        >>> print(result['answer'])
    """

    def __init__(
        self,
        default_config: Optional[ReasoningConfig] = None,
        logger: Optional[LoggerProtocol] = None
    ) -> None:
        """
        Initialize reasoning enhancer.

        Args:
            default_config: Default configuration for reasoning
            logger: Optional logger instance
        """
        self.default_config = default_config or ReasoningConfig()
        self.logger = logger or StructuredLogger("reasoning")

        self.logger.info(
            "ReasoningEnhancer initialized",
            default_level=self.default_config.level.value
        )

    def enhance(
        self,
        prompt: str,
        level: Optional[Union[str, ReasoningLevel]] = None,
        config: Optional[ReasoningConfig] = None,
        context: Optional[str] = None,
        examples: Optional[List[str]] = None
    ) -> str:
        """
        Enhance a prompt with reasoning instructions.

        Args:
            prompt: Original user prompt
            level: Reasoning level (overrides config)
            config: Custom reasoning configuration
            context: Additional context to include
            examples: Example reasoning patterns

        Returns:
            Enhanced prompt with reasoning instructions

        Example:
            >>> enhancer = ReasoningEnhancer()
            >>> enhanced = enhancer.enhance(
            ...     "Explain quantum computing",
            ...     level="high",
            ...     context="For undergraduate students",
            ...     examples=["Use analogies", "Build from basics"]
            ... )
        """
        # Use provided config or default
        cfg = config or self.default_config

        # Determine reasoning level
        if level is None:
            level = cfg.level
        elif isinstance(level, str):
            level = ReasoningLevel(level.lower())

        # Adaptive level detection
        if level == ReasoningLevel.ADAPTIVE:
            level = self._determine_adaptive_level(prompt)
            self.logger.debug(
                "Adaptive level determined",
                level=level.value,
                prompt_length=len(prompt)
            )

        # Build enhanced prompt
        enhanced = self._build_enhanced_prompt(
            prompt=prompt,
            level=level,
            config=cfg,
            context=context,
            examples=examples
        )

        self.logger.info(
            "Prompt enhanced",
            original_length=len(prompt),
            enhanced_length=len(enhanced),
            level=level.value
        )

        return enhanced

    def _build_enhanced_prompt(
        self,
        prompt: str,
        level: ReasoningLevel,
        config: ReasoningConfig,
        context: Optional[str],
        examples: Optional[List[str]]
    ) -> str:
        """Build the complete enhanced prompt."""
        parts = []

        # Add context if provided
        if context:
            parts.append(f"Context: {context}\n")

        # Add examples if provided
        if examples:
            parts.append("Example reasoning patterns:")
            for i, example in enumerate(examples, 1):
                parts.append(f"Example {i}: {example}")
            parts.append("")

        # Add reasoning prompt template
        parts.append(_REASONING_PROMPTS[level])
        parts.append("")

        # Add original prompt
        parts.append(f"User question: {prompt}")

        # Add special instructions based on config
        instructions = []

        if config.include_confidence and level in [ReasoningLevel.MEDIUM, ReasoningLevel.HIGH]:
            instructions.append("[Include confidence level: LOW/MEDIUM/HIGH]")

        if config.alternative_approaches and level == ReasoningLevel.HIGH:
            instructions.append("[Consider at least 2-3 different approaches]")

        if config.self_critique and level == ReasoningLevel.HIGH:
            instructions.append("[Critically evaluate your own reasoning]")

        if config.step_verification:
            instructions.append("[Verify each logical step]")

        if instructions:
            parts.append("\n" + "\n".join(instructions))

        return "\n".join(parts)

    def _determine_adaptive_level(self, prompt: str) -> ReasoningLevel:
        """
        Automatically determine reasoning level based on prompt complexity.

        Analyzes:
        - Prompt length
        - Complexity indicators
        - Question types
        """
        prompt_lower = prompt.lower()

        # High complexity indicators
        high_indicators = [
            'explain', 'analyze', 'compare', 'evaluate', 'design',
            'architecture', 'optimize', 'debug', 'algorithm',
            'trade-off', 'consider', 'pros and cons', 'best practice',
            'why', 'how does', 'what if'
        ]

        # Low complexity indicators
        low_indicators = [
            'what is', 'define', 'list', 'name',
            'when was', 'who is', 'where is'
        ]

        # Count indicators
        high_count = sum(1 for ind in high_indicators if ind in prompt_lower)
        low_count = sum(1 for ind in low_indicators if ind in prompt_lower)

        # Decision logic
        if high_count >= 2 or (len(prompt) > 200 and high_count >= 1):
            return ReasoningLevel.HIGH
        elif low_count >= 1 and high_count == 0 and len(prompt) < 50:
            return ReasoningLevel.LOW
        else:
            return ReasoningLevel.MEDIUM

    def extract_reasoning(self, response: str) -> Dict[str, Any]:
        """
        Extract reasoning sections from AI response.

        Args:
            response: Full AI response with reasoning

        Returns:
            Dictionary with:
                - reasoning: Extracted reasoning text (or None)
                - answer: Final answer text
                - confidence: Confidence level if present (or None)

        Example:
            >>> response = await client.text.generate(enhanced_prompt)
            >>> result = enhancer.extract_reasoning(response)
            >>> print(f"Reasoning: {result['reasoning']}")
            >>> print(f"Answer: {result['answer']}")
            >>> print(f"Confidence: {result['confidence']}")
        """
        result = {
            'reasoning': None,
            'answer': response,
            'confidence': None
        }

        # Extract <reasoning> section
        if '<reasoning>' in response:
            try:
                start = response.index('<reasoning>') + len('<reasoning>')
                end = response.index('</reasoning>')
                result['reasoning'] = response[start:end].strip()
                result['answer'] = response[end + len('</reasoning>'):].strip()
            except ValueError:
                self.logger.warning("Malformed <reasoning> tags in response")

        # Extract <deep_reasoning> section
        if '<deep_reasoning>' in response:
            try:
                start = response.index('<deep_reasoning>') + len('<deep_reasoning>')
                end = response.index('</deep_reasoning>')
                result['reasoning'] = response[start:end].strip()
                result['answer'] = response[end + len('</deep_reasoning>'):].strip()
            except ValueError:
                self.logger.warning("Malformed <deep_reasoning> tags in response")

        # Extract confidence level (flexible matching)
        response_upper = response.upper()
        for conf_level in ['HIGH', 'MEDIUM', 'LOW']:
            # Match patterns like: "confidence: HIGH", "confidence HIGH", "CONFIDENCE: HIGH"
            patterns = [
                f'CONFIDENCE: {conf_level}',
                f'CONFIDENCE {conf_level}',
                f'CONFIDENCE:{conf_level}',
            ]
            if any(pattern in response_upper for pattern in patterns):
                result['confidence'] = conf_level
                break

        return result


class ReasoningChain:
    """
    Multi-step reasoning chain for complex problems.

    Breaks down complex problems into steps, applying reasoning at each stage.

    Example:
        >>> from blossom_ai import BlossomClient
        >>> from blossom_ai.utils.reasoning import ReasoningChain, ReasoningLevel
        >>>
        >>> client = BlossomClient()
        >>> chain = ReasoningChain(client.text)
        >>>
        >>> result = await chain.solve(
        ...     "Design a scalable microservices architecture",
        ...     steps=["analyze", "design", "validate"],
        ...     level=ReasoningLevel.HIGH
        ... )
        >>>
        >>> for step in result['steps']:
        ...     print(f"{step['step']}: {step['output']}")
        >>> print(f"Final: {result['final_answer']}")
    """

    def __init__(
        self,
        text_generator,
        enhancer: Optional[ReasoningEnhancer] = None,
        logger: Optional[LoggerProtocol] = None
    ) -> None:
        """
        Initialize reasoning chain.

        Args:
            text_generator: TextGenerator instance from BlossomClient
            enhancer: Optional custom ReasoningEnhancer
            logger: Optional logger instance
        """
        self.generator = text_generator
        self.enhancer = enhancer or ReasoningEnhancer()
        self.logger = logger or StructuredLogger("reasoning_chain")

    async def solve(
        self,
        problem: str,
        steps: Optional[List[str]] = None,
        level: Union[str, ReasoningLevel] = ReasoningLevel.HIGH,
        model: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Solve problem through multi-step reasoning chain.

        Args:
            problem: Problem to solve
            steps: Custom steps or None for automatic ["understand", "plan", "execute", "verify"]
            level: Reasoning level for each step
            model: Model to use (optional)

        Returns:
            Dictionary with:
                - problem: Original problem
                - steps: List of step results with reasoning and output
                - final_answer: Synthesized final answer

        Example:
            >>> result = await chain.solve(
            ...     "How to implement authentication?",
            ...     steps=["analyze", "design", "security"],
            ...     level="high",
            ...     model="gemini"
            ... )
        """
        if isinstance(level, str):
            level = ReasoningLevel(level.lower())

        if steps is None:
            steps = ["understand", "plan", "execute", "verify"]

        self.logger.info(
            "Starting reasoning chain",
            problem=problem[:100],
            num_steps=len(steps),
            level=level.value
        )

        results = {
            'problem': problem,
            'steps': [],
            'final_answer': None
        }

        context = problem

        # Execute each reasoning step
        for i, step in enumerate(steps, 1):
            self.logger.debug(f"Executing step {i}/{len(steps)}", step=step)

            step_prompt = f"""
Step: {step.upper()}
Previous context: {context}

Please complete this reasoning step thoroughly.
"""

            # Enhance with reasoning
            enhanced = self.enhancer.enhance(
                step_prompt,
                level=level
            )

            # Generate response
            kwargs = {"model": model} if model else {}
            response = await self.generator.generate(enhanced, **kwargs)

            # Extract reasoning
            parsed = self.enhancer.extract_reasoning(response)

            results['steps'].append({
                'step': step,
                'reasoning': parsed['reasoning'],
                'output': parsed['answer'],
                'confidence': parsed['confidence']
            })

            # Update context for next step
            context = f"{context}\n\nStep '{step}' output:\n{parsed['answer']}"

        # Final synthesis
        self.logger.debug("Generating final synthesis")

        synthesis_prompt = f"""
Based on all previous reasoning steps, provide a comprehensive final answer to:
{problem}

Previous reasoning:
{context}

Synthesize the insights from all steps into a clear, actionable answer.
"""

        final_enhanced = self.enhancer.enhance(
            synthesis_prompt,
            level=level
        )

        kwargs = {"model": model} if model else {}
        final_response = await self.generator.generate(final_enhanced, **kwargs)

        results['final_answer'] = final_response

        self.logger.info("Reasoning chain completed", num_steps=len(steps))

        return results

    def solve_sync(
        self,
        problem: str,
        steps: Optional[List[str]] = None,
        level: Union[str, ReasoningLevel] = ReasoningLevel.HIGH,
        model: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Synchronous version of solve().

        See solve() for documentation.
        """
        import asyncio
        return asyncio.run(self.solve(problem, steps, level, model))


# Convenience functions

def create_reasoning_enhancer(
    level: str = "medium",
    **config_kwargs
) -> ReasoningEnhancer:
    """
    Create a reasoning enhancer with custom configuration.

    Args:
        level: Default reasoning level ("low", "medium", "high", "adaptive")
        **config_kwargs: Additional ReasoningConfig parameters

    Returns:
        Configured ReasoningEnhancer instance

    Example:
        >>> enhancer = create_reasoning_enhancer(
        ...     level="high",
        ...     include_confidence=True,
        ...     self_critique=True
        ... )
    """
    config = ReasoningConfig(
        level=ReasoningLevel(level),
        **config_kwargs
    )
    return ReasoningEnhancer(default_config=config)


def quick_enhance(
    prompt: str,
    level: str = "medium"
) -> str:
    """
    Quick one-liner to enhance a prompt with reasoning.

    Args:
        prompt: Prompt to enhance
        level: Reasoning level

    Returns:
        Enhanced prompt

    Example:
        >>> from blossom_ai.utils.reasoning import quick_enhance
        >>> enhanced = quick_enhance("Explain AI", level="high")
        >>> response = await client.text.generate(enhanced)
    """
    enhancer = ReasoningEnhancer()
    return enhancer.enhance(prompt, level=level)


__all__ = [
    "ReasoningEnhancer",
    "ReasoningChain",
    "ReasoningLevel",
    "ReasoningConfig",
    "create_reasoning_enhancer",
    "quick_enhance",
]