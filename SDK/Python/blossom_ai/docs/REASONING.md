# 🧠 Reasoning Systems Guide

> **Implement advanced reasoning capabilities with Blossom AI**

---

## Overview

This guide covers implementing sophisticated reasoning systems using Blossom AI, including Chain-of-Thought (CoT), Tree of Thoughts (ToT), and other structured reasoning patterns.

---

## Why Structured Reasoning?

### Benefits
- **Better Accuracy**: Step-by-step reasoning reduces errors
- **Explainability**: Clear reasoning process for debugging
- **Complex Problems**: Handle multi-step reasoning tasks
- **Consistency**: More reliable results on complex queries

---

## Basic Reasoning Patterns

### 1. Chain-of-Thought (CoT) Prompting

```python
import asyncio
from typing import Dict, Any, List
from blossom_ai import BlossomClient, SessionConfig
import json
import re

class ChainOfThoughtReasoner:
    """Implement Chain-of-Thought reasoning with Blossom AI."""
    
    def __init__(self, config: SessionConfig = None):
        self.config = config or SessionConfig(
            timeout=120.0,
            sync_pool_connections=10,
            async_limit_total=50
        )
    
    async def reason_step_by_step(
        self,
        problem: str,
        steps: List[str] = None
    ) -> Dict[str, Any]:
        """Solve problem using step-by-step reasoning."""
        
        # Default reasoning steps
        if steps is None:
            steps = [
                "Understand the problem",
                "Identify key information",
                "Break down into sub-problems",
                "Solve each sub-problem",
                "Combine solutions",
                "Verify the answer"
            ]
        
        async with BlossomClient(config=self.config) as client:
            reasoning_chain = []
            current_context = f"Problem: {problem}\n\n"
            
            for i, step in enumerate(steps, 1):
                # Build prompt for this step
                prompt = f"""
                {current_context}
                Step {i}: {step}
                
                Think step by step and provide your reasoning for this step.
                Be explicit about your thought process.
                """
                
                response = await client.text.generate(prompt)
                
                # Store step result
                step_result = {
                    'step': i,
                    'description': step,
                    'reasoning': response,
                    'timestamp': time.time()
                }
                
                reasoning_chain.append(step_result)
                
                # Update context for next step
                current_context += f"\nStep {i}: {step}\n{response}\n"
            
            # Final answer
            final_prompt = f"""
            {current_context}
            
            Based on the reasoning above, provide the final answer to the original problem.
            Problem: {problem}
            
            Final Answer:
            """
            
            final_answer = await client.text.generate(final_prompt)
            
            return {
                'problem': problem,
                'reasoning_chain': reasoning_chain,
                'final_answer': final_answer,
                'total_steps': len(steps),
                'processing_time': time.time() - start_time
            }
    
    async def solve_math_problem(self, problem: str) -> Dict[str, Any]:
        """Solve mathematical problem with step-by-step reasoning."""
        
        math_steps = [
            "Identify what is given",
            "Identify what needs to be found",
            "Choose appropriate method",
            "Perform calculations step by step",
            "Check the answer for reasonableness"
        ]
        
        return await self.reason_step_by_step(problem, math_steps)
    
    async def analyze_complex_decision(
        self,
        scenario: str,
        options: List[str]
    ) -> Dict[str, Any]:
        """Analyze complex decision with structured reasoning."""
        
        decision_steps = [
            "Clarify the decision context",
            "Identify key criteria",
            "List available options",
            "Evaluate each option against criteria",
            "Consider trade-offs and consequences",
            "Make recommendation with justification"
        ]
        
        problem = f"""
        Decision Scenario: {scenario}
        
        Options to consider:
        {chr(10).join(f"{i+1}. {option}" for i, option in enumerate(options))}
        
        Provide a structured analysis of this decision.
        """
        
        return await self.reason_step_by_step(problem, decision_steps)
    
    async def debug_code_issue(
        self,
        code: str,
        error: str,
        context: str = ""
    ) -> Dict[str, Any]:
        """Debug code issues with systematic reasoning."""
        
        debug_steps = [
            "Understand the error message",
            "Examine the code structure",
            "Identify potential causes",
            "Test hypotheses systematically",
            "Propose solution"
        ]
        
        problem = f"""
        Code:
        ```
        {code}
        ```
        
        Error: {error}
        
        Context: {context}
        
        Debug this code issue step by step.
        """
        
        return await self.reason_step_by_step(problem, debug_steps)

# Usage
async def basic_cot_reasoning():
    """Demonstrate Chain-of-Thought reasoning."""
    
    reasoner = ChainOfThoughtReasoner()
    
    # Math problem
    math_result = await reasoner.solve_math_problem(
        "If a train travels 120 miles in 2 hours, and then 180 miles in 3 hours, what is its average speed for the entire journey?"
    )
    
    print("Math Problem Result:")
    print(f"Final Answer: {math_result['final_answer']}")
    
    # Decision analysis
    decision_result = await reasoner.analyze_complex_decision(
        "Choose the best cloud provider for a startup",
        ["AWS", "Google Cloud", "Azure", "Digital Ocean"]
    )
    
    print("\nDecision Analysis:")
    for step in decision_result['reasoning_chain']:
        print(f"Step {step['step']}: {step['description']}")
        print(f"Reasoning: {step['reasoning'][:200]}...")
```

