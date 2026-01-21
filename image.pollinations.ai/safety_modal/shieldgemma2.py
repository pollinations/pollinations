"""
ShieldGemma 2 Modal Deployment
==============================
Safety content moderation model for images using Google's ShieldGemma 2 (4B).

Checks images against safety policies:
- Sexually Explicit content
- Dangerous Content
- Violence/Gore content

Deploy with:
    modal deploy shieldgemma2.py

Run locally:
    modal run shieldgemma2.py --image-url "https://example.com/image.jpg"

Serve as web endpoint:
    modal serve shieldgemma2.py
"""

import time
from io import BytesIO

import modal
from fastapi import Header, HTTPException
from pydantic import BaseModel

# Modal app configuration
app = modal.App("shieldgemma2")

# Expected Enter token for authentication (set via Modal secret)
ENTER_TOKEN_HEADER = "x-enter-token"

# CUDA base image with Python
cuda_version = "12.4.0"
flavor = "devel"
operating_sys = "ubuntu22.04"
tag = f"{cuda_version}-{flavor}-{operating_sys}"

cuda_dev_image = modal.Image.from_registry(
    f"nvidia/cuda:{tag}", add_python="3.11"
).entrypoint([])

# Install dependencies
shieldgemma_image = (
    cuda_dev_image.apt_install(
        "git",
        "libglib2.0-0",
        "libsm6",
        "libxrender1",
        "libxext6",
        "ffmpeg",
        "libgl1",
    )
    .pip_install(
        "transformers>=4.50.0",
        "huggingface-hub>=0.28.0",
        "accelerate>=0.33.0",
        "safetensors>=0.4.4",
        "sentencepiece>=0.2.0",
        "torch>=2.5.0",
        "pillow>=10.0.0",
        "requests>=2.31.0",
        "fastapi",
        force_build=True,
    )
    .env({
        "HF_HUB_CACHE": "/cache",
    })
)

MODEL_ID = "google/shieldgemma-2-4b-it"

MINUTES = 60

# Built-in safety policies
SAFETY_POLICIES = {
    "sexually_explicit": "The image shall not contain content that depicts explicit or graphic sexual acts (e.g., pornography, erotic nudity, depictions of rape or sexual assault).",
    "dangerous": "The image shall not contain content that facilitates or encourages activities that could cause real-world harm (e.g., building firearms and explosive devices, promotion of terrorism, instructions for suicide).",
    "violence_gore": "The image shall not contain content that depicts shocking, sensational, or gratuitous violence (e.g., excessive blood and gore, gratuitous violence against animals, extreme injury or moment of death).",
}


class CheckRequest(BaseModel):
    image_url: str | None = None
    image_base64: str | None = None
    policies: list[str] | None = None  # If None, check all policies


class SafetyResult(BaseModel):
    policy: str
    violation_probability: float
    is_violation: bool  # True if probability > 0.5


class CheckResponse(BaseModel):
    results: list[SafetyResult]
    any_violation: bool
    processing_time_ms: float


