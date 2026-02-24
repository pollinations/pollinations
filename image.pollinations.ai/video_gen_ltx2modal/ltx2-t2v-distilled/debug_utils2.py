"""Debug: check validate_prompt and PromptExecutor.execute signatures."""
import sys, os, inspect
sys.path.insert(0, "/root/comfy/ComfyUI")
import execution
print("validate_prompt signature:", inspect.signature(execution.validate_prompt))
print("\nPromptExecutor.execute signature:", inspect.signature(execution.PromptExecutor.execute))
