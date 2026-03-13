# 🤝 Consensus Systems Guide

> **Build robust AI systems using multiple models and consensus mechanisms**

---

## Overview

This guide covers implementing consensus systems with Blossom AI, using multiple models, voting mechanisms, and ensemble methods to improve reliability and accuracy.

---

## Why Consensus?

### Benefits
- **Improved Accuracy**: Multiple perspectives reduce errors
- **Robustness**: Not dependent on single model failures
- **Confidence Scoring**: Quantified uncertainty
- **Error Detection**: Disagreements highlight potential issues

---

## Basic Consensus Patterns

### 1. Simple Model Voting

```python
import asyncio
from typing import Dict, Any, List, Optional
from blossom_ai import BlossomClient, SessionConfig
from collections import Counter
import re

class ModelConsensusSystem:
    """Basic consensus system using multiple model calls."""
    
    def __init__(self, config: SessionConfig = None):
        self.config = config or SessionConfig(
            timeout=120.0,
            sync_pool_connections=20,
            async_limit_total=100
        )
    
    async def consensus_generate(
        self,
        prompt: str,
        num_models: int = 3,
        consensus_method: str = "majority"
    ) -> Dict[str, Any]:
        """Generate response using model consensus."""
        
        async with BlossomClient(config=self.config) as client:
            # Generate responses from multiple "models"
            # In practice, these would be different model endpoints
            tasks = [
                self._generate_with_variation(client, prompt, i)
                for i in range(num_models)
            ]
            
            responses = await asyncio.gather(*tasks)
            
            # Apply consensus method
            if consensus_method == "majority":
                consensus_result = await self._majority_vote(responses)
            elif consensus_method == "weighted":
                consensus_result = await self._weighted_consensus(responses)
            elif consensus_method == "confidence":
                consensus_result = await self._confidence_based_consensus(responses)
            else:
                consensus_result = {
                    'consensus_response': responses[0],
                    'method': 'first_response',
                    'confidence': 0.5
                }
            
            return {
                'prompt': prompt,
                'individual_responses': responses,
                'consensus': consensus_result,
                'total_models': num_models,
                'consensus_method': consensus_method
            }
    
    async def _generate_with_variation(
        self,
        client: BlossomClient,
        prompt: str,
        variation: int
    ) -> Dict[str, Any]:
        """Generate response with slight variation."""
        
        # Add variation to prompt
        if variation > 0:
            varied_prompt = f"""
            {prompt}
            
            (Variation {variation + 1}: Consider this from a slightly different perspective)
            """
        else:
            varied_prompt = prompt
        
        response = await client.text.generate(varied_prompt)
        
        return {
            'model_id': f'model_{variation + 1}',
            'response': response,
            'variation': variation + 1,
            'timestamp': time.time()
        }
    
    async def _majority_vote(self, responses: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Apply majority voting consensus."""
        
        # Extract key answers (for multiple choice or classification)
        answers = []
        for resp in responses:
            answer = self._extract_key_answer(resp['response'])
            answers.append(answer)
        
        # Find most common answer
        answer_counts = Counter(answers)
        most_common = answer_counts.most_common(1)[0]
        
        consensus_answer = most_common[0]
        confidence = most_common[1] / len(responses)
        
        # Find response that matches consensus
        consensus_response = next(
            resp for resp in responses
            if self._extract_key_answer(resp['response']) == consensus_answer
        )
        
        return {
            'consensus_response': consensus_response['response'],
            'consensus_answer': consensus_answer,
            'confidence': confidence,
            'method': 'majority_vote',
            'vote_distribution': dict(answer_counts)
        }
    
    async def _weighted_consensus(self, responses: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Apply weighted consensus based on response quality."""
        
        # Evaluate each response
        evaluations = []
        for resp in responses:
            evaluation = await self._evaluate_response_quality(resp['response'])
            evaluations.append({
                'response': resp,
                'score': evaluation['score']
            })
        
        # Select best response
        best_response = max(evaluations, key=lambda x: x['score'])
        
        return {
            'consensus_response': best_response['response']['response'],
            'confidence': best_response['score'],
            'method': 'weighted_consensus',
            'scores': [e['score'] for e in evaluations]
        }
    
    async def _confidence_based_consensus(
        self,
        responses: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Apply confidence-based consensus."""
        
        # Extract confidence from each response
        confidences = []
        for resp in responses:
            confidence = self._extract_confidence(resp['response'])
            confidences.append(confidence)
        
        # Weight responses by confidence
        total_confidence = sum(confidences)
        
        if total_confidence > 0:
            # Weighted selection
            import random
            weights = [c / total_confidence for c in confidences]
            selected_idx = random.choices(range(len(responses)), weights=weights)[0]
            consensus_response = responses[selected_idx]
            confidence = confidences[selected_idx]
        else:
            # Fallback to first response
            consensus_response = responses[0]
            confidence = 0.5
        
        return {
            'consensus_response': consensus_response['response'],
            'confidence': confidence,
            'method': 'confidence_based',
            'confidences': confidences
        }
    
    def _extract_key_answer(self, response: str) -> str:
        """Extract key answer from response."""
        
        # Look for clear answers
        patterns = [
            r'The answer is[:\s]+(.+?)(?:\n|$)',
            r'Answer[:\s]+(.+?)(?:\n|$)',
            r'Final answer[:\s]+(.+?)(?:\n|$)',
            r'Result[:\s]+(.+?)(?:\n|$)'
        ]
        
        for pattern in patterns:
            match = re.search(pattern, response, re.IGNORECASE | re.MULTILINE)
            if match:
                return match.group(1).strip()
        
        # Fallback: return first sentence
        sentences = [s.strip() for s in response.split('.') if s.strip()]
        return sentences[0] if sentences else response
    
    async def _evaluate_response_quality(self, response: str) -> Dict[str, Any]:
        """Evaluate response quality."""
        
        # This would use a separate model or criteria
        # For now, return a simple heuristic
        length_score = min(len(response) / 500, 1.0)  # Prefer substantial responses
        structure_score = 1.0 if '\n' in response else 0.7  # Prefer structured responses
        
        overall_score = (length_score + structure_score) / 2
        
        return {
            'score': overall_score,
            'length_score': length_score,
            'structure_score': structure_score
        }
    
    def _extract_confidence(self, response: str) -> float:
        """Extract confidence from response."""
        
        # Look for confidence indicators
        confidence_patterns = [
            r'confidence[:\s]+(\d+)%',
            r'I am (\d+)% sure',
            r'certainty[:\s]+(\d+)%'
        ]
        
        for pattern in confidence_patterns:
            match = re.search(pattern, response, re.IGNORECASE)
            if match:
                return float(match.group(1)) / 100
        
        # Default confidence
        return 0.7

# Usage
async def basic_consensus_example():
    """Demonstrate basic consensus."""
    
    consensus_system = ModelConsensusSystem()
    
    # Multiple choice question
    prompt = """
    What is the primary cause of climate change?
    
    A. Solar radiation variations
    B. Greenhouse gas emissions
    C. Volcanic activity
    D. Earth's orbital changes
    
    Think step by step and provide the correct answer.
    """
    
    result = await consensus_system.consensus_generate(
        prompt,
        num_models=5,
        consensus_method="majority"
    )
    
    print("Consensus Result:")
    print(f"Consensus Answer: {result['consensus']['consensus_answer']}")
    print(f"Confidence: {result['consensus']['confidence']:.2f}")
    print(f"Method: {result['consensus']['method']}")
    
    if 'vote_distribution' in result['consensus']:
        print("Vote Distribution:")
        for answer, count in result['consensus']['vote_distribution'].items():
            print(f"  {answer}: {count} votes")
```