---

### 2. Self-Consistency Reasoning

```python
import asyncio
from typing import Dict, Any, List
from statistics import mode, StatisticsError
from blossom_ai import BlossomClient, SessionConfig
import re

class SelfConsistencyReasoner:
    """Implement self-consistency reasoning for better accuracy."""
    
    def __init__(self, config: SessionConfig = None, num_samples: int = 5):
        self.config = config or SessionConfig(
            timeout=180.0,
            sync_pool_connections=15,
            async_limit_total=75
        )
        self.num_samples = num_samples
    
    async def reason_with_consistency(
        self,
        problem: str,
        reasoning_prompt: str = None
    ) -> Dict[str, Any]:
        """Solve problem using self-consistency approach."""
        
        if reasoning_prompt is None:
            reasoning_prompt = f"""
            Solve the following problem step by step. Show your reasoning clearly.
            
            Problem: {problem}
            
            Solution:
            """
        
        async with BlossomClient(config=self.config) as client:
            # Generate multiple reasoning paths
            tasks = [
                client.text.generate(reasoning_prompt)
                for _ in range(self.num_samples)
            ]
            
            reasoning_paths = await asyncio.gather(*tasks)
            
            # Extract answers from each path
            answers = []
            for i, path in enumerate(reasoning_paths):
                answer = self._extract_answer(path, problem)
                answers.append({
                    'path_id': i + 1,
                    'reasoning': path,
                    'answer': answer
                })
            
            # Find consensus answer
            try:
                # Try to find most common answer
                consensus_answer = mode([a['answer'] for a in answers if a['answer']])
                consensus_count = sum(1 for a in answers if a['answer'] == consensus_answer)
                confidence = consensus_count / len(answers)
            except StatisticsError:
                # No clear consensus, use first answer
                consensus_answer = answers[0]['answer']
                confidence = 1.0 / len(answers)
            
            return {
                'problem': problem,
                'consensus_answer': consensus_answer,
                'confidence': confidence,
                'total_paths': len(answers),
                'consensus_count': consensus_count if 'consensus_count' in locals() else 1,
                'all_answers': answers
            }
    
    def _extract_answer(self, reasoning: str, problem: str) -> str:
        """Extract final answer from reasoning text."""
        
        # Look for common answer patterns
        patterns = [
            r'Final Answer[:\s]+(.+?)(?:\n|$)',
            r'Answer[:\s]+(.+?)(?:\n|$)',
            r'Therefore[,:\s]+(.+?)(?:\n|$)',
            r'So[,:\s]+(.+?)(?:\n|$)',
            r'The answer is[:\s]+(.+?)(?:\n|$)'
        ]
        
        for pattern in patterns:
            match = re.search(pattern, reasoning, re.IGNORECASE | re.MULTILINE)
            if match:
                return match.group(1).strip()
        
        # If no pattern matches, return last sentence
        sentences = [s.strip() for s in reasoning.split('.') if s.strip()]
        return sentences[-1] if sentences else reasoning
    
    async def solve_multiple_choice(
        self,
        question: str,
        options: List[str],
        context: str = ""
    ) -> Dict[str, Any]:
        """Solve multiple choice with self-consistency."""
        
        options_text = "\n".join([f"{chr(65+i)}. {option}" for i, option in enumerate(options)])
        
        reasoning_prompt = f"""
        {context}
        
        Question: {question}
        
        Options:
        {options_text}
        
        Think step by step and choose the best answer. 
        Return only the letter (A, B, C, etc.) of the correct answer.
        
        Reasoning:
        """
        
        result = await self.reason_with_consistency(question, reasoning_prompt)
        
        # Extract letter answer
        consensus_answer = result['consensus_answer']
        letter_match = re.search(r'[A-Z]', consensus_answer.upper())
        
        if letter_match:
            answer_letter = letter_match.group()
            answer_index = ord(answer_letter) - ord('A')
            
            if 0 <= answer_index < len(options):
                result['selected_option'] = options[answer_index]
                result['selected_letter'] = answer_letter
        
        return result
    
    async def numerical_reasoning(
        self,
        problem: str,
        expected_type: str = "integer"
    ) -> Dict[str, Any]:
        """Solve numerical problems with consistency checking."""
        
        reasoning_prompt = f"""
        Solve this problem step by step. Show all calculations.
        
        Problem: {problem}
        
        Provide the final answer as a {expected_type}.
        
        Step-by-step solution:
        """
        
        result = await self.reason_with_consistency(problem, reasoning_prompt)
        
        # Extract numerical answer
        consensus_answer = result['consensus_answer']
        
        # Try to extract number
        number_match = re.search(r'[-+]?\d*\.?\d+', consensus_answer)
        if number_match:
            result['numerical_answer'] = float(number_match.group())
        
        return result

# Usage
async def self_consistency_example():
    """Demonstrate self-consistency reasoning."""
    
    reasoner = SelfConsistencyReasoner(num_samples=5)
    
    # Multiple choice question
    mc_result = await reasoner.solve_multiple_choice(
        "What is the capital of France?",
        ["London", "Berlin", "Paris", "Madrid"]
    )
    
    print("Multiple Choice Result:")
    print(f"Consensus: {mc_result['consensus_answer']}")
    print(f"Confidence: {mc_result['confidence']:.2f}")
    print(f"Selected: {mc_result.get('selected_option', 'Unknown')}")
    
    # Numerical problem
    num_result = await reasoner.numerical_reasoning(
        "What is 15% of 240?",
        expected_type="number"
    )
    
    print("\nNumerical Result:")
    print(f"Answer: {num_result.get('numerical_answer', 'N/A')}")
    print(f"Confidence: {num_result['confidence']:.2f}")
```

