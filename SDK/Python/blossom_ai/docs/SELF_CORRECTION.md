# 🔧 Self-Correction Systems Guide

> **Build AI systems that can recognize and correct their own mistakes**

---

## Overview

This guide covers implementing self-correction mechanisms with Blossom AI, enabling systems to detect errors, evaluate their own outputs, and improve responses automatically.

---

## Why Self-Correction?

### Benefits
- **Improved Accuracy**: Catch and fix errors automatically
- **Reliability**: More dependable AI responses
- **Learning**: Systems that improve over time
- **Quality Assurance**: Built-in validation mechanisms

---

## Basic Self-Correction Patterns

### 1. Simple Self-Evaluation

```python
import asyncio
from typing import Dict, Any, Optional
from blossom_ai import BlossomClient, SessionConfig
import json
import re

class SelfCorrectingSystem:
    """Basic self-correction system."""
    
    def __init__(self, config: SessionConfig = None):
        self.config = config or SessionConfig(
            timeout=120.0,
            sync_pool_connections=10,
            async_limit_total=50
        )
    
    async def generate_with_self_correction(
        self,
        prompt: str,
        max_corrections: int = 2
    ) -> Dict[str, Any]:
        """Generate response with self-correction."""
        
        corrections = []
        current_response = None
        
        async with BlossomClient(config=self.config) as client:
            for attempt in range(max_corrections + 1):
                if attempt == 0:
                    # Initial generation
                    current_response = await client.text.generate(prompt)
                else:
                    # Correct previous response
                    correction_prompt = f"""
                    Previous attempt:
                    {current_response}
                    
                    Please review and correct any errors or improvements needed.
                    Return the corrected version.
                    """
                    
                    current_response = await client.text.generate(correction_prompt)
                
                # Evaluate response
                evaluation = await self._evaluate_response(
                    client,
                    prompt,
                    current_response
                )
                
                correction_data = {
                    'attempt': attempt + 1,
                    'response': current_response,
                    'evaluation': evaluation,
                    'timestamp': time.time()
                }
                
                corrections.append(correction_data)
                
                # Check if response is good enough
                if evaluation['score'] >= 0.8 or attempt >= max_corrections:
                    break
        
        return {
            'final_response': current_response,
            'total_corrections': len(corrections) - 1,
            'corrections': corrections,
            'final_score': corrections[-1]['evaluation']['score']
        }
    
    async def _evaluate_response(
        self,
        client: BlossomClient,
        prompt: str,
        response: str
    ) -> Dict[str, Any]:
        """Evaluate quality of response."""
        
        evaluation_prompt = f"""
        Evaluate the following response to the given prompt:
        
        Prompt: {prompt}
        Response: {response}
        
        Rate the response on these criteria (1-10 scale):
        1. Accuracy (correctness of information)
        2. Completeness (addresses all parts of prompt)
        3. Clarity (easy to understand)
        4. Relevance (on-topic)
        5. Structure (well-organized)
        
        Return ONLY a JSON object with these scores:
        {{
            "accuracy": <score>,
            "completeness": <score>,
            "clarity": <score>,
            "relevance": <score>,
            "structure": <score>
        }}}
        """
        
        evaluation_text = await client.text.generate(evaluation_prompt)
        
        try:
            # Extract JSON from response
            json_match = re.search(r'\{.*?\}', evaluation_text, re.DOTALL)
            if json_match:
                scores = json.loads(json_match.group())
            else:
                scores = {}
            
            # Calculate overall score
            valid_scores = [v for v in scores.values() if isinstance(v, (int, float))]
            overall_score = sum(valid_scores) / (len(valid_scores) * 10) if valid_scores else 0.5
            
            return {
                'scores': scores,
                'overall_score': overall_score,
                'feedback': self._generate_feedback(scores)
            }
        
        except Exception:
            return {
                'scores': {},
                'overall_score': 0.5,
                'feedback': 'Evaluation failed'
            }
    
    def _generate_feedback(self, scores: Dict[str, float]) -> str:
        """Generate feedback based on scores."""
        
        feedback_parts = []
        
        for criterion, score in scores.items():
            if score < 7:
                feedback_parts.append(f"Improve {criterion}")
        
        return "; ".join(feedback_parts) if feedback_parts else "Good overall"
    
    async def correct_factual_errors(
        self,
        text: str,
        topic: str = "general"
    ) -> Dict[str, Any]:
        """Correct factual errors in text."""
        
        async with BlossomClient(config=self.config) as client:
            # Step 1: Identify potential errors
            identify_prompt = f"""
            Review the following text for factual errors related to {topic}:
            
            {text}
            
            List any factual errors you find. If no errors, say "No errors found".
            Be specific about what is incorrect.
            """
            
            error_analysis = await client.text.generate(identify_prompt)
            
            if "No errors found" in error_analysis or "no errors" in error_analysis.lower():
                return {
                    'original_text': text,
                    'corrected_text': text,
                    'errors_found': 0,
                    'corrections': []
                }
            
            # Step 2: Correct identified errors
            correct_prompt = f"""
            Original text: {text}
            
            Identified errors: {error_analysis}
            
            Provide a corrected version of the text with all factual errors fixed.
            Maintain the original structure and style as much as possible.
            """
            
            corrected_text = await client.text.generate(correct_prompt)
            
            return {
                'original_text': text,
                'corrected_text': corrected_text,
                'errors_found': error_analysis.count('Error') + error_analysis.count('error'),
                'error_analysis': error_analysis,
                'corrections': []
            }
    
    async def improve_clarity(
        self,
        text: str,
        target_audience: str = "general"
    ) -> Dict[str, Any]:
        """Improve clarity and readability."""
        
        async with BlossomClient(config=self.config) as client:
            clarity_prompt = f"""
            Improve the clarity and readability of this text for a {target_audience} audience:
            
            Original: {text}
            
            Requirements:
            - Use simpler language where possible
            - Improve sentence structure
            - Maintain accuracy
            - Keep similar length
            
            Improved version:
            """
            
            improved = await client.text.generate(clarity_prompt)
            
            # Evaluate improvement
            original_clarity = await self._assess_clarity(client, text)
            improved_clarity = await self._assess_clarity(client, improved)
            
            return {
                'original_text': text,
                'improved_text': improved,
                'original_clarity_score': original_clarity,
                'improved_clarity_score': improved_clarity,
                'improvement': improved_clarity - original_clarity
            }
    
    async def _assess_clarity(self, client: BlossomClient, text: str) -> float:
        """Assess clarity of text."""
        
        clarity_prompt = f"""
        Rate the clarity of this text (0.0 to 1.0):
        
        {text}
        
        Return only the numerical score.
        """
        
        score_text = await client.text.generate(clarity_prompt)
        
        score_match = re.search(r'0?\.\d+', score_text)
        return float(score_match.group()) if score_match else 0.5

# Usage
async def basic_self_correction():
    """Demonstrate basic self-correction."""
    
    system = SelfCorrectingSystem()
    
    # Generate with self-correction
    result = await system.generate_with_self_correction(
        "Write a brief explanation of quantum computing for beginners.",
        max_corrections=2
    )
    
    print("Self-Correction Result:")
    print(f"Final Response: {result['final_response'][:200]}...")
    print(f"Total Corrections: {result['total_corrections']}")
    print(f"Final Score: {result['final_score']:.2f}")
```