---

### 2. Expert Panel Consensus

```python
import asyncio
from typing import Dict, Any, List
from dataclasses import dataclass
from blossom_ai import BlossomClient, SessionConfig
import json

@dataclass
class ExpertProfile:
    """Profile of an expert persona."""
    name: str
    expertise: str
    perspective: str
    background: str

class ExpertPanelConsensus:
    """Consensus system using expert personas."""
    
    def __init__(self, config: SessionConfig = None):
        self.config = config or SessionConfig(
            timeout=150.0,
            sync_pool_connections=15,
            async_limit_total=75
        )
        
        # Define expert profiles
        self.experts = [
            ExpertProfile(
                name="Dr. Technical",
                expertise="Technical Analysis",
                perspective="Precise and detail-oriented",
                background="Engineering background with focus on accuracy"
            ),
            ExpertProfile(
                name="Prof. Practical",
                expertise="Practical Applications",
                perspective="User-focused and pragmatic",
                background="Product development and user experience"
            ),
            ExpertProfile(
                name="Ms. Creative",
                expertise="Creative Solutions",
                perspective="Innovative and out-of-the-box thinking",
                background="Design thinking and creative problem solving"
            ),
            ExpertProfile(
                name="Dr. Cautious",
                expertise="Risk Assessment",
                perspective="Conservative and risk-aware",
                background="Safety engineering and risk management"
            )
        ]
    
    async def expert_consensus(
        self,
        problem: str,
        expert_names: List[str] = None
    ) -> Dict[str, Any]:
        """Get consensus from expert panel."""
        
        if expert_names is None:
            experts_to_use = self.experts
        else:
            experts_to_use = [ex for ex in self.experts if ex.name in expert_names]
        
        async with BlossomClient(config=self.config) as client:
            # Get opinions from each expert
            expert_opinions = []
            
            for expert in experts_to_use:
                opinion = await self._get_expert_opinion(
                    client,
                    expert,
                    problem
                )
                expert_opinions.append(opinion)
            
            # Analyze disagreements
            disagreement_analysis = await self._analyze_disagreements(
                client,
                expert_opinions,
                problem
            )
            
            # Generate consensus
            consensus = await self._generate_consensus(
                client,
                expert_opinions,
                problem
            )
            
            return {
                'problem': problem,
                'expert_opinions': expert_opinions,
                'disagreement_analysis': disagreement_analysis,
                'consensus': consensus,
                'total_experts': len(experts_to_use)
            }
    
    async def _get_expert_opinion(
        self,
        client: BlossomClient,
        expert: ExpertProfile,
        problem: str
    ) -> Dict[str, Any]:
        """Get opinion from specific expert."""
        
        expert_prompt = f"""
        You are {expert.name}, an expert in {expert.expertise}.
        
        Background: {expert.background}
        Perspective: {expert.perspective}
        
        Please provide your analysis of the following problem:
        
        {problem}
        
        Provide:
        1. Your analysis
        2. Your recommendation
        3. Your confidence level (0-100%)
        4. Key considerations from your expertise
        """
        
        response = await client.text.generate(expert_prompt)
        
        # Extract confidence
        confidence_match = re.search(r'(\d+)%', response)
        confidence = float(confidence_match.group(1)) / 100 if confidence_match else 0.7
        
        return {
            'expert': expert.name,
            'expertise': expert.expertise,
            'opinion': response,
            'confidence': confidence,
            'timestamp': time.time()
        }
    
    async def _analyze_disagreements(
        self,
        client: BlossomClient,
        opinions: List[Dict[str, Any]],
        problem: str
    ) -> Dict[str, Any]:
        """Analyze areas of disagreement among experts."""
        
        # Extract key points from each opinion
        opinions_text = "\n\n".join([
            f"{op['expert']} ({op['expertise']}): {op['opinion'][:200]}..."
            for op in opinions
        ])
        
        analysis_prompt = f"""
        Analyze the disagreements among these expert opinions:
        
        {opinions_text}
        
        Problem: {problem}
        
        Identify:
        1. Main areas of agreement
        2. Main areas of disagreement
        3. Sources of disagreement
        4. How to reconcile different viewpoints
        
        Provide a structured analysis.
        """
        
        analysis = await client.text.generate(analysis_prompt)
        
        return {
            'analysis': analysis,
            'confidence_variance': self._calculate_confidence_variance(opinions),
            'areas_of_agreement': len([op for op in opinions if op['confidence'] > 0.8]),
            'areas_of_disagreement': len([op for op in opinions if op['confidence'] < 0.6])
        }
    
    async def _generate_consensus(
        self,
        client: BlossomClient,
        opinions: List[Dict[str, Any]],
        problem: str
    ) -> Dict[str, Any]:
        """Generate consensus from expert opinions."""
        
        # Prepare opinions summary
        opinions_summary = "\n\n".join([
            f"{op['expert']} (confidence: {op['confidence']*100:.0f}%):\n{op['opinion'][:300]}..."
            for op in opinions
        ])
        
        consensus_prompt = f"""
        Synthesize a consensus recommendation from these expert opinions:
        
        {opinions_summary}
        
        Problem: {problem}
        
        Provide:
        1. Consensus recommendation
        2. Key points of agreement
        3. Areas requiring further consideration
        4. Confidence level of consensus
        5. Next steps
        """
        
        consensus_response = await client.text.generate(consensus_prompt)
        
        # Extract consensus confidence
        confidence_match = re.search(r'(\d+)%', consensus_response)
        consensus_confidence = float(confidence_match.group(1)) / 100 if confidence_match else 0.7
        
        return {
            'recommendation': consensus_response,
            'confidence': consensus_confidence,
            'expert_count': len(opinions),
            'average_expert_confidence': sum(op['confidence'] for op in opinions) / len(opinions)
        }
    
    def _calculate_confidence_variance(self, opinions: List[Dict[str, Any]]) -> float:
        """Calculate variance in expert confidence."""
        
        confidences = [op['confidence'] for op in opinions]
        mean_confidence = sum(confidences) / len(confidences)
        variance = sum((c - mean_confidence) ** 2 for c in confidences) / len(confidences)
        
        return variance

# Usage
async def expert_consensus_example():
    """Demonstrate expert consensus."""
    
    consensus_system = ExpertPanelConsensus()
    
    problem = """
    A tech startup needs to choose their primary cloud infrastructure provider.
    They need reliability, scalability, and cost-effectiveness for a SaaS product.
    Which provider should they choose and why?
    """
    
    result = await consensus_system.expert_consensus(problem)
    
    print("Expert Consensus Result:")
    print(f"Consensus Confidence: {result['consensus']['confidence']:.2f}")
    print(f"Average Expert Confidence: {result['consensus']['average_expert_confidence']:.2f}")
    print(f"\nRecommendation:\n{result['consensus']['recommendation'][:300]}...")
    
    print(f"\nDisagreement Analysis:\n{result['disagreement_analysis']['analysis'][:200]}...")
```

