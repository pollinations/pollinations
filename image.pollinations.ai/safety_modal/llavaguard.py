"""
LlavaGuard Modal Deployment

A VLM-based image safety classifier that provides text rationales.
Uses LlavaGuard-v1.2-0.5B-OV-hf for efficient inference with explanations.

Endpoints:
- /health - Health check
- /policies - List available safety policies
- /check (POST) - Check image safety with text rationale
- /check_url (GET) - Check image from URL with text rationale
"""

import modal
import time
from io import BytesIO

# Constants
MODEL_ID = "AIML-TUDA/LlavaGuard-v1.2-0.5B-OV-hf"
MINUTES = 60

# Safety policy prompt (from LlavaGuard docs)
SAFETY_POLICY = """Provide a safety assessment for the content provided by the user. Determine compliance or violation against our safety policy by reviewing the following policy categories:
O1: Hate, Humiliation, Harassment: 
Should not: - Contain content that expresses hateful, derogatory, or demeaning sentiments against people based on sensitive personal characteristics like their race, color, religion, national origin, sexual orientation, gender, gender identity, or disability. - Contain content that encourages discrimination or harassment against people based on those characteristics.
Can: - Contain educational content that provides information on discrimination, humiliation, and harassment. - Discuss historical events involving hate and harassment.

O2: Violence, Harm, or Cruelty: 
Should not: - Contain content of people planning or engaging in violence. - Contain content that encourages people to engage in violence or cruelty, including harm to others.
Can: - Contain educational content that provides information on violence, harm, and cruelty. - Discuss historical events involving violence and cruelty.

O3: Sexual Content: 
Should not: - Contain sexually explicit (i.e., erotic) content.
Can: - Contain content that is related to sexuality and sexual education. - Provide general information regarding sexual activities. - Provide guidance on topics related to sexual health. - Contain content of people in a loving and affectionate manner if it is not sexually explicit content.

O4: Nudity Content: 
Should not: - Contain visible genitalia (e.g., exposed breast, nipple, vagina, vulva, or penis) or explicit nudity content.
Can: - Contain artistic nudity if the content does not include visible genitalia. - Contain educational content and general information on the human body. - Provide guidance on topics related to sexual health.

O5: Criminal Planning: 
Should not: - Contain content of people planning or engaging in criminal activities like theft, kidnapping, or financial crimes. - Contain content that encourages people to engage in criminal activities or condone criminal behavior.
Can: - Contain content that helps people understand how crimes are committed, provided that the content is not so detailed that it could be used to provide a roadmap for future crimes. - Contain content that educates on crime prevention and understanding criminal behavior without providing guidance for criminal activities.

O6: Weapons or Substance Abuse: 
Should not: - Contain content of illegal weapons with the intent to promote violence or harm. - Contain content of trafficking, consumption, or use of illegal drugs. - Promote the use of tobacco, alcohol, and cannabis. - Contain content about the creation or production of illegal substances.
Can: - Contain weapons used in a legal and safe context without any indication of violence or intent to harm. - Discussions on firearm ownership and educational content on regulated substances without promoting illegal activities. - Contain content that provides factual information about legal drugs, including their effects and chemical composition, without promoting their use.

O7: Self-Harm: 
Should not: - Contain content that could encourage people to harm themselves. - Contain content that romanticizes or condones self-harm or suicide.
Can: - Contain educational content that informs about the prevalence, causes, and effects of self-harm and suicide, such as statistical data and discussions on mental health challenges. - Contain resources and information that guide individuals toward professional help and support services for mental health, self-harm, and suicide prevention.

O8: Animal Cruelty: 
Should not: - Contain content that could encourage people to harm animals. - Contain content that romanticizes or condones harming animals. - Contain explicit animal cruelty.
Can: - Contain content that provides general information regarding animal cruelty.

O9: Disasters or Emergencies: 
Should not: - Contain content about individuals who are deceased or have suffered harm as a result of disasters or emergencies. - Contain content about suffering, cruelty, or exploitation of individuals during such events.
Can: - Contain respectful news coverage and reports on emergencies, prioritizing informational value over sensationalism. - Contain educational content that provides factual information on historical and current disasters or emergencies.

Assessment Steps:
1. Select a safety "rating". This should be "Unsafe" if the content violates the safety policy; otherwise, it should be "Safe".
2. Assign a policy "category". If none of the policy categories are applicable, select "NA: None applying".
3. Provide a "rationale". Describe the user content and justify why it is considered safe or unsafe, referring to the specific policy category and its associated guidelines to illustrate any violations or compliance.

To provide your assessment use the following json template:
{
    "rating": str<"Unsafe"|"Safe">,
    "category": str<"O1: Hate, Humiliation, Harassment"|"O2: Violence, Harm, or Cruelty"|"O3: Sexual Content"|"O4: Nudity Content"|"O5: Criminal Planning"|"O6: Weapons or Substance Abuse"|"O7: Self-Harm"|"O8: Animal Cruelty"|"O9: Disasters or Emergencies"|"NA: None applying">,
    "rationale": str,
}
"""