---

### 2. Multi-Stage Correction Pipeline

```python
import asyncio
from typing import Dict, Any, List, Callable
from dataclasses import dataclass
from blossom_ai import BlossomClient, SessionConfig
import json

@dataclass
class CorrectionStage:
    """Stage in the correction pipeline."""
    name: str
    check_func: Callable
    correct_func: Callable
    threshold: float = 0.7

class MultiStageSelfCorrector:
    """Multi-stage self-correction system."""
    
    def __init__(self, config: SessionConfig = None):
        self.config = config or SessionConfig(
            timeout=180.0,
            sync_pool_connections=15,
            async_limit_total=75
        )
        self.stages = []
    
    def add_stage(self, stage: CorrectionStage):
        """Add a correction stage."""
        self.stages.append(stage)
    
    async def process_with_full_correction(
        self,
        initial_input: str,
        max_iterations: int = 3
    ) -> Dict[str, Any]:
        """Process input through full correction pipeline."""
        
        corrections = []
        current_output = initial_input
        
        async with BlossomClient(config=self.config) as client:
            for iteration in range(max_iterations):
                iteration_corrections = []
                
                # Apply each correction stage
                for stage in self.stages:
                    # Check if correction is needed
                    check_result = await stage.check_func(client, current_output)
                    
                    if check_result['score'] < stage.threshold:
                        # Apply correction
                        corrected = await stage.correct_func(
                            client,
                            current_output,
                            check_result
                        )
                        
                        correction_data = {
                            'stage': stage.name,
                            'iteration': iteration + 1,
                            'before': current_output,
                            'after': corrected,
                            'check_result': check_result,
                            'timestamp': time.time()
                        }
                        
                        iteration_corrections.append(correction_data)
                        current_output = corrected
                
                corrections.extend(iteration_corrections)
                
                # If no corrections needed, we're done
                if not iteration_corrections:
                    break
        
        return {
            'final_output': current_output,
            'total_corrections': len(corrections),
            'iterations': iteration + 1,
            'corrections': corrections,
            'quality_improved': len(corrections) > 0
        }
    
    async def add_fact_checking_stage(self):
        """Add fact-checking correction stage."""
        
        async def check_facts(client: BlossomClient, text: str) -> Dict[str, Any]:
            prompt = f"""
            Check the following text for factual accuracy:
            
            {text}
            
            Rate accuracy from 0.0 to 1.0 where:
            1.0 = completely accurate
            0.0 = completely inaccurate
            
            Return only the numerical score.
            """
            
            score_text = await client.text.generate(prompt)
            score_match = re.search(r'0?\.\d+', score_text)
            score = float(score_match.group()) if score_match else 0.5
            
            return {'score': score, 'type': 'fact_check'}
        
        async def correct_facts(
            client: BlossomClient,
            text: str,
            check_result: Dict[str, Any]
        ) -> str:
            if check_result['score'] >= 0.7:
                return text
            
            correction_prompt = f"""
            Correct any factual errors in this text:
            
            {text}
            
            Return the corrected version.
            """
            
            return await client.text.generate(correction_prompt)
        
        self.add_stage(CorrectionStage(
            name="fact_checking",
            check_func=check_facts,
            correct_func=correct_facts,
            threshold=0.8
        ))
    
    async def add_clarity_stage(self):
        """Add clarity improvement stage."""
        
        async def check_clarity(client: BlossomClient, text: str) -> Dict[str, Any]:
            prompt = f"""
            Rate the clarity of this text (0.0 to 1.0):
            
            {text}
            
            Return only the numerical score.
            """
            
            score_text = await client.text.generate(prompt)
            score_match = re.search(r'0?\.\d+', score_text)
            score = float(score_match.group()) if score_match else 0.5
            
            return {'score': score, 'type': 'clarity_check'}
        
        async def improve_clarity(
            client: BlossomClient,
            text: str,
            check_result: Dict[str, Any]
        ) -> str:
            if check_result['score'] >= 0.7:
                return text
            
            improvement_prompt = f"""
            Improve the clarity and readability of this text:
            
            {text}
            
            Make it clearer and easier to understand while maintaining accuracy.
            """
            
            return await client.text.generate(improvement_prompt)
        
        self.add_stage(CorrectionStage(
            name="clarity",
            check_func=check_clarity,
            correct_func=improve_clarity,
            threshold=0.7
        ))
    
    async def add_completeness_stage(self):
        """Add completeness check stage."""
        
        async def check_completeness(client: BlossomClient, text: str) -> Dict[str, Any]:
            prompt = f"""
            Rate the completeness of this response (0.0 to 1.0):
            
            {text}
            
            Return only the numerical score.
            """
            
            score_text = await client.text.generate(prompt)
            score_match = re.search(r'0?\.\d+', score_text)
            score = float(score_match.group()) if score_match else 0.5
            
            return {'score': score, 'type': 'completeness_check'}
        
        async def improve_completeness(
            client: BlossomClient,
            text: str,
            check_result: Dict[str, Any]
        ) -> str:
            if check_result['score'] >= 0.8:
                return text
            
            improvement_prompt = f"""
            Make this response more complete and comprehensive:
            
            {text}
            
            Add any missing important information or details.
            """
            
            return await client.text.generate(improvement_prompt)
        
        self.add_stage(CorrectionStage(
            name="completeness",
            check_func=check_completeness,
            correct_func=improve_completeness,
            threshold=0.8
        ))

# Usage
async def multi_stage_correction():
    """Demonstrate multi-stage self-correction."""
    
    corrector = MultiStageSelfCorrector()
    
    # Add correction stages
    await corrector.add_fact_checking_stage()
    await corrector.add_clarity_stage()
    await corrector.add_completeness_stage()
    
    # Process with full correction
    result = await corrector.process_with_full_correction(
        "Quantum computers use qubits that can be 0, 1, or both at the same time due to superposition.",
        max_iterations=2
    )
    
    print("Multi-Stage Correction Result:")
    print(f"Final Output: {result['final_output']}")
    print(f"Total Corrections: {result['total_corrections']}")
    print(f"Iterations: {result['iterations']}")
```