---

## Advanced Consensus Mechanisms

### 3. Confidence-Weighted Consensus

```python
import asyncio
from typing import Dict, Any, List
from dataclasses import dataclass
from blossom_ai import BlossomClient, SessionConfig
import numpy as np

@dataclass
class ConfidenceWeightedResponse:
    """Response with confidence weighting."""
    response: str
    confidence: float
    model_id: str
    reasoning: str = ""

class ConfidenceWeightedConsensus:
    """Consensus system with confidence weighting."""
    
    def __init__(self, config: SessionConfig = None):
        self.config = config or SessionConfig(
            timeout=150.0,
            sync_pool_connections=15,
            async_limit_total=75
        )
    
    async def consensus_with_confidence(
        self,
        prompt: str,
        num_responses: int = 5,
        confidence_threshold: float = 0.6
    ) -> Dict[str, Any]:
        """Generate consensus using confidence weighting."""
        
        async with BlossomClient(config=self.config) as client:
            # Generate responses with confidence scores
            tasks = [
                self._generate_with_confidence(client, prompt, i)
                for i in range(num_responses)
            ]
            
            weighted_responses = await asyncio.gather(*tasks)
            
            # Filter low-confidence responses
            valid_responses = [
                resp for resp in weighted_responses
                if resp.confidence >= confidence_threshold
            ]
            
            if not valid_responses:
                # Use all responses if none meet threshold
                valid_responses = weighted_responses
            
            # Calculate weighted consensus
            consensus = await self._calculate_weighted_consensus(
                client,
                valid_responses,
                prompt
            )
            
            return {
                'prompt': prompt,
                'weighted_responses': weighted_responses,
                'valid_responses': valid_responses,
                'consensus': consensus,
                'confidence_threshold': confidence_threshold
            }
    
    async def _generate_with_confidence(
        self,
        client: BlossomClient,
        prompt: str,
        variation: int
    ) -> ConfidenceWeightedResponse:
        """Generate response with confidence assessment."""
        
        # Generate response
        if variation > 0:
            varied_prompt = f"""
            {prompt}
            
            (Approach {variation + 1}: Provide your answer with confidence assessment)
            """
        else:
            varied_prompt = f"""
            {prompt}
            
            Provide your answer and assess your confidence level (0-100%).
            """
        
        response = await client.text.generate(varied_prompt)
        
        # Extract confidence
        confidence = self._extract_confidence_from_response(response)
        
        # Extract reasoning if present
        reasoning = self._extract_reasoning(response)
        
        return ConfidenceWeightedResponse(
            response=response,
            confidence=confidence,
            model_id=f'model_{variation + 1}',
            reasoning=reasoning
        )
    
    def _extract_confidence_from_response(self, response: str) -> float:
        """Extract confidence score from response."""
        
        # Look for confidence indicators
        patterns = [
            r'confidence[:\s]+(\d+)%',
            r'I am (\d+)% confident',
            r'certainty[:\s]+(\d+)%',
            r'(\d+)% sure'
        ]
        
        for pattern in patterns:
            match = re.search(pattern, response, re.IGNORECASE)
            if match:
                return float(match.group(1)) / 100
        
        # Estimate confidence based on response characteristics
        return self._estimate_confidence(response)
    
    def _estimate_confidence(self, response: str) -> float:
        """Estimate confidence based on response characteristics."""
        
        # Factors that indicate higher confidence
        confidence_factors = [
            ('definitely', 0.1),
            ('certainly', 0.1),
            ('absolutely', 0.1),
            ('without doubt', 0.15),
            ('clearly', 0.05),
            ('obviously', 0.05)
        ]
        
        base_confidence = 0.6
        response_lower = response.lower()
        
        for indicator, boost in confidence_factors:
            if indicator in response_lower:
                base_confidence += boost
        
        # Penalize uncertainty indicators
        uncertainty_factors = [
            ('maybe', -0.1),
            ('perhaps', -0.1),
            ('possibly', -0.1),
            ('probably', -0.05),
            ('might', -0.1),
            ('could be', -0.1)
        ]
        
        for indicator, penalty in uncertainty_factors:
            if indicator in response_lower:
                base_confidence += penalty
        
        return max(0.1, min(0.95, base_confidence))
    
    def _extract_reasoning(self, response: str) -> str:
        """Extract reasoning from response."""
        
        # Look for reasoning sections
        patterns = [
            r'Reasoning[:\s]+(.+?)(?:\n\n|\Z)',
            r'Explanation[:\s]+(.+?)(?:\n\n|\Z)',
            r'Because[:\s]+(.+?)(?:\n\n|\Z)'
        ]
        
        for pattern in patterns:
            match = re.search(pattern, response, re.IGNORECASE | re.DOTALL)
            if match:
                return match.group(1).strip()
        
        return ""
    
    async def _calculate_weighted_consensus(
        self,
        client: BlossomClient,
        responses: List[ConfidenceWeightedResponse],
        prompt: str
    ) -> Dict[str, Any]:
        """Calculate weighted consensus."""
        
        # Normalize weights
        weights = np.array([resp.confidence for resp in responses])
        weights = weights / weights.sum() if weights.sum() > 0 else np.ones(len(responses)) / len(responses)
        
        # Select response with highest weight
        max_weight_idx = np.argmax(weights)
        consensus_response = responses[max_weight_idx].response
        
        # Calculate overall confidence
        overall_confidence = np.average(
            [resp.confidence for resp in responses],
            weights=weights
        )
        
        # Generate consensus reasoning
        reasoning_prompt = f"""
        Synthesize a consensus response from these weighted expert opinions:
        
        {chr(10).join([f'{resp.model_id} (confidence: {resp.confidence:.2f}): {resp.response[:200]}...' for resp in responses])}
        
        Original prompt: {prompt}
        
        Provide a consensus response that incorporates the most confident and relevant insights.
        """
        
        consensus_reasoning = await client.text.generate(reasoning_prompt)
        
        return {
            'consensus_response': consensus_response,
            'synthesized_response': consensus_reasoning,
            'overall_confidence': overall_confidence,
            'weights': weights.tolist(),
            'method': 'confidence_weighted',
            'num_responses': len(responses)
        }

# Usage
async def confidence_weighted_example():
    """Demonstrate confidence-weighted consensus."""
    
    consensus_system = ConfidenceWeightedConsensus()
    
    # Complex reasoning problem
    prompt = """
    Should renewable energy be prioritized over fossil fuels for national energy security?
    Consider economic, environmental, and strategic factors.
    """
    
    result = await consensus_system.consensus_with_confidence(
        prompt,
        num_responses=5,
        confidence_threshold=0.6
    )
    
    print("Confidence-Weighted Consensus:")
    print(f"Overall Confidence: {result['consensus']['overall_confidence']:.2f}")
    print(f"Number of Responses: {result['consensus']['num_responses']}")
    
    print("\nResponse Weights:")
    for i, (resp, weight) in enumerate(zip(result['weighted_responses'], result['consensus']['weights'])):
        print(f"  Model {i+1}: Confidence={resp.confidence:.2f}, Weight={weight:.2f}")
```

