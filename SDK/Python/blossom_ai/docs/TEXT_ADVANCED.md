# ⚙️ Advanced Text Generation Parameters

> **Fine-tune text generation with advanced parameters and controls**

---

## 📋 Table of Contents

- [Temperature and Creativity](#temperature-and-creativity)
- [Token Control](#token-control)
- [Sampling Parameters](#sampling-parameters)
- [Repetition Control](#repetition-control)
- [Presence and Frequency Penalties](#presence-and-frequency-penalties)
- [Top-p and Top-k Sampling](#top-p-and-top-k-sampling)
- [Streaming Parameters](#streaming-parameters)
- [Advanced Examples](#advanced-examples)

---

## 🌡️ Temperature and Creativity

Temperature controls the randomness and creativity of generated text.

### Temperature Scale

```python
temperature_examples = {
    0.1: "Very focused and deterministic",
    0.3: "Conservative and predictable",
    0.7: "Balanced creativity (default)",
    1.0: "Creative and varied",
    1.5: "Highly creative and unpredictable",
    2.0: "Very random and experimental"
}

from blossom_ai import BlossomClient

with BlossomClient() as client:
    # Different temperature settings
    for temp, description in temperature_examples.items():
        response = client.text.generate(
            prompt="Write a short story about space exploration",
            temperature=temp,
            max_tokens=100
        )
        print(f"Temperature {temp} ({description}):")
        print(f"{response.text[:80]}...\n")
```

### Use Case Temperature Guide

```python
temperature_by_use_case = {
    "technical_writing": 0.2,      # Factual, consistent
    "code_generation": 0.1,        # Precise, correct
    "creative_writing": 0.8,       # Imaginative, varied
    "brainstorming": 1.2,          # Diverse ideas
    "poetry": 1.0,                 # Artistic expression
    "business_emails": 0.3,        # Professional, clear
    "social_media": 0.7,           # Engaging but coherent
    "fiction": 0.9                 # Creative storytelling
}

# Generate with appropriate temperature
def generate_with_context(prompt, context="general"):
    temp = temperature_by_use_case.get(context, 0.7)
    
    return client.text.generate(
        prompt=prompt,
        temperature=temp
    )
```

---

## 📏 Token Control

Control the length and structure of generated text.

### Max Tokens

```python
# Different token limits
token_limits = {
    "tweet": 50,           # ~280 characters
    "paragraph": 150,      # ~1 paragraph
    "short_article": 500,  # ~1 page
    "long_article": 2000,  # ~4 pages
    "essay": 4000,         # ~8 pages
    "book_chapter": 8000   # ~16 pages
}

def generate_with_length(prompt, length_type="paragraph"):
    max_tokens = token_limits.get(length_type, 150)
    
    return client.text.generate(
        prompt=prompt,
        max_tokens=max_tokens
    )

# Generate different lengths
short = generate_with_length("Describe AI", "tweet")
medium = generate_with_length("Explain quantum physics", "short_article")
long = generate_with_length("Write about climate change", "essay")
```

### Token Budget Management

```python
class TokenBudgetManager:
    def __init__(self, daily_budget=100000):
        self.daily_budget = daily_budget
        self.used_today = 0
    
    def can_generate(self, estimated_tokens):
        return self.used_today + estimated_tokens <= self.daily_budget
    
    def generate_with_budget(self, prompt, max_tokens, client):
        if not self.can_generate(max_tokens):
            raise ValueError("Insufficient token budget")
        
        response = client.text.generate(
            prompt=prompt,
            max_tokens=max_tokens
        )
        
        # Estimate tokens used
        tokens_used = len(prompt.split()) + max_tokens
        self.used_today += tokens_used
        
        return response

# Usage with budget management
budget_manager = TokenBudgetManager(daily_budget=50000)

try:
    response = budget_manager.generate_with_budget(
        prompt="Write a detailed analysis",
        max_tokens=2000,
        client=client
    )
except ValueError as e:
    print(f"Budget exceeded: {e}")
```

---

## 🎲 Sampling Parameters

### Top-p (Nucleus) Sampling

Top-p sampling considers only the most probable tokens whose cumulative probability exceeds p.

```python
top_p_examples = {
    0.1: "Very focused, only top 10% of tokens",
    0.5: "Moderate variety, top 50% of tokens",
    0.9: "Good variety, top 90% of tokens (default)",
    0.95: "Wide variety, top 95% of tokens",
    0.99: "Maximum variety, almost all tokens"
}

# Compare different top-p values
for top_p, description in top_p_examples.items():
    response = client.text.generate(
        prompt="Write about artificial intelligence",
        top_p=top_p,
        temperature=0.7,
        max_tokens=100
    )
    print(f"Top-p {top_p} ({description}):")
    print(f"{response.text[:80]}...\n")
```

### Top-k Sampling

Top-k sampling considers only the k most probable tokens.

```python
top_k_examples = {
    1: "Greedy decoding (most predictable)",
    10: "Very focused",
    40: "Balanced (default)",
    100: "Creative",
    200: "Very creative and diverse"
}

# Top-k vs Top-p comparison
comparison_prompt = "The future of renewable energy is"

print("Top-k sampling:")
for top_k, description in top_k_examples.items():
    response = client.text.generate(
        prompt=comparison_prompt,
        top_k=top_k,
        temperature=0.8
    )
    print(f"k={top_k}: {response.text[:60]}...")

print("\nTop-p sampling:")
for top_p, description in top_p_examples.items():
    response = client.text.generate(
        prompt=comparison_prompt,
        top_p=top_p,
        temperature=0.8
    )
    print(f"p={top_p}: {response.text[:60]}...")
```

### Combined Sampling

```python
def advanced_sampling_example():
    """Show different sampling combinations"""
    
    prompt = "Write a creative story about"
    
    configurations = [
        {"temperature": 0.8, "top_p": 0.9},           # Default creative
        {"temperature": 0.5, "top_p": 0.7},           # More focused
        {"temperature": 1.2, "top_k": 50},            # Very creative with top-k
        {"temperature": 0.3, "top_p": 0.5, "top_k": 20},  # Highly controlled
    ]
    
    for i, config in enumerate(configurations, 1):
        response = client.text.generate(
            prompt=prompt,
            max_tokens=150,
            **config
        )
        print(f"Config {i} ({config}):")
        print(f"{response.text[:100]}...\n")
```

---

## 🔄 Repetition Control

### Frequency Penalty

Frequency penalty reduces the likelihood of repeating tokens based on their frequency in the generated text.

```python
frequency_penalty_examples = {
    -2.0: "Strongly encourages repetition",
    -1.0: "Encourages repetition",
    0.0: "No penalty (default)",
    0.5: "Mildly discourages repetition",
    1.0: "Moderately discourages repetition",
    2.0: "Strongly discourages repetition"
}

# Test frequency penalty
prompt = "Write a poem about the moon"

for penalty, description in frequency_penalty_examples.items():
    response = client.text.generate(
        prompt=prompt,
        frequency_penalty=penalty,
        max_tokens=100,
        temperature=0.8
    )
    print(f"Freq penalty {penalty} ({description}):")
    print(f"{response.text[:80]}...\n")
```

### Presence Penalty

Presence penalty reduces the likelihood of repeating any token that has already appeared.

```python
presence_penalty_examples = {
    -2.0: "Strongly encourages topic repetition",
    -1.0: "Encourages topic repetition",
    0.0: "No penalty (default)",
    0.5: "Mildly encourages topic diversity",
    1.0: "Moderately encourages topic diversity",
    2.0: "Strongly encourages topic diversity"
}

# Test presence penalty
prompt = "List five benefits of exercise:"

for penalty, description in presence_penalty_examples.items():
    response = client.text.generate(
        prompt=prompt,
        presence_penalty=penalty,
        max_tokens=150
    )
    print(f"Presence penalty {penalty} ({description}):")
    print(f"{response.text[:100]}...\n")
```

### Combined Penalty Strategy

```python
def generate_with_penalty_strategy(prompt, context):
    """Apply different penalty strategies based on context"""
    
    strategies = {
        "creative_writing": {
            "frequency_penalty": 0.7,
            "presence_penalty": 0.5
        },
        "technical_documentation": {
            "frequency_penalty": 0.1,
            "presence_penalty": 0.0
        },
        "brainstorming": {
            "frequency_penalty": 1.2,
            "presence_penalty": 0.8
        },
        "poetry": {
            "frequency_penalty": -0.2,  # Allow some repetition for rhythm
            "presence_penalty": 0.3
        }
    }
    
    penalties = strategies.get(context, {})
    
    return client.text.generate(
        prompt=prompt,
        **penalties
    )

# Generate with context-appropriate penalties
poem = generate_with_penalty_strategy(
    "Write a haiku about spring",
    "poetry"
)

docs = generate_with_penalty_strategy(
    "Document the API endpoint",
    "technical_documentation"
)
```

---

## 📊 Advanced Parameter Combinations

### Parameter Matrix Testing

```python
def parameter_matrix_test():
    """Test different parameter combinations"""
    
    prompt = "Explain machine learning to a beginner"
    
    # Define parameter ranges
    temperatures = [0.3, 0.7, 1.0]
    top_p_values = [0.7, 0.9, 0.95]
    frequency_penalties = [0.0, 0.5, 1.0]
    
    results = []
    
    for temp in temperatures:
        for top_p in top_p_values:
            for freq_pen in frequency_penalties:
                try:
                    response = client.text.generate(
                        prompt=prompt,
                        temperature=temp,
                        top_p=top_p,
                        frequency_penalty=freq_pen,
                        max_tokens=150
                    )
                    
                    results.append({
                        "params": {
                            "temperature": temp,
                            "top_p": top_p,
                            "frequency_penalty": freq_pen
                        },
                        "text": response.text,
                        "length": len(response.text)
                    })
                    
                except Exception as e:
                    print(f"Failed with params {temp}, {top_p}, {freq_pen}: {e}")
    
    return results

# Run parameter matrix test
results = parameter_matrix_test()

# Find best combination (longest response as proxy for quality)
best_result = max(results, key=lambda x: x["length"])
print(f"Best parameters: {best_result['params']}")
print(f"Result: {best_result['text'][:100]}...")
```

### Context-Aware Generation

```python
class ContextualGenerator:
    """Generate text with context-aware parameters"""
    
    def __init__(self, client):
        self.client = client
        self.contexts = {
            "formal_document": {
                "temperature": 0.3,
                "top_p": 0.8,
                "frequency_penalty": 0.1,
                "presence_penalty": 0.0
            },
            "creative_story": {
                "temperature": 0.9,
                "top_p": 0.95,
                "frequency_penalty": 0.6,
                "presence_penalty": 0.4
            },
            "code_comment": {
                "temperature": 0.2,
                "top_p": 0.7,
                "frequency_penalty": 0.0,
                "presence_penalty": 0.0
            },
            "marketing_copy": {
                "temperature": 0.8,
                "top_p": 0.9,
                "frequency_penalty": 0.3,
                "presence_penalty": 0.2
            }
        }
    
    def generate(self, prompt, context="general", custom_params=None):
        """Generate with context-appropriate parameters"""
        
        params = self.contexts.get(context, self.contexts["general"])
        
        if custom_params:
            params.update(custom_params)
        
        return self.client.text.generate(
            prompt=prompt,
            **params
        )

# Usage
generator = ContextualGenerator(client)

# Different contexts
document = generator.generate(
    "Write a project proposal",
    context="formal_document"
)

story = generator.generate(
    "Write a fantasy adventure",
    context="creative_story"
)

# Override with custom parameters
hybrid = generator.generate(
    "Write technical documentation with flair",
    context="formal_document",
    custom_params={"temperature": 0.6}
)
```

---

## 🎓 Advanced Examples

### Dynamic Parameter Adjustment

```python
class AdaptiveGenerator:
    """Adjust parameters based on response quality"""
    
    def __init__(self, client):
        self.client = client
        self.quality_metrics = []
    
    def assess_quality(self, text, prompt):
        """Simple quality assessment"""
        
        # Check for repetition
        words = text.lower().split()
        repetition_score = len(words) / len(set(words))
        
        # Check length vs expected
        expected_length = len(prompt.split()) * 3  # Rough estimate
        length_score = min(len(words) / expected_length, 1.0)
        
        # Check for coherence (simple heuristic)
        coherence_score = 1.0 if len(text) > 50 else 0.5
        
        return {
            "repetition": repetition_score,
            "length": length_score,
            "coherence": coherence_score,
            "overall": (repetition_score + length_score + coherence_score) / 3
        }
    
    def generate_with_feedback(self, prompt, max_attempts=3):
        """Generate with parameter adjustment based on quality"""
        
        params = {
            "temperature": 0.7,
            "top_p": 0.9,
            "frequency_penalty": 0.5
        }
        
        for attempt in range(max_attempts):
            response = self.client.text.generate(
                prompt=prompt,
                **params
            )
            
            quality = self.assess_quality(response.text, prompt)
            self.quality_metrics.append(quality)
            
            # If quality is good, return
            if quality["overall"] > 0.7:
                return response
            
            # Otherwise adjust parameters
            if quality["repetition"] > 1.5:  # Too repetitive
                params["frequency_penalty"] += 0.2
                params["presence_penalty"] = params.get("presence_penalty", 0) + 0.1
            
            if quality["length"] < 0.5:  # Too short
                params["temperature"] += 0.1
            
            if quality["coherence"] < 0.7:  # Not coherent
                params["top_p"] -= 0.1
                params["temperature"] -= 0.1
        
        # Return best attempt
        return response

# Usage
adaptive = AdaptiveGenerator(client)
result = adaptive.generate_with_feedback(
    "Write an engaging product description"
)
```

### Parameter Optimization for Specific Tasks

```python
def optimize_parameters_for_task(task_examples, client):
    """Find optimal parameters for a specific task"""
    
    from itertools import product
    
    # Define parameter search space
    temp_range = [0.3, 0.5, 0.7, 0.9]
    top_p_range = [0.7, 0.8, 0.9, 0.95]
    freq_pen_range = [0.0, 0.3, 0.6, 1.0]
    
    best_params = None
    best_score = 0
    
    # Test all combinations
    for temp, top_p, freq_pen in product(temp_range, top_p_range, freq_pen_range):
        total_score = 0
        
        for example in task_examples:
            try:
                response = client.text.generate(
                    prompt=example["prompt"],
                    temperature=temp,
                    top_p=top_p,
                    frequency_penalty=freq_pen,
                    max_tokens=example.get("max_tokens", 150)
                )
                
                # Simple scoring based on length and keyword presence
                score = len(response.text) / 100  # Length score
                
                for keyword in example.get("expected_keywords", []):
                    if keyword.lower() in response.text.lower():
                        score += 10
                
                total_score += score
                
            except Exception:
                total_score -= 10  # Penalty for failures
        
        avg_score = total_score / len(task_examples)
        
        if avg_score > best_score:
            best_score = avg_score
            best_params = {
                "temperature": temp,
                "top_p": top_p,
                "frequency_penalty": freq_pen
            }
    
    return best_params, best_score

# Example optimization
examples = [
    {
        "prompt": "Write a technical specification for",
        "expected_keywords": ["requirements", "design", "implementation"],
        "max_tokens": 200
    },
    {
        "prompt": "Document the API endpoint for",
        "expected_keywords": ["endpoint", "parameters", "response"],
        "max_tokens": 150
    }
]

best_params, score = optimize_parameters_for_task(examples, client)
print(f"Best parameters: {best_params}")
print(f"Average score: {score}")
```

---

## 📚 Further Reading

- [Text Generation Basics](TEXT_GENERATION.md)
- [Function Calling](FUNCTION_CALLING.md)
- [JSON Mode](JSON_MODE.md)
- [Streaming Text](TEXT_STREAMING.md)
- [Performance Optimization](PERFORMANCE.md)