---

## Advanced Self-Correction Patterns

### 3. Learning from Mistakes

```python
import asyncio
from typing import Dict, Any, List
from dataclasses import dataclass
from blossom_ai import BlossomClient, SessionConfig
import json
import time

@dataclass
class CorrectionExample:
    """Example of a correction for learning."""
    original: str
    corrected: str
    mistake_type: str
    context: str
    timestamp: float

class LearningSelfCorrector:
    """Self-corrector that learns from past mistakes."""
    
    def __init__(self, config: SessionConfig = None):
        self.config = config or SessionConfig(
            timeout=150.0,
            sync_pool_connections=15,
            async_limit_total=75
        )
        self.correction_history = []
        self.mistake_patterns = {}
    
    async def generate_with_learning(
        self,
        prompt: str,
        context: str = "",
        use_history: bool = True
    ) -> Dict[str, Any]:
        """Generate response while learning from past corrections."""
        
        async with BlossomClient(config=self.config) as client:
            # Use historical corrections to improve generation
            if use_history and self.correction_history:
                guidance = await self._generate_guidance_from_history(
                    client,
                    prompt,
                    context
                )
                
                enhanced_prompt = f"""
                {prompt}
                
                Guidelines based on past corrections:
                {guidance}
                
                Please avoid these common mistakes and follow the guidelines.
                """
            else:
                enhanced_prompt = prompt
            
            # Generate initial response
            response = await client.text.generate(enhanced_prompt)
            
            # Apply self-correction
            correction_result = await self._apply_self_correction(
                client,
                response,
                prompt,
                context
            )
            
            # Learn from this correction
            if correction_result['was_corrected']:
                await self._learn_from_correction(
                    correction_result['original'],
                    correction_result['corrected'],
                    correction_result['mistake_types'],
                    context
                )
            
            return {
                'final_response': correction_result['corrected'],
                'original_response': correction_result['original'],
                'was_corrected': correction_result['was_corrected'],
                'mistake_types': correction_result['mistake_types'],
                'guidance_used': use_history and self.correction_history,
                'learning_applied': len(self.correction_history)
            }
    
    async def _generate_guidance_from_history(
        self,
        client: BlossomClient,
        prompt: str,
        context: str
    ) -> str:
        """Generate guidance from historical corrections."""
        
        # Get relevant historical examples
        relevant_examples = await self._find_relevant_examples(prompt, context)
        
        if not relevant_examples:
            return "No specific guidance available."
        
        # Generate guidance
        examples_text = "\n\n".join([
            f"Mistake type: {ex.mistake_type}\n"
            f"Original: {ex.original[:200]}...\n"
            f"Corrected: {ex.corrected[:200]}..."
            for ex in relevant_examples[:3]
        ])
        
        guidance_prompt = f"""
        Based on these past corrections, generate guidance for avoiding similar mistakes:
        
        {examples_text}
        
        Provide 3-5 specific guidelines to follow.
        """
        
        return await client.text.generate(guidance_prompt)
    
    async def _find_relevant_examples(
        self,
        prompt: str,
        context: str
    ) -> List[CorrectionExample]:
        """Find relevant historical correction examples."""
        
        # Simple keyword matching (in production, use more sophisticated methods)
        keywords = set(prompt.lower().split() + context.lower().split())
        
        relevant = []
        for example in self.correction_history:
            example_text = f"{example.original} {example.corrected} {example.context}".lower()
            
            if any(keyword in example_text for keyword in keywords):
                relevant.append(example)
        
        return relevant[:5]  # Limit to top 5
    
    async def _apply_self_correction(
        self,
        client: BlossomClient,
        response: str,
        prompt: str,
        context: str
    ) -> Dict[str, Any]:
        """Apply self-correction to response."""
        
        # Check for various types of errors
        checks = [
            self._check_factual_accuracy(client, response),
            self._check_clarity(client, response),
            self._check_completeness(client, response, prompt),
            self._check_relevance(client, response, prompt)
        ]
        
        check_results = await asyncio.gather(*checks)
        
        # Determine what needs correction
        corrections_needed = []
        for i, result in enumerate(check_results):
            if result['score'] < 0.7:
                corrections_needed.append((i, result))
        
        if not corrections_needed:
            return {
                'original': response,
                'corrected': response,
                'was_corrected': False,
                'mistake_types': []
            }
        
        # Apply corrections
        corrected_response = response
        mistake_types = []
        
        for check_type, check_result in corrections_needed:
            if check_type == 0:  # Factual accuracy
                corrected_response = await self._correct_facts(
                    client,
                    corrected_response,
                    check_result
                )
                mistake_types.append('factual_error')
            
            elif check_type == 1:  # Clarity
                corrected_response = await self._improve_clarity(
                    client,
                    corrected_response,
                    check_result
                )
                mistake_types.append('clarity_issue')
            
            elif check_type == 2:  # Completeness
                corrected_response = await self._improve_completeness(
                    client,
                    corrected_response,
                    check_result,
                    prompt
                )
                mistake_types.append('incomplete_response')
            
            elif check_type == 3:  # Relevance
                corrected_response = await self._improve_relevance(
                    client,
                    corrected_response,
                    check_result,
                    prompt
                )
                mistake_types.append('relevance_issue')
        
        return {
            'original': response,
            'corrected': corrected_response,
            'was_corrected': True,
            'mistake_types': mistake_types
        }
    
    async def _check_factual_accuracy(self, client: BlossomClient, text: str) -> Dict[str, Any]:
        """Check factual accuracy."""
        
        prompt = f"Rate the factual accuracy (0.0-1.0): {text[:500]}..."
        score_text = await client.text.generate(prompt)
        score_match = re.search(r'0?\.\d+', score_text)
        score = float(score_match.group()) if score_match else 0.5
        
        return {'score': score, 'type': 'factual_accuracy'}
    
    async def _check_clarity(self, client: BlossomClient, text: str) -> Dict[str, Any]:
        """Check clarity."""
        
        prompt = f"Rate the clarity (0.0-1.0): {text[:500]}..."
        score_text = await client.text.generate(prompt)
        score_match = re.search(r'0?\.\d+', score_text)
        score = float(score_match.group()) if score_match else 0.5
        
        return {'score': score, 'type': 'clarity'}
    
    async def _check_completeness(
        self,
        client: BlossomClient,
        text: str,
        prompt: str
    ) -> Dict[str, Any]:
        """Check completeness."""
        
        completeness_prompt = f"""
        Rate completeness (0.0-1.0):
        Prompt: {prompt}
        Response: {text[:500]}...
        """
        
        score_text = await client.text.generate(completeness_prompt)
        score_match = re.search(r'0?\.\d+', score_text)
        score = float(score_match.group()) if score_match else 0.5
        
        return {'score': score, 'type': 'completeness'}
    
    async def _check_relevance(
        self,
        client: BlossomClient,
        text: str,
        prompt: str
    ) -> Dict[str, Any]:
        """Check relevance."""
        
        relevance_prompt = f"""
        Rate relevance (0.0-1.0):
        Prompt: {prompt}
        Response: {text[:500]}...
        """
        
        score_text = await client.text.generate(relevance_prompt)
        score_match = re.search(r'0?\.\d+', score_text)
        score = float(score_match.group()) if score_match else 0.5
        
        return {'score': score, 'type': 'relevance'}
    
    async def _correct_facts(
        self,
        client: BlossomClient,
        text: str,
        check_result: Dict[str, Any]
    ) -> str:
        """Correct factual errors."""
        
        correction_prompt = f"Correct factual errors: {text}"
        return await client.text.generate(correction_prompt)
    
    async def _improve_clarity(
        self,
        client: BlossomClient,
        text: str,
        check_result: Dict[str, Any]
    ) -> str:
        """Improve clarity."""
        
        clarity_prompt = f"Improve clarity: {text}"
        return await client.text.generate(clarity_prompt)
    
    async def _improve_completeness(
        self,
        client: BlossomClient,
        text: str,
        check_result: Dict[str, Any],
        prompt: str
    ) -> str:
        """Improve completeness."""
        
        completeness_prompt = f"Make more complete: {text}"
        return await client.text.generate(completeness_prompt)
    
    async def _improve_relevance(
        self,
        client: BlossomClient,
        text: str,
        check_result: Dict[str, Any],
        prompt: str
    ) -> str:
        """Improve relevance."""
        
        relevance_prompt = f"Make more relevant to prompt: {text}"
        return await client.text.generate(relevance_prompt)
    
    async def _learn_from_correction(
        self,
        original: str,
        corrected: str,
        mistake_types: List[str],
        context: str
    ):
        """Learn from this correction for future use."""
        
        example = CorrectionExample(
            original=original,
            corrected=corrected,
            mistake_type=", ".join(mistake_types),
            context=context,
            timestamp=time.time()
        )
        
        self.correction_history.append(example)
        
        # Update mistake patterns
        for mistake_type in mistake_types:
            if mistake_type not in self.mistake_patterns:
                self.mistake_patterns[mistake_type] = 0
            self.mistake_patterns[mistake_type] += 1
    
    def get_learning_stats(self) -> Dict[str, Any]:
        """Get learning statistics."""
        
        return {
            'total_corrections': len(self.correction_history),
            'mistake_patterns': self.mistake_patterns,
            'recent_corrections': [
                {
                    'mistake_type': ex.mistake_type,
                    'timestamp': ex.timestamp
                }
                for ex in self.correction_history[-10:]
            ]
        }

# Usage
async def learning_self_correction():
    """Demonstrate learning self-correction."""
    
    corrector = LearningSelfCorrector()
    
    # Add some example corrections to history
    example = CorrectionExample(
        original="The speed of light is 300,000 km/s",
        corrected="The speed of light in vacuum is approximately 299,792,458 meters per second",
        mistake_type="factual_inaccuracy",
        context="physics education",
        timestamp=time.time()
    )
    corrector.correction_history.append(example)
    
    # Generate with learning
    result = await corrector.generate_with_learning(
        prompt="Explain the speed of light.",
        context="physics education"
    )
    
    print("Learning Self-Correction Result:")
    print(f"Final Response: {result['final_response'][:200]}...")
    print(f"Was Corrected: {result['was_corrected']}")
    print(f"Mistake Types: {result['mistake_types']}")
    
    # Show learning stats
    stats = corrector.get_learning_stats()
    print(f"\nLearning Stats:")
    print(f"Total Corrections: {stats['total_corrections']}")
    print(f"Mistake Patterns: {stats['mistake_patterns']}")
```

---

## Summary

Key self-correction patterns for Blossom AI:

1. **Self-Evaluation**: Systems that assess their own outputs
2. **Iterative Improvement**: Multiple rounds of correction
3. **Multi-Stage Pipelines**: Specialized correction stages
4. **Learning from Mistakes**: Improve based on past corrections
5. **Quality Metrics**: Quantitative assessment of improvements
6. **Error Detection**: Identify specific types of mistakes
7. **Automated Correction**: Fix errors without human intervention
8. **Pattern Recognition**: Learn common mistake patterns
9. **Adaptive Systems**: Adjust correction strategies over time
10. **Quality Assurance**: Built-in validation mechanisms

---

## See Also

- [Reasoning Systems](REASONING.md) - Structured reasoning approaches
- [Consensus Systems](CONSENSUS.md) - Multi-model consensus
- [Performance Guide](PERFORMANCE.md) - Performance optimization
- [Error Handling](ERROR_TYPES.md) - Comprehensive error management
- [Testing Guide](TESTING.md) - Testing self-correcting systems