---

## Advanced Reasoning Patterns

### 3. Tree of Thoughts (ToT) Reasoning

```python
import asyncio
from typing import Dict, Any, List, Optional
from dataclasses import dataclass
from blossom_ai import BlossomClient, SessionConfig
import json

@dataclass
class ThoughtNode:
    """Node in the Tree of Thoughts."""
    id: str
    content: str
    score: float = 0.0
    children: List['ThoughtNode'] = None
    parent: Optional['ThoughtNode'] = None
    depth: int = 0
    
    def __post_init__(self):
        if self.children is None:
            self.children = []

class TreeOfThoughtsReasoner:
    """Implement Tree of Thoughts reasoning."""
    
    def __init__(
        self,
        config: SessionConfig = None,
        max_depth: int = 3,
        branching_factor: int = 2
    ):
        self.config = config or SessionConfig(
            timeout=180.0,
            sync_pool_connections=20,
            async_limit_total=100
        )
        self.max_depth = max_depth
        self.branching_factor = branching_factor
    
    async def solve_with_tree_of_thoughts(
        self,
        problem: str,
        evaluation_criteria: str = "accuracy and clarity"
    ) -> Dict[str, Any]:
        """Solve problem using Tree of Thoughts approach."""
        
        start_time = time.time()
        
        # Create root node
        root = ThoughtNode(
            id="root",
            content=f"Problem: {problem}",
            depth=0
        )
        
        async with BlossomClient(config=self.config) as client:
            # Build the tree
            await self._build_thought_tree(client, root, problem)
            
            # Evaluate and find best path
            best_path = await self._find_best_path(client, root, evaluation_criteria)
            
            return {
                'problem': problem,
                'tree_structure': self._serialize_tree(root),
                'best_path': best_path,
                'total_nodes': self._count_nodes(root),
                'max_depth': self.max_depth,
                'processing_time': time.time() - start_time
            }
    
    async def _build_thought_tree(
        self,
        client: BlossomClient,
        node: ThoughtNode,
        problem: str
    ):
        """Recursively build the thought tree."""
        
        if node.depth >= self.max_depth:
            return
        
        # Generate next thoughts
        next_thoughts = await self._generate_next_thoughts(
            client,
            node,
            problem
        )
        
        # Create child nodes
        for i, thought in enumerate(next_thoughts[:self.branching_factor]):
            child_node = ThoughtNode(
                id=f"{node.id}_{i}",
                content=thought,
                parent=node,
                depth=node.depth + 1
            )
            
            node.children.append(child_node)
            
            # Recursively build subtree
            await self._build_thought_tree(client, child_node, problem)
    
    async def _generate_next_thoughts(
        self,
        client: BlossomClient,
        node: ThoughtNode,
        problem: str
    ) -> List[str]:
        """Generate next thoughts from current node."""
        
        # Different prompts based on depth and node content
        if node.depth == 0:
            prompt = f"""
            Problem: {problem}
            
            Generate {self.branching_factor} different approaches to solve this problem.
            Each approach should be a distinct strategy or method.
            
            Return as a numbered list (1., 2., 3., etc.)
            """
        else:
            prompt = f"""
            Problem: {problem}
            
            Current approach: {node.content}
            
            Generate {self.branching_factor} ways to develop this approach further.
            Consider different aspects, details, or next steps.
            
            Return as a numbered list (1., 2., 3., etc.)
            """
        
        response = await client.text.generate(prompt)
        
        # Parse numbered list
        thoughts = []
        for line in response.split('\n'):
            if re.match(r'^\d+\.', line):
                thought = re.sub(r'^\d+\.\s*', '', line).strip()
                if thought:
                    thoughts.append(thought)
        
        return thoughts
    
    async def _find_best_path(
        self,
        client: BlossomClient,
        root: ThoughtNode,
        evaluation_criteria: str
    ) -> List[Dict[str, Any]]:
        """Find the best path through the thought tree."""
        
        # Get all leaf nodes
        leaf_nodes = self._get_leaf_nodes(root)
        
        # Evaluate each path from root to leaf
        paths = []
        
        for leaf in leaf_nodes:
            path = self._get_path_to_root(leaf)
            
            # Evaluate path
            score = await self._evaluate_path(client, path, evaluation_criteria)
            
            paths.append({
                'path': path,
                'score': score,
                'depth': leaf.depth
            })
        
        # Sort by score and return best path
        paths.sort(key=lambda x: x['score'], reverse=True)
        
        return paths[0] if paths else None
    
    async def _evaluate_path(
        self,
        client: BlossomClient,
        path: List[ThoughtNode],
        criteria: str
    ) -> float:
        """Evaluate a path through the thought tree."""
        
        path_content = " -> ".join([node.content[:100] for node in path])
        
        prompt = f"""
        Evaluate this reasoning path based on {criteria}:
        
        Path: {path_content}
        
        Score from 0.0 to 1.0 where:
        0.0 = poor reasoning
        1.0 = excellent reasoning
        
        Return only the numerical score.
        """
        
        score_text = await client.text.generate(prompt)
        
        # Extract numerical score
        score_match = re.search(r'0?\.\d+', score_text)
        if score_match:
            return float(score_match.group())
        else:
            return 0.5  # Default score
    
    def _get_leaf_nodes(self, node: ThoughtNode) -> List[ThoughtNode]:
        """Get all leaf nodes in the tree."""
        if not node.children:
            return [node]
        
        leaves = []
        for child in node.children:
            leaves.extend(self._get_leaf_nodes(child))
        
        return leaves
    
    def _get_path_to_root(self, node: ThoughtNode) -> List[ThoughtNode]:
        """Get path from node to root."""
        path = []
        current = node
        
        while current:
            path.insert(0, current)
            current = current.parent
        
        return path
    
    def _serialize_tree(self, node: ThoughtNode) -> Dict[str, Any]:
        """Serialize tree structure for output."""
        return {
            'id': node.id,
            'content': node.content,
            'depth': node.depth,
            'children': [self._serialize_tree(child) for child in node.children]
        }
    
    def _count_nodes(self, node: ThoughtNode) -> int:
        """Count total nodes in tree."""
        count = 1  # Current node
        for child in node.children:
            count += self._count_nodes(child)
        return count

# Usage
async def tree_of_thoughts_example():
    """Demonstrate Tree of Thoughts reasoning."""
    
    reasoner = TreeOfThoughtsReasoner(
        max_depth=3,
        branching_factor=2
    )
    
    # Complex problem requiring multiple approaches
    problem = """
    A company wants to reduce its carbon footprint by 50% in the next 5 years.
    They currently rely heavily on fossil fuels for manufacturing.
    What strategies should they consider?
    """
    
    result = await reasoner.solve_with_tree_of_thoughts(problem)
    
    print("Tree of Thoughts Result:")
    print(f"Total nodes explored: {result['total_nodes']}")
    print(f"Best path score: {result['best_path']['score']:.2f}")
    
    if result['best_path']:
        print("Best reasoning path:")
        for i, node in enumerate(result['best_path']['path']):
            print(f"  Step {i+1}: {node.content[:100]}...")
```

