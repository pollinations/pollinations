#!/usr/bin/env python3
"""
Test code execution with Pollinations API
Replicates optillm's executecode plugin functionality
"""

import re
import subprocess
import tempfile
import os
from openai import OpenAI

# Pollinations API configuration
API_KEY = "plln_sk_W17YxfSDcaVYLRLgkvi5Ulczi5wbCn0a"
BASE_URL = "https://enter.pollinations.ai/api/generate/v1"

EXECUTE_CODE_PROMPT = '''Generate Python code to solve this problem. Put the code in a ```python block. The code:
1. Should use standard Python libraries (math, itertools, etc.)
2. Should print the final answer
3. Should be complete and runnable
4. Should include example test cases if relevant

The code will be automatically executed when submitted.'''

def extract_python_code(text: str) -> list[str]:
    """Extract Python code blocks from text."""
    pattern = r'```python\s*(.*?)\s*```'
    return re.findall(pattern, text, re.DOTALL)

def execute_code(code: str) -> str:
    """Execute Python code and return output."""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
        f.write(code)
        f.flush()
        tmp_name = f.name
    
    try:
        result = subprocess.run(
            ['python3', tmp_name],
            capture_output=True,
            text=True,
            timeout=30
        )
        output = result.stdout
        if result.stderr:
            output += f"\n[STDERR]: {result.stderr}"
        return output.strip()
    except subprocess.TimeoutExpired:
        return "[ERROR]: Code execution timed out (30s)"
    except Exception as e:
        return f"[ERROR]: {str(e)}"
    finally:
        os.unlink(tmp_name)

def run_with_code_execution(query: str, model: str = "openai") -> str:
    """Run a query with code execution capability."""
    
    client = OpenAI(api_key=API_KEY, base_url=BASE_URL)
    
    print(f"\n{'='*60}")
    print(f"Query: {query}")
    print(f"Model: {model}")
    print('='*60)
    
    # Step 1: Ask the model to generate code
    messages = [
        {"role": "system", "content": EXECUTE_CODE_PROMPT},
        {"role": "user", "content": query}
    ]
    
    print("\n📤 Asking model to generate code...")
    response = client.chat.completions.create(
        model=model,
        messages=messages
    )
    
    initial_response = response.choices[0].message.content
    print(f"\n📥 Model response:\n{initial_response}")
    
    # Step 2: Extract and execute code
    code_blocks = extract_python_code(initial_response)
    
    if not code_blocks:
        print("\n⚠️ No Python code found in response")
        return initial_response
    
    print(f"\n🔧 Found {len(code_blocks)} code block(s). Executing...")
    
    for i, code in enumerate(code_blocks):
        print(f"\n--- Code Block {i+1} ---")
        print(code[:500] + "..." if len(code) > 500 else code)
        
        output = execute_code(code)
        print(f"\n--- Output ---")
        print(output)
    
    # Step 3: Ask model to interpret the result
    code_output = execute_code(code_blocks[0])
    
    messages.append({"role": "assistant", "content": initial_response})
    messages.append({
        "role": "user", 
        "content": f"The code was executed. Output:\n{code_output}\n\nPlease provide the final answer based on this output."
    })
    
    print("\n📤 Asking model for final interpretation...")
    final_response = client.chat.completions.create(
        model=model,
        messages=messages
    )
    
    final_answer = final_response.choices[0].message.content
    print(f"\n📥 Final answer:\n{final_answer}")
    
    return final_answer


if __name__ == "__main__":
    # Test queries that benefit from code execution
    test_queries = [
        "How many r's are there in the word 'strawberry'?",
        "What is 17 * 23 + 456 / 12?",
        "Generate the first 10 Fibonacci numbers",
    ]
    
    print("\n🚀 Testing Code Execution with Pollinations API\n")
    
    for query in test_queries:  # Run all tests
        result = run_with_code_execution(query)
        print(f"\n{'='*60}\n")