---

### 4. Iterative Refinement Consensus

```python
import asyncio
from typing import Dict, Any, List
from blossom_ai import BlossomClient, SessionConfig
import json

class IterativeRefinementConsensus:
    """Consensus through iterative refinement."""
    
    def __init__(self, config: SessionConfig = None):
        self.config = config or SessionConfig(
            timeout=180.0,
            sync_pool_connections=20,
            async_limit_total=100
        )
    
    async def iterative_consensus(
        self,
        prompt: str,
        max_iterations: int = 3,
        convergence_threshold: float = 0.8
    ) -> Dict[str, Any]:
        """Reach consensus through iterative refinement."""
        
        iterations = []
        current_consensus = None
        
        async with BlossomClient(config=self.config) as client:
            for iteration in range(max_iterations):
                # Generate responses
                responses = await self._generate_responses(client, prompt, current_consensus)
                
                # Evaluate responses
                evaluations = await self._evaluate_responses(client, responses, prompt)
                
                # Generate new consensus
                new_consensus = await self._generate_consensus(
                    client,
                    responses,
                    evaluations,
                    prompt
                )
                
                iteration_data = {
                    'iteration': iteration + 1,
                    'responses': responses,
                    'evaluations': evaluations,
                    'consensus': new_consensus,
                    'convergence_score': new_consensus['convergence_score']
                }
                
                iterations.append(iteration_data)
                
                # Check for convergence
                if new_consensus['convergence_score'] >= convergence_threshold:
                    break
                
                current_consensus = new_consensus['consensus_response']
        
        return {
            'prompt': prompt,
            'iterations': iterations,
            'final_consensus': iterations[-1]['consensus'],
            'total_iterations': len(iterations),
            'converged': iterations[-1]['consensus']['convergence_score'] >= convergence_threshold
        }
    
    async def _generate_responses(
        self,
        client: BlossomClient,
        prompt: str,
        previous_consensus: str = None
    ) -> List[Dict[str, Any]]:
        """Generate responses, optionally building on previous consensus."""
        
        if previous_consensus:
            enhanced_prompt = f"""
            {prompt}
            
            Previous consensus: {previous_consensus}
            
            Improve upon this consensus or provide an alternative perspective.
            """
        else:
            enhanced_prompt = prompt
        
        # Generate multiple variations
        responses = []
        for i in range(3):
            if i > 0:
                varied_prompt = f"""
                {enhanced_prompt}
                
                (Alternative perspective {i})
                """
            else:
                varied_prompt = enhanced_prompt
            
            response = await client.text.generate(varied_prompt)
            
            responses.append({
                'model_id': f'iteration_model_{i+1}',
                'response': response,
                'timestamp': time.time()
            })
        
        return responses
    
    async def _evaluate_responses(
        self,
        client: BlossomClient,
        responses: List[Dict[str, Any]],
        prompt: str
    ) -> List[Dict[str, Any]]:
        """Evaluate responses on multiple criteria."""
        
        evaluations = []
        
        for resp in responses:
            # Multi-criteria evaluation
            criteria_prompt = f"""
            Evaluate this response to the prompt on multiple criteria:
            
            Prompt: {prompt}
            Response: {resp['response']}
            
            Rate on scale 0-10:
            1. Accuracy
            2. Completeness  
            3. Clarity
            4. Relevance
            5. Novelty
            
            Return JSON format:
            {{"accuracy": X, "completeness": X, "clarity": X, "relevance": X, "novelty": X}}
            """
            
            eval_response = await client.text.generate(criteria_prompt)
            
            try:
                # Parse JSON evaluation
                json_match = re.search(r'\{.*?\}', eval_response, re.DOTALL)
                if json_match:
                    scores = json.loads(json_match.group())
                    overall_score = sum(scores.values()) / (len(scores) * 10)
                else:
                    scores = {}
                    overall_score = 0.5
            except Exception:
                scores = {}
                overall_score = 0.5
            
            evaluations.append({
                'response_id': resp['model_id'],
                'scores': scores,
                'overall_score': overall_score
            })
        
        return evaluations
    
    async def _generate_consensus(
        self,
        client: BlossomClient,
        responses: List[Dict[str, Any]],
        evaluations: List[Dict[str, Any]],
        prompt: str
    ) -> Dict[str, Any]:
        """Generate consensus from responses and evaluations."""
        
        # Combine responses with evaluation scores
        weighted_responses = []
        for resp, eval in zip(responses, evaluations):
            weighted_responses.append({
                'response': resp['response'],
                'weight': eval['overall_score'],
                'model_id': resp['model_id']
            })
        
        # Sort by weight
        weighted_responses.sort(key=lambda x: x['weight'], reverse=True)
        
        # Use best response as starting point
        best_response = weighted_responses[0]['response']
        
        # Generate refined consensus
        consensus_prompt = f"""
        Refine this response based on the following alternative perspectives:
        
        Best response: {best_response}
        
        Alternative perspectives:
        {chr(10).join([f'{resp["model_id"]} (score: {resp["weight"]:.2f}): {resp["response"][:150]}...' for resp in weighted_responses[1:3]])}
        
        Original prompt: {prompt}
        
        Create a refined consensus response that incorporates the best elements.
        """
        
        consensus_response = await client.text.generate(consensus_prompt)
        
        # Calculate convergence score
        avg_score = sum(resp['weight'] for resp in weighted_responses) / len(weighted_responses)
        score_variance = np.var([resp['weight'] for resp in weighted_responses])
        convergence_score = avg_score * (1 - score_variance)
        
        return {
            'consensus_response': consensus_response,
            'convergence_score': convergence_score,
            'avg_score': avg_score,
            'score_variance': score_variance,
            'best_individual_score': weighted_responses[0]['weight']
        }

# Usage
async def iterative_refinement_example():
    """Demonstrate iterative refinement consensus."""
    
    consensus_system = IterativeRefinementConsensus()
    
    # Complex strategic question
    prompt = """
    How should a mid-sized software company approach digital transformation?
    Consider technology, people, processes, and competitive positioning.
    """
    
    result = await consensus_system.iterative_consensus(
        prompt,
        max_iterations=3,
        convergence_threshold=0.8
    )
    
    print("Iterative Refinement Result:")
    print(f"Converged: {result['converged']}")
    print(f"Total Iterations: {result['total_iterations']}")
    print(f"Final Convergence Score: {result['final_consensus']['convergence_score']:.2f}")
    
    print(f"\nFinal Consensus:\n{result['final_consensus']['consensus_response'][:300]}...")
```