---

### 4. Graph-Based Reasoning

```python
import asyncio
from typing import Dict, Any, List, Set, Tuple
from dataclasses import dataclass
from blossom_ai import BlossomClient, SessionConfig
import json

@dataclass
class KnowledgeNode:
    """Node in knowledge graph."""
    id: str
    concept: str
    description: str
    connections: Set[str] = None
    
    def __post_init__(self):
        if self.connections is None:
            self.connections = set()

class KnowledgeGraphReasoner:
    """Reason using knowledge graphs."""
    
    def __init__(self, config: SessionConfig = None):
        self.config = config or SessionConfig(
            timeout=150.0,
            sync_pool_connections=15,
            async_limit_total=75
        )
        self.knowledge_graph = {}
    
    async def build_knowledge_graph(
        self,
        topic: str,
        max_depth: int = 2
    ) -> Dict[str, Any]:
        """Build knowledge graph for a topic."""
        
        start_time = time.time()
        
        async with BlossomClient(config=self.config) as client:
            # Start with root node
            root_node = KnowledgeNode(
                id="root",
                concept=topic,
                description=f"Root concept: {topic}"
            )
            
            self.knowledge_graph[topic] = root_node
            
            # Build graph recursively
            await self._expand_knowledge_graph(
                client,
                root_node,
                current_depth=0,
                max_depth=max_depth
            )
        
        return {
            'topic': topic,
            'graph': self._serialize_graph(),
            'total_nodes': len(self.knowledge_graph),
            'max_depth': max_depth,
            'build_time': time.time() - start_time
        }
    
    async def _expand_knowledge_graph(
        self,
        client: BlossomClient,
        node: KnowledgeNode,
        current_depth: int,
        max_depth: int
    ):
        """Recursively expand knowledge graph."""
        
        if current_depth >= max_depth:
            return
        
        # Get related concepts
        related_concepts = await self._get_related_concepts(client, node.concept)
        
        for concept in related_concepts[:3]:  # Limit branching
            if concept not in self.knowledge_graph:
                # Create new node
                new_node = KnowledgeNode(
                    id=f"{node.id}_{concept[:20]}",
                    concept=concept,
                    description=f"Related to {node.concept}"
                )
                
                self.knowledge_graph[concept] = new_node
                
                # Add connection
                node.connections.add(concept)
                new_node.connections.add(node.concept)
                
                # Recursively expand
                await self._expand_knowledge_graph(
                    client,
                    new_node,
                    current_depth + 1,
                    max_depth
                )
    
    async def _get_related_concepts(
        self,
        client: BlossomClient,
        concept: str
    ) -> List[str]:
        """Get concepts related to the given concept."""
        
        prompt = f"""
        List 5 important concepts related to "{concept}".
        Focus on direct relationships and sub-concepts.
        
        Return as a numbered list (1., 2., 3., etc.)
        """
        
        response = await client.text.generate(prompt)
        
        # Parse concepts from response
        concepts = []
        for line in response.split('\n'):
            if re.match(r'^\d+\.', line):
                concept = re.sub(r'^\d+\.\s*', '', line).strip()
                if concept:
                    concepts.append(concept)
        
        return concepts
    
    async def reason_with_knowledge_graph(
        self,
        query: str
    ) -> Dict[str, Any]:
        """Answer query using knowledge graph."""
        
        # Find relevant nodes
        relevant_nodes = self._find_relevant_nodes(query)
        
        if not relevant_nodes:
            return {
                'query': query,
                'answer': "No relevant information found in knowledge graph",
                'relevant_nodes': []
            }
        
        # Build context from relevant nodes
        context_parts = []
        for node in relevant_nodes[:3]:  # Limit context
            context_parts.append(f"{node.concept}: {node.description}")
        
        context = "\n".join(context_parts)
        
        async with BlossomClient(config=self.config) as client:
            prompt = f"""
            Based on the following knowledge, answer the question:
            
            Knowledge:
            {context}
            
            Question: {query}
            
            Answer:
            """
            
            answer = await client.text.generate(prompt)
        
        return {
            'query': query,
            'answer': answer,
            'relevant_nodes': [node.concept for node in relevant_nodes],
            'context_used': context
        }
    
    def _find_relevant_nodes(self, query: str) -> List[KnowledgeNode]:
        """Find nodes relevant to the query."""
        
        # Simple keyword matching (in production, use more sophisticated methods)
        query_lower = query.lower()
        relevant = []
        
        for node in self.knowledge_graph.values():
            if any(word in node.concept.lower() for word in query_lower.split()):
                relevant.append(node)
        
        return relevant
    
    def _serialize_graph(self) -> Dict[str, Any]:
        """Serialize knowledge graph."""
        
        return {
            'nodes': [
                {
                    'id': node.id,
                    'concept': node.concept,
                    'description': node.description,
                    'connections': list(node.connections)
                }
                for node in self.knowledge_graph.values()
            ]
        }

# Usage
async def knowledge_graph_example():
    """Demonstrate knowledge graph reasoning."""
    
    reasoner = KnowledgeGraphReasoner()
    
    # Build knowledge graph
    graph_result = await reasoner.build_knowledge_graph(
        topic="Artificial Intelligence",
        max_depth=2
    )
    
    print(f"Built graph with {graph_result['total_nodes']} nodes")
    
    # Query the graph
    query_result = await reasoner.reason_with_knowledge_graph(
        "What is machine learning?"
    )
    
    print(f"Query Result: {query_result['answer']}")
    print(f"Used nodes: {query_result['relevant_nodes']}")
```

