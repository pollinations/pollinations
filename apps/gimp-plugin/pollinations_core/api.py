import json
import uuid
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional


class PollinationsException(Exception):
    """Base exception for Pollinations API errors."""
    pass


class PollinationsAuthError(PollinationsException):
    """Raised when authentication fails or token is expired (401)."""
    pass


class PollinationsPollenError(PollinationsException):
    """Raised when user has insufficient Pollen or lacks paid model access (402/403)."""
    pass


class PollinationsAPIError(PollinationsException):
    """Raised when API returns error status code."""
    def __init__(self, message: str, status_code: Optional[int] = None):
        super().__init__(message)
        self.status_code = status_code


class PollinationsNetworkError(PollinationsException):
    """Raised when network request times out or fails."""
    pass


class ModelInfo:
    """Wrapper class representing model metadata and capabilities."""

    def __init__(self, raw_data: Dict[str, Any]):
        self.raw_data = raw_data
        self.name: str = raw_data.get("name", "")
        self.title: str = raw_data.get("title") or self.name
        self.description: str = raw_data.get("description", "")
        self.category: str = raw_data.get("category", "image")
        self.community: bool = bool(raw_data.get("community", False))

        input_mods = raw_data.get("input_modalities", ["text"])
        if isinstance(input_mods, str):
            input_mods = [input_mods]
        self.input_modalities: List[str] = input_mods

        output_mods = raw_data.get("output_modalities", ["image"])
        if isinstance(output_mods, str):
            output_mods = [output_mods]
        self.output_modalities: List[str] = output_mods

        endpoints = raw_data.get("supported_endpoints", [])
        self.supported_endpoints: List[str] = endpoints

        # Model supports image input if 'image' is in input modalities or edits endpoint is supported
        self.supports_image_input: bool = (
            "image" in self.input_modalities or
            "/v1/images/edits" in self.supported_endpoints
        )

        self.aspect_ratios: List[str] = raw_data.get("aspect_ratios") or [
            "1:1", "16:9", "9:16", "4:3", "3:4"
        ]
        self.paid_only: bool = bool(raw_data.get("paid_only", False))

        pricing = raw_data.get("pricing", {})
        self.pricing_label: str = f"{pricing.get('completionImageTokens', '')} pollen" if pricing.get("completionImageTokens") else ""

    def __repr__(self) -> str:
        return f"<ModelInfo {self.name} (title='{self.title}', img_input={self.supports_image_input})>"