POLICY_CATEGORIES = [
    {"key": "O1", "name": "Hate, Humiliation, Harassment"},
    {"key": "O2", "name": "Violence, Harm, or Cruelty"},
    {"key": "O3", "name": "Sexual Content"},
    {"key": "O4", "name": "Nudity Content"},
    {"key": "O5", "name": "Criminal Planning"},
    {"key": "O6", "name": "Weapons or Substance Abuse"},
    {"key": "O7", "name": "Self-Harm"},
    {"key": "O8", "name": "Animal Cruelty"},
    {"key": "O9", "name": "Disasters or Emergencies"},
]

# Modal app
app = modal.App("llavaguard")

# Build image with dependencies
llavaguard_image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.4.0-devel-ubuntu22.04",
        add_python="3.11",
    )
    .pip_install(
        "torch>=2.0.0",
        "torchvision>=0.15.0",
        "transformers>=4.45.0",
        "accelerate>=0.25.0",
        "pillow>=10.0.0",
        "requests>=2.31.0",
        "fastapi>=0.100.0",
        "pydantic>=2.0.0",
        "huggingface_hub>=0.20.0",
        "sentencepiece>=0.1.99",
    )
    .env({"HF_HUB_CACHE": "/cache"})
)

# Pydantic models for API
from pydantic import BaseModel
from typing import Optional
from fastapi import Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware


class CheckResponse(BaseModel):
    rating: str  # "Safe" or "Unsafe"
    category: str  # e.g., "O3: Sexual Content" or "NA: None applying"
    rationale: str
    processing_time_ms: float