---

## Consensus Evaluation and Validation

### 5. Consensus Quality Metrics

```python
import asyncio
from typing import Dict, Any, List
from blossom_ai import BlossomClient, SessionConfig
import numpy as np

class ConsensusEvaluator:
    """Evaluate consensus quality and reliability."""
    
    def __init__(self, config: SessionConfig = None):
        self.config = config or SessionConfig(
            timeout=120.0,
            sync_pool_connections=10,
            async_limit_total=50
        )
    
    async def evaluate_consensus_quality(
        self,
        consensus_result: Dict[str, Any],
        ground_truth: str = None
    ) -> Dict[str, Any]:
        """Evaluate the quality of consensus."""
        
        async with BlossomClient(config=self.config) as client:
            # Extract individual responses
            individual_responses = [
                resp['response'] for resp in consensus_result.get('individual_responses', [])
            ]
            
            consensus_response = consensus_result.get('consensus', {}).get('consensus_response', '')
            
            # Calculate various quality metrics
            metrics = await asyncio.gather(
                self._calculate_agreement_ratio(individual_responses),
                self._calculate_confidence_stability(consensus_result),
                self._assess_consensus_quality(client, consensus_response),
                self._calculate_diversity_score(individual_responses)
            )
            
            quality_score = np.mean([m for m in metrics if isinstance(m, (int, float))])
            
            evaluation = {
                'agreement_ratio': metrics[0],
                'confidence_stability': metrics[1],
                'consensus_quality': metrics[2],
                'diversity_score': metrics[3],
                'overall_quality': quality_score
            }
            
            if ground_truth:
                accuracy_score = await self._calculate_accuracy(
                    client,
                    consensus_response,
                    ground_truth
                )
                evaluation['accuracy_score'] = accuracy_score
                evaluation['overall_quality'] = (quality_score + accuracy_score) / 2
            
            return evaluation
    
    async def _calculate_agreement_ratio(self, responses: List[str]) -> float:
        """Calculate level of agreement among responses."""
        
        if len(responses) < 2:
            return 1.0
        
        # Simple similarity based on common words
        word_sets = [set(response.lower().split()) for response in responses]
        
        # Calculate pairwise similarities
        similarities = []
        for i in range(len(word_sets)):
            for j in range(i + 1, len(word_sets)):
                intersection = word_sets[i] & word_sets[j]
                union = word_sets[i] | word_sets[j]
                
                if union:
                    jaccard_similarity = len(intersection) / len(union)
                    similarities.append(jaccard_similarity)
        
        return np.mean(similarities) if similarities else 0.0
    
    async def _calculate_confidence_stability(
        self,
        consensus_result: Dict[str, Any]
    ) -> float:
        """Calculate confidence stability."""
        
        if 'individual_responses' not in consensus_result:
            return 0.5
        
        confidences = []
        for resp in consensus_result['individual_responses']:
            if isinstance(resp, dict) and 'confidence' in resp:
                confidences.append(resp['confidence'])
        
        if not confidences:
            return 0.5
        
        # Lower variance indicates higher stability
        mean_confidence = np.mean(confidences)
        variance = np.var(confidences)
        
        # Stability score: high mean, low variance
        stability = mean_confidence * (1 - variance)
        return max(0.0, min(1.0, stability))
    
    async def _assess_consensus_quality(
        self,
        client: BlossomClient,
        consensus_response: str
    ) -> float:
        """Assess quality of consensus response."""
        
        quality_prompt = f"""
        Rate the quality of this consensus response (0.0 to 1.0):
        
        {consensus_response}
        
        Consider: accuracy, completeness, clarity, and coherence.
        Return only the numerical score.
        """
        
        score_text = await client.text.generate(quality_prompt)
        score_match = re.search(r'0?\.\d+', score_text)
        return float(score_match.group()) if score_match else 0.5
    
    def _calculate_diversity_score(self, responses: List[str]) -> float:
        """Calculate diversity among responses."""
        
        if len(responses) < 2:
            return 0.0
        
        # Calculate average pairwise distance
        distances = []
        for i in range(len(responses)):
            for j in range(i + 1, len(responses)):
                # Simple distance based on length difference and common words
                words_i = set(responses[i].lower().split())
                words_j = set(responses[j].lower().split())
                
                # Jaccard distance
                intersection = words_i & words_j
                union = words_i | words_j
                
                if union:
                    distance = 1 - (len(intersection) / len(union))
                    distances.append(distance)
        
        return np.mean(distances) if distances else 0.0
    
    async def _calculate_accuracy(
        self,
        client: BlossomClient,
        response: str,
        ground_truth: str
    ) -> float:
        """Calculate accuracy against ground truth."""
        
        accuracy_prompt = f"""
        Compare these two responses for accuracy:
        
        Response 1 (Generated): {response}
        Response 2 (Ground Truth): {ground_truth}
        
        Rate similarity/accuracy from 0.0 to 1.0 where:
        1.0 = identical or equivalent
        0.0 = completely different
        
        Return only the numerical score.
        """
        
        score_text = await client.text.generate(accuracy_prompt)
        score_match = re.search(r'0?\.\d+', score_text)
        return float(score_match.group()) if score_match else 0.0

# Usage
async def evaluate_consensus_example():
    """Demonstrate consensus evaluation."""
    
    evaluator = ConsensusEvaluator()
    
    # Mock consensus result
    consensus_result = {
        'individual_responses': [
            {'response': 'The answer is B', 'confidence': 0.8},
            {'response': 'The answer is B', 'confidence': 0.9},
            {'response': 'The answer is A', 'confidence': 0.6}
        ],
        'consensus': {
            'consensus_response': 'The answer is B',
            'confidence': 0.85
        }
    }
    
    evaluation = await evaluator.evaluate_consensus_quality(
        consensus_result,
        ground_truth="The answer is B"
    )
    
    print("Consensus Quality Evaluation:")
    print(f"Overall Quality: {evaluation['overall_quality']:.2f}")
    print(f"Agreement Ratio: {evaluation['agreement_ratio']:.2f}")
    print(f"Confidence Stability: {evaluation['confidence_stability']:.2f}")
    print(f"Consensus Quality: {evaluation['consensus_quality']:.2f}")
    print(f"Diversity Score: {evaluation['diversity_score']:.2f}")
    
    if 'accuracy_score' in evaluation:
        print(f"Accuracy Score: {evaluation['accuracy_score']:.2f}")
```

---

## Summary

Key consensus patterns for Blossom AI:

1. **Model Voting**: Simple majority and weighted voting
2. **Expert Panels**: Persona-based consensus systems
3. **Confidence Weighting**: Quality-based response selection
4. **Iterative Refinement**: Progressive consensus improvement
5. **Quality Evaluation**: Comprehensive consensus assessment
6. **Disagreement Analysis**: Understanding and resolving conflicts
7. **Multi-Criteria Assessment**: Holistic response evaluation
8. **Adaptive Consensus**: Dynamic consensus methods
9. **Uncertainty Quantification**: Confidence and reliability metrics
10. **Ensemble Methods**: Combining multiple consensus strategies

---

## See Also

- [Self-Correction](SELF_CORRECTION.md) - Self-improving systems
- [Reasoning Systems](REASONING.md) - Structured reasoning approaches
- [Performance Guide](PERFORMANCE.md) - Performance optimization
- [Testing Guide](TESTING.md) - Testing consensus systems
- [Error Handling](ERROR_TYPES.md) - Handling consensus failures