@app.cls(
    gpu="L4",  # L4 (24GB VRAM) - T4 has OOM issues with larger images
    image=shieldgemma_image,
    scaledown_window=5 * MINUTES,
    timeout=5 * MINUTES,
    max_containers=4,
    concurrency_limit=4,
    volumes={
        "/cache": modal.Volume.from_name("hf-hub-cache", create_if_missing=True),
    },
    secrets=[
        modal.Secret.from_name("enter-token", required_keys=["ENTER_TOKEN"]),
        modal.Secret.from_name("huggingface-secret", required_keys=["HF_TOKEN"]),
    ],
)
class ShieldGemma2:
    """ShieldGemma 2 image safety classification model."""
    
    @modal.enter()
    def load_model(self):
        import torch
        from transformers import AutoProcessor, ShieldGemma2ForImageClassification
        
        print(f"🚀 Loading {MODEL_ID}...")
        
        self.model = ShieldGemma2ForImageClassification.from_pretrained(
            MODEL_ID,
            device_map="auto",
            torch_dtype=torch.bfloat16,
        ).eval()
        
        self.processor = AutoProcessor.from_pretrained(MODEL_ID)
        
        print("✅ Model loaded and ready!")
    
    @modal.method()
    def check_image(
        self,
        image_bytes: bytes,
        policies: list[str] | None = None,
    ) -> dict:
        """Check an image against safety policies.
        
        Args:
            image_bytes: Raw image bytes
            policies: List of policy keys to check. If None, checks all policies.
        
        Returns:
            Dictionary with results for each policy
        """
        import torch
        from PIL import Image
        
        t0 = time.time()
        
        # Load image
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
        print(f"📷 Image loaded: {image.size}")
        
        # Process image - use built-in policies (no custom_policies needed)
        # ShieldGemma2 has built-in policies: sexually_explicit, dangerous, violence
        inputs = self.processor(
            images=[image],
            return_tensors="pt",
        ).to(self.model.device)
        
        # Determine which policies to report on
        if policies is None:
            policies = list(SAFETY_POLICIES.keys())
        valid_policies = [p for p in policies if p in SAFETY_POLICIES]
        if not valid_policies:
            raise ValueError(f"No valid policies provided. Available: {list(SAFETY_POLICIES.keys())}")
        
        # Run inference
        with torch.inference_mode():
            output = self.model(**inputs)
        
        # Extract probabilities
        # output.probabilities shape is [num_policies, 2] where:
        # - column 0 = probability of "No" (no violation / safe)
        # - column 1 = probability of "Yes" (violation)
        # NOTE: Based on testing, column 0 appears to be violation probability
        probs_tensor = output.probabilities.float().cpu()
        print(f"🔍 Probabilities shape: {probs_tensor.shape}, values: {probs_tensor}")
        
        # Extract violation probabilities (column 0 based on observed behavior)
        violation_probs = probs_tensor[:, 0].numpy().tolist()
        
        # ShieldGemma2 returns probabilities for built-in policies in order:
        # sexually_explicit, dangerous, violence (3 policies)
        builtin_policy_order = ["sexually_explicit", "dangerous", "violence_gore"]
        
        # Build results - map probabilities to policy names
        results = []
        for i, policy in enumerate(builtin_policy_order):
            if policy in valid_policies and i < len(violation_probs):
                prob = float(violation_probs[i])
                results.append({
                    "policy": policy,
                    "violation_probability": round(prob, 4),
                    "is_violation": prob > 0.5,
                })
        
        processing_time = (time.time() - t0) * 1000
        
        any_violation = any(r["is_violation"] for r in results)
        
        print(f"⏱️ Check completed in {processing_time:.0f}ms - Violation: {any_violation}")
        
        return {
            "results": results,
            "any_violation": any_violation,
            "processing_time_ms": round(processing_time, 2),
        }
    
    def _verify_token(self, token: str | None) -> None:
        """Verify the Enter token."""
        import os
        expected_token = os.environ.get("ENTER_TOKEN")
        if not expected_token:
            raise HTTPException(status_code=500, detail="ENTER_TOKEN not configured")
        
        if not token:
            print("❌ No Enter token provided")
            raise HTTPException(status_code=401, detail="Missing x-enter-token header")
        
        if token != expected_token:
            print("❌ Invalid Enter token")
            raise HTTPException(status_code=401, detail="Invalid x-enter-token")

    @modal.fastapi_endpoint(method="POST")
    def check(
        self,
        image_url: str | None = None,
        image_base64: str | None = None,
        policies: list[str] | None = None,
        x_enter_token: str | None = Header(default=None),
    ):
        """Single endpoint for image safety checking.
        
        Args:
            image_url: URL of image to check
            image_base64: Base64-encoded image data
            policies: List of policies to check (default: all)
        
        Returns:
            JSON with safety check results including:
            - results: list of {policy, violation_probability, is_violation}
            - any_violation: bool
            - processing_time_ms: float
            - available_policies: list of policy keys (for reference)
        """
        import base64
        import requests
        
        self._verify_token(x_enter_token)
        
        # Get image bytes
        if image_url:
            print(f"📥 Fetching image from URL: {image_url[:100]}...")
            response = requests.get(image_url, timeout=30)
            response.raise_for_status()
            image_bytes = response.content
        elif image_base64:
            print("📥 Decoding base64 image...")
            if image_base64.startswith("data:"):
                image_base64 = image_base64.split(",", 1)[1]
            image_bytes = base64.b64decode(image_base64)
        else:
            raise HTTPException(status_code=400, detail="Must provide image_url or image_base64")
        
        result = self.check_image.local(
            image_bytes=image_bytes,
            policies=policies,
        )
        
        # Add available policies to response for reference
        result["available_policies"] = list(SAFETY_POLICIES.keys())
        
        return result


@app.local_entrypoint()
def main(
    image_url: str = "https://huggingface.co/datasets/huggingface/documentation-images/resolve/main/bee.jpg",
    policies: str | None = None,
):
    """Check an image for safety violations."""
    import requests
    
    print(f"🔍 ShieldGemma 2 - Checking image safety...")
    print(f"📷 Image URL: {image_url}")
    
    # Fetch image
    response = requests.get(image_url, timeout=30)
    response.raise_for_status()
    image_bytes = response.content
    
    # Parse policies
    policy_list = None
    if policies:
        policy_list = [p.strip() for p in policies.split(",")]
    
    t0 = time.time()
    result = ShieldGemma2().check_image.remote(
        image_bytes=image_bytes,
        policies=policy_list,
    )
    
    print(f"\n⏱️ Total time (including cold start): {time.time() - t0:.2f}s")
    print(f"\n📊 Results:")
    for r in result["results"]:
        status = "⚠️ VIOLATION" if r["is_violation"] else "✅ Safe"
        print(f"  {r['policy']}: {r['violation_probability']:.2%} - {status}")
    
    print(f"\n🎯 Any violation: {result['any_violation']}")