class PollinationsAPIClient:
    """API Client for Pollinations Image Generation & Editing API."""

    BASE_GEN_URL = "https://gen.pollinations.ai"

    def __init__(self, token: Optional[str] = None):
        self.token = token

    def set_token(self, token: Optional[str]) -> None:
        self.token = token

    def _get_headers(self) -> Dict[str, str]:
        headers = {"User-Agent": "PollinationsGimpPlugin/1.0"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    def fetch_image_models(self) -> List[ModelInfo]:
        """
        Fetches live image models from /image/models.
        Exposes every available image model, including community models.
        """
        url = f"{self.BASE_GEN_URL}/image/models"
        req = urllib.request.Request(url, headers=self._get_headers(), method="GET")

        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 401:
                raise PollinationsAuthError("Authorization expired or invalid. Please reconnect your account.", e.code)
            elif e.code in (402, 403):
                raise PollinationsPollenError("Insufficient Pollen or paid account required to list models.", e.code)
            else:
                raise PollinationsAPIError(f"HTTP {e.code} while fetching model list.", e.code)
        except Exception as e:
            raise PollinationsNetworkError(f"Network error while fetching models: {str(e)}")

        models: List[ModelInfo] = []
        if isinstance(data, list):
            items = data
        elif isinstance(data, dict) and "data" in data:
            items = data["data"]
        else:
            items = []

        for item in items:
            model = ModelInfo(item)
            # Filter to models that produce images
            if "image" in model.output_modalities or model.category == "image":
                models.append(model)

        return models

    def generate_image(
        self,
        prompt: str,
        model: str = "flux",
        width: Optional[int] = None,
        height: Optional[int] = None,
        seed: Optional[int] = None,
        negative_prompt: Optional[str] = None,
        aspect_ratio: Optional[str] = None,
    ) -> bytes:
        """
        Generates a new image from a text prompt.
        Returns raw image bytes (PNG / JPEG).
        """
        # Try OpenAI-compatible /v1/images/generations endpoint first
        url = f"{self.BASE_GEN_URL}/v1/images/generations"
        body: Dict[str, Any] = {
            "prompt": prompt,
            "model": model,
            "response_format": "b64_json",
        }
        if width and height:
            body["size"] = f"{width}x{height}"
        elif aspect_ratio:
            body["aspect_ratio"] = aspect_ratio

        if seed is not None:
            body["seed"] = seed

        payload = json.dumps(body).encode("utf-8")
        headers = self._get_headers()
        headers["Content-Type"] = "application/json"

        req = urllib.request.Request(url, data=payload, headers=headers, method="POST")

        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                res_data = json.loads(resp.read().decode("utf-8"))
                if "data" in res_data and len(res_data["data"]) > 0:
                    first = res_data["data"][0]
                    if "b64_json" in first:
                        import base64
                        return base64.b64decode(first["b64_json"])
                    elif "url" in first:
                        # Fetch image from returned URL
                        img_req = urllib.request.Request(first["url"], headers=self._get_headers())
                        with urllib.request.urlopen(img_req, timeout=30) as img_resp:
                            return img_resp.read()
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="replace")
            if e.code == 401:
                raise PollinationsAuthError("Authorization expired or invalid. Please reconnect your account.")
            elif e.code in (402, 403):
                raise PollinationsPollenError("Insufficient Pollen or model restricted to paid accounts.")
            # Fallback to GET /image/{prompt} if POST /v1/images/generations returns 404/405/422
            if e.code not in (400, 422, 404, 405):
                raise PollinationsAPIError(f"API Error ({e.code}): {err_body}", e.code)
        except PollinationsException:
            raise
        except Exception:
            # If network error, raise network error unless fallback succeeds
            pass

        # Fallback to direct GET /image/{prompt}?model=...
        params: Dict[str, str] = {"model": model}
        if width:
            params["width"] = str(width)
        if height:
            params["height"] = str(height)
        if seed is not None:
            params["seed"] = str(seed)
        if negative_prompt:
            params["negative_prompt"] = negative_prompt

        encoded_prompt = urllib.parse.quote(prompt)
        query_str = urllib.parse.urlencode(params)
        fallback_url = f"{self.BASE_GEN_URL}/image/{encoded_prompt}?{query_str}"

        req = urllib.request.Request(fallback_url, headers=self._get_headers(), method="GET")
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.read()
        except urllib.error.HTTPError as e:
            err_msg = e.read().decode("utf-8", errors="replace")
            if e.code == 401:
                raise PollinationsAuthError("Authorization expired or invalid. Please reconnect your account.")
            elif e.code in (402, 403):
                raise PollinationsPollenError("Insufficient Pollen balance or paid model access required.")
            else:
                raise PollinationsAPIError(f"Generation failed ({e.code}): {err_msg}", e.code)
        except Exception as e:
            raise PollinationsNetworkError(f"Network error during image generation: {str(e)}")

    def edit_image(
        self,
        image_bytes: bytes,
        prompt: str,
        model: str,
        seed: Optional[int] = None,
        image_filename: str = "input_layer.png",
    ) -> bytes:
        """
        Sends an input image (from GIMP active layer/selection) for image editing/to-image generation.
        Returns edited image bytes.
        """
        url = f"{self.BASE_GEN_URL}/v1/images/edits"
        boundary = f"----WebKitFormBoundary{uuid.uuid4().hex}"

        body_parts = []

        # Form field: prompt
        body_parts.append(f"--{boundary}\r\n".encode("utf-8"))
        body_parts.append('Content-Disposition: form-data; name="prompt"\r\n\r\n'.encode("utf-8"))
        body_parts.append(f"{prompt}\r\n".encode("utf-8"))

        # Form field: model
        body_parts.append(f"--{boundary}\r\n".encode("utf-8"))
        body_parts.append('Content-Disposition: form-data; name="model"\r\n\r\n'.encode("utf-8"))
        body_parts.append(f"{model}\r\n".encode("utf-8"))

        # Form field: response_format
        body_parts.append(f"--{boundary}\r\n".encode("utf-8"))
        body_parts.append('Content-Disposition: form-data; name="response_format"\r\n\r\n'.encode("utf-8"))
        body_parts.append("b64_json\r\n".encode("utf-8"))

        if seed is not None:
            body_parts.append(f"--{boundary}\r\n".encode("utf-8"))
            body_parts.append('Content-Disposition: form-data; name="seed"\r\n\r\n'.encode("utf-8"))
            body_parts.append(f"{seed}\r\n".encode("utf-8"))

        # Form field: image file
        body_parts.append(f"--{boundary}\r\n".encode("utf-8"))
        body_parts.append(
            f'Content-Disposition: form-data; name="image"; filename="{image_filename}"\r\n'.encode("utf-8")
        )
        body_parts.append("Content-Type: image/png\r\n\r\n".encode("utf-8"))
        body_parts.append(image_bytes)
        body_parts.append("\r\n".encode("utf-8"))

        body_parts.append(f"--{boundary}--\r\n".encode("utf-8"))

        full_body = b"".join(body_parts)

        headers = self._get_headers()
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"

        req = urllib.request.Request(url, data=full_body, headers=headers, method="POST")

        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                res_data = json.loads(resp.read().decode("utf-8"))
                if "data" in res_data and len(res_data["data"]) > 0:
                    first = res_data["data"][0]
                    if "b64_json" in first:
                        import base64
                        return base64.b64decode(first["b64_json"])
                    elif "url" in first:
                        img_req = urllib.request.Request(first["url"], headers=self._get_headers())
                        with urllib.request.urlopen(img_req, timeout=30) as img_resp:
                            return img_resp.read()
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="replace")
            if e.code == 401:
                raise PollinationsAuthError("Authorization expired or invalid. Please reconnect your account.")
            elif e.code in (402, 403):
                raise PollinationsPollenError("Insufficient Pollen or model restricted to paid accounts.")
            else:
                raise PollinationsAPIError(f"Image edit failed ({e.code}): {err_body}", e.code)
        except PollinationsException:
            raise
        except Exception as e:
            raise PollinationsNetworkError(f"Network error during image editing: {str(e)}")

        raise PollinationsAPIError("No image data returned from image edit endpoint.")