---

## Reasoning Evaluation and Validation

### 5. Reasoning Quality Assessment

```python
import asyncio
from typing import Dict, Any, List
from blossom_ai import BlossomClient, SessionConfig
import json

class ReasoningEvaluator:
    """Evaluate the quality of reasoning."""
    
    def __init__(self, config: SessionConfig = None):
        self.config = config or SessionConfig(
            timeout=120.0,
            sync_pool_connections=10,
            async_limit_total=50
        )
    
    async def evaluate_reasoning_quality(
        self,
        problem: str,
        reasoning: str,
        expected_answer: str = None
    ) -> Dict[str, Any]:
        """Evaluate quality of reasoning."""
        
        async with BlossomClient(config=self.config) as client:
            # Multiple evaluation criteria
            evaluation_tasks = [
                self._evaluate_logical_consistency(client, problem, reasoning),
                self._evaluate_clarity(client, reasoning),
                self._evaluate_completeness(client, problem, reasoning),
                self._evaluate_efficiency(client, reasoning)
            ]
            
            if expected_answer:
                evaluation_tasks.append(
                    self._evaluate_correctness(client, reasoning, expected_answer)
                )
            
            evaluations = await asyncio.gather(*evaluation_tasks)
            
            # Combine evaluations
            overall_score = sum(evaluations) / len(evaluations)
            
            return {
                'problem': problem,
                'overall_score': overall_score,
                'scores': {
                    'logical_consistency': evaluations[0],
                    'clarity': evaluations[1],
                    'completeness': evaluations[2],
                    'efficiency': evaluations[3],
                    'correctness': evaluations[4] if expected_answer else None
                },
                'quality_rating': self._get_quality_rating(overall_score)
            }
    
    async def _evaluate_logical_consistency(
        self,
        client: BlossomClient,
        problem: str,
        reasoning: str
    ) -> float:
        """Evaluate logical consistency."""
        
        prompt = f"""
        Evaluate the logical consistency of this reasoning:
        
        Problem: {problem}
        Reasoning: {reasoning}
        
        Score from 0.0 to 1.0 where:
        1.0 = perfectly logical and consistent
        0.0 = completely illogical and contradictory
        
        Return only the numerical score.
        """
        
        score_text = await client.text.generate(prompt)
        
        score_match = re.search(r'0?\.\d+', score_text)
        return float(score_match.group()) if score_match else 0.5
    
    async def _evaluate_clarity(
        self,
        client: BlossomClient,
        reasoning: str
    ) -> float:
        """Evaluate clarity of reasoning."""
        
        prompt = f"""
        Evaluate the clarity and understandability of this reasoning:
        
        {reasoning}
        
        Score from 0.0 to 1.0 where:
        1.0 = perfectly clear and easy to understand
        0.0 = completely unclear and confusing
        
        Return only the numerical score.
        """
        
        score_text = await client.text.generate(prompt)
        
        score_match = re.search(r'0?\.\d+', score_text)
        return float(score_match.group()) if score_match else 0.5
    
    async def _evaluate_completeness(
        self,
        client: BlossomClient,
        problem: str,
        reasoning: str
    ) -> float:
        """Evaluate completeness of reasoning."""
        
        prompt = f"""
        Evaluate how completely this reasoning addresses the problem:
        
        Problem: {problem}
        Reasoning: {reasoning}
        
        Score from 0.0 to 1.0 where:
        1.0 = completely addresses all aspects of the problem
        0.0 = completely fails to address the problem
        
        Return only the numerical score.
        """
        
        score_text = await client.text.generate(prompt)
        
        score_match = re.search(r'0?\.\d+', score_text)
        return float(score_match.group()) if score_match else 0.5
    
    async def _evaluate_efficiency(
        self,
        client: BlossomClient,
        reasoning: str
    ) -> float:
        """Evaluate efficiency of reasoning."""
        
        prompt = f"""
        Evaluate the efficiency of this reasoning (no unnecessary steps):
        
        {reasoning}
        
        Score from 0.0 to 1.0 where:
        1.0 = perfectly efficient with no redundant steps
        0.0 = extremely inefficient with many unnecessary steps
        
        Return only the numerical score.
        """
        
        score_text = await client.text.generate(prompt)
        
        score_match = re.search(r'0?\.\d+', score_text)
        return float(score_match.group()) if score_match else 0.5
    
    async def _evaluate_correctness(
        self,
        client: BlossomClient,
        reasoning: str,
        expected_answer: str
    ) -> float:
        """Evaluate correctness of final answer."""
        
        prompt = f"""
        Check if the reasoning leads to the correct answer:
        
        Reasoning: {reasoning}
        Expected answer: {expected_answer}
        
        Score from 0.0 to 1.0 where:
        1.0 = reasoning correctly leads to expected answer
        0.0 = reasoning is completely wrong
        
        Return only the numerical score.
        """
        
        score_text = await client.text.generate(prompt)
        
        score_match = re.search(r'0?\.\d+', score_text)
        return float(score_match.group()) if score_match else 0.0
    
    def _get_quality_rating(self, score: float) -> str:
        """Convert score to quality rating."""
        
        if score >= 0.9:
            return "Excellent"
        elif score >= 0.8:
            return "Good"
        elif score >= 0.7:
            return "Fair"
        elif score >= 0.6:
            return "Poor"
        else:
            return "Very Poor"

# Usage
async def evaluate_reasoning_example():
    """Demonstrate reasoning evaluation."""
    
    evaluator = ReasoningEvaluator()
    
    problem = "If all roses are flowers and some flowers fade quickly, can we conclude that some roses fade quickly?"
    
    reasoning = """
    Let's analyze this step by step:
    
    1. All roses are flowers (given)
    2. Some flowers fade quickly (given)
    3. However, the flowers that fade quickly might not include any roses
    4. The statement only tells us about "some flowers", not specifically about roses
    5. Therefore, we cannot definitively conclude that some roses fade quickly
    
    Final Answer: No, we cannot conclude that some roses fade quickly based on the given information.
    """
    
    evaluation = await evaluator.evaluate_reasoning_quality(
        problem=problem,
        reasoning=reasoning,
        expected_answer="No, we cannot conclude that some roses fade quickly"
    )
    
    print("Reasoning Evaluation:")
    print(f"Overall Score: {evaluation['overall_score']:.2f}")
    print(f"Quality Rating: {evaluation['quality_rating']}")
    
    for criterion, score in evaluation['scores'].items():
        if score is not None:
            print(f"{criterion.replace('_', ' ').title()}: {score:.2f}")
```

---

## Summary

Key reasoning patterns for Blossom AI:

1. **Chain-of-Thought**: Step-by-step reasoning for complex problems
2. **Self-Consistency**: Multiple reasoning paths for better accuracy
3. **Tree of Thoughts**: Explore multiple solution branches
4. **Knowledge Graphs**: Structured reasoning with connected concepts
5. **Evaluation**: Assess reasoning quality systematically
6. **Mathematical Reasoning**: Specialized handling of numerical problems
7. **Decision Analysis**: Structured approach to complex decisions
8. **Debugging**: Systematic code and logic debugging
9. **Validation**: Verify reasoning correctness and quality
10. **Hybrid Approaches**: Combine multiple reasoning strategies

---

## See Also

- [Async Patterns](ASYNC_PATTERNS.md) - Async/await best practices
- [Performance Guide](PERFORMANCE.md) - Performance optimization techniques
- [Memory Management](MEMORY.md) - Managing memory in reasoning systems
- [Error Handling](ERROR_TYPES.md) - Handling reasoning failures
- [Self-Correction](SELF_CORRECTION.md) - Self-improving reasoning systems