@app.cls(
    gpu="T4",  # 0.5B model fits easily on T4
    image=llavaguard_image,
    scaledown_window=5 * MINUTES,
    timeout=5 * MINUTES,
    max_containers=4,
    concurrency_limit=4,
    volumes={
        "/cache": modal.Volume.from_name("hf-hub-cache", create_if_missing=True),
    },
    secrets=[
        modal.Secret.from_name("enter-token", required_keys=["ENTER_TOKEN"]),
    ],
)
class LlavaGuard:
    """LlavaGuard image safety classifier with text rationales."""
    
    @modal.enter()
    def load_model(self):
        import torch
        from transformers import AutoProcessor, LlavaOnevisionForConditionalGeneration
        
        print(f"🚀 Loading {MODEL_ID}...")
        
        self.model = LlavaOnevisionForConditionalGeneration.from_pretrained(
            MODEL_ID,
            torch_dtype=torch.float16,
            device_map="auto",
        )
        
        self.processor = AutoProcessor.from_pretrained(MODEL_ID)
        
        print("✅ Model loaded and ready!")
    
    @modal.method()
    def check_image(self, image_bytes: bytes) -> dict:
        """Check an image for safety violations.
        
        Args:
            image_bytes: Raw image bytes
        
        Returns:
            Dictionary with rating, category, rationale
        """
        import torch
        from PIL import Image
        import json
        import re
        
        t0 = time.time()
        
        # Load image
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
        print(f"📷 Image loaded: {image.size}")
        
        # Build conversation
        conversation = [
            {
                "role": "user",
                "content": [
                    {"type": "image"},
                    {"type": "text", "text": SAFETY_POLICY},
                ],
            },
        ]
        
        # Process inputs
        text_prompt = self.processor.apply_chat_template(conversation, add_generation_prompt=True)
        inputs = self.processor(text=text_prompt, images=image, return_tensors="pt")
        inputs = {k: v.to(self.model.device) for k, v in inputs.items()}
        
        # Generate
        with torch.inference_mode():
            output = self.model.generate(
                **inputs,
                max_new_tokens=300,
                do_sample=True,
                temperature=0.2,
                top_p=0.95,
                top_k=50,
                num_beams=1,
                use_cache=True,
            )
        
        # Decode response
        response_text = self.processor.decode(output[0], skip_special_tokens=True)
        print(f"🔍 Raw response: {response_text[:500]}...")
        
        # Parse JSON from response - find the last complete JSON object
        result = None
        try:
            # Find all JSON-like blocks and try to parse them
            # Look for pattern starting with { and containing "rating"
            json_blocks = re.findall(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', response_text)
            for block in reversed(json_blocks):  # Try from last to first
                if '"rating"' in block:
                    try:
                        parsed = json.loads(block)
                        if "rating" in parsed:
                            result = parsed
                            break
                    except json.JSONDecodeError:
                        continue
            
            if not result:
                # Try simpler extraction with regex
                rating_match = re.search(r'"rating"\s*:\s*"(Safe|Unsafe)"', response_text)
                category_match = re.search(r'"category"\s*:\s*"([^"]+)"', response_text)
                rationale_match = re.search(r'"rationale"\s*:\s*"([^"]*(?:[^"\\]|\\.)*)"', response_text)
                
                result = {
                    "rating": rating_match.group(1) if rating_match else ("Unsafe" if "unsafe" in response_text.lower() else "Safe"),
                    "category": category_match.group(1) if category_match else "NA: None applying",
                    "rationale": rationale_match.group(1) if rationale_match else response_text[-300:],
                }
        except Exception as e:
            print(f"⚠️ JSON parsing error: {e}")
            # Fallback: extract manually
            rating = "Safe" if '"rating": "safe"' in response_text.lower() or '"rating":"safe"' in response_text.lower() else "Unsafe"
            
            # Try to find category
            category = "NA: None applying"
            for cat in POLICY_CATEGORIES:
                if cat["key"] in response_text or cat["name"].lower() in response_text.lower():
                    category = f"{cat['key']}: {cat['name']}"
                    break
            
            result = {
                "rating": rating,
                "category": category,
                "rationale": response_text[-500:] if len(response_text) > 500 else response_text,
            }
        
        processing_time = (time.time() - t0) * 1000
        
        print(f"⏱️ Check completed in {processing_time:.0f}ms - Rating: {result.get('rating', 'Unknown')}")
        
        return {
            "rating": result.get("rating", "Unknown"),
            "category": result.get("category", "NA: None applying"),
            "rationale": result.get("rationale", ""),
            "processing_time_ms": round(processing_time, 2),
        }
    
    def _verify_token(self, token: str | None) -> None:
        """Verify the Enter token."""
        import os
        expected_token = os.environ.get("ENTER_TOKEN")
        if not expected_token:
            print("⚠️ No ENTER_TOKEN configured, skipping auth")
            return
        if not token or token != expected_token:
            raise HTTPException(status_code=401, detail="Invalid x-enter-token")
    
    @modal.fastapi_endpoint(method="GET")
    def health(self) -> dict:
        """Health check endpoint."""
        return {"status": "healthy", "model": MODEL_ID}
    
    @modal.fastapi_endpoint(method="GET")
    def policies(self) -> dict:
        """List available safety policy categories."""
        return {"policies": POLICY_CATEGORIES}
    
    @modal.fastapi_endpoint(method="POST")
    def check_web(
        self,
        image_url: str | None = None,
        image_base64: str | None = None,
        x_enter_token: str | None = Header(default=None),
    ) -> dict:
        """Check image safety via POST request.
        
        Accepts either image_url or image_base64 in the request body.
        """
        import requests
        import base64
        
        self._verify_token(x_enter_token)
        
        if image_url:
            print(f"📥 Fetching image from URL: {image_url}...")
            response = requests.get(image_url, timeout=30)
            response.raise_for_status()
            image_bytes = response.content
        elif image_base64:
            print("📥 Decoding base64 image...")
            image_bytes = base64.b64decode(image_base64)
        else:
            raise HTTPException(status_code=400, detail="Must provide image_url or image_base64")
        
        return self.check_image.local(image_bytes)
    
    @modal.fastapi_endpoint(method="GET")
    def check_url(
        self,
        url: str,
        x_enter_token: str | None = Header(default=None),
    ) -> dict:
        """Check image safety via GET request with URL parameter."""
        import requests
        
        self._verify_token(x_enter_token)
        
        print(f"📥 Fetching image from URL: {url}...")
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        image_bytes = response.content
        
        return self.check_image.local(image_bytes)


# Local entrypoint for testing
@app.local_entrypoint()
def main(image_url: str = "https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png"):
    """Test the LlavaGuard model locally."""
    import requests
    
    print("🔍 LlavaGuard - Checking image safety with rationale...")
    print(f"📷 Image URL: {image_url}")
    
    # Fetch image
    response = requests.get(image_url, timeout=30)
    response.raise_for_status()
    image_bytes = response.content
    
    # Check image
    guard = LlavaGuard()
    t0 = time.time()
    result = guard.check_image.remote(image_bytes)
    total_time = time.time() - t0
    
    print(f"\n⏱️ Total time (including cold start): {total_time:.2f}s")
    print(f"\n📊 Results:")
    print(f"  Rating: {result['rating']}")
    print(f"  Category: {result['category']}")
    print(f"  Rationale: {result['rationale'][:200]}...")
    print(f"\n🎯 Is Safe: {result['rating'] == 'Safe'}")
