"""
Pollinations API client for GIMP — reusable, no GIMP dependency.

Handles BYOP device flow, model listing, image generation and editing,
with clear errors for expired auth, insufficient Pollen, network and API
failures. Pure Python + stdlib, so it can be unit-tested without GIMP.
"""

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any, Dict, List, Optional


APP_KEY_PLACEHOLDER = "pk_gimp_pollinations_demo"
DEVICE_CODE_URL = "https://enter.pollinations.ai/api/device/code"
DEVICE_TOKEN_URL = "https://enter.pollinations.ai/api/device/token"
USERINFO_URL = "https://enter.pollinations.ai/api/device/userinfo"
IMAGE_MODELS_URL = "https://gen.pollinations.ai/image/models"
IMAGE_GENERATIONS_URL = "https://gen.pollinations.ai/v1/images/generations"
IMAGE_EDITS_URL = "https://gen.pollinations.ai/v1/images/edits"


class PollinationsError(Exception):
    """User-facing error with a short recovery hint."""

    def __init__(self, message: str, hint: str = ""):
        super().__init__(message)
        self.hint = hint


@dataclass
class DeviceCode:
    device_code: str
    user_code: str
    verification_uri: str
    verification_uri_complete: str
    expires_in: int
    interval: int = 5


@dataclass
class ModelInfo:
    id: str
    name: str
    description: str
    input_modalities: List[str]
    context_length: Optional[int] = None


def _request_json(
    url: str,
    method: str = "GET",
    headers: Optional[Dict[str, str]] = None,
    body: Optional[Dict[str, Any]] = None,
    timeout: int = 20,
) -> Dict[str, Any]:
    hdrs = {"Content-Type": "application/json"}
    if headers:
        hdrs.update(headers)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace") if e.fp else ""
        try:
            err = json.loads(raw) if raw else {}
        except Exception:
            err = {"error": raw}
        # Surface HTTP status for callers to branch on 401/402.
        err["_http_status"] = e.code
        err["_raw"] = raw
        raise PollinationsError(
            err.get("error", {}).get("message") if isinstance(err.get("error"), dict) else str(err.get("error") or raw) or f"HTTP {e.code}",
            hint=raw,
        ) from e
    except urllib.error.URLError as e:
        raise PollinationsError(
            f"Network error: {e.reason}",
            hint="Check your internet connection and try again.",
        ) from e


def request_device_code(app_key: str = APP_KEY_PLACEHOLDER) -> DeviceCode:
    """Start BYOP device flow. Returns device_code + user_code to show the user."""
    data = _request_json(
        DEVICE_CODE_URL, method="POST", body={"client_id": app_key}
    )
    # Pollinations returns device_code, user_code, verification_uri, expires_in, interval
    try:
        return DeviceCode(
            device_code=data["device_code"],
            user_code=data["user_code"],
            verification_uri=data.get("verification_uri", "https://enter.pollinations.ai/device"),
            verification_uri_complete=data.get(
                "verification_uri_complete",
                f"https://enter.pollinations.ai/device?user_code={data['user_code']}",
            ),
            expires_in=int(data.get("expires_in", 300)),
            interval=int(data.get("interval", 5)),
        )
    except KeyError as e:
        raise PollinationsError(f"Unexpected device code response: {data}") from e


def poll_for_token(device_code: str, interval: int = 5, timeout: int = 300) -> str:
    """Poll until the user approves or timeout. Returns the private sk_... key."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        time.sleep(interval)
        try:
            data = _request_json(
                DEVICE_TOKEN_URL, method="POST", body={"device_code": device_code}
            )
        except PollinationsError as e:
            # authorization_pending is not an error — keep polling
            if "authorization_pending" in str(e) or "authorization_pending" in str(e.hint):
                continue
            # expired_token, slow_down, etc.
            if "expired_token" in str(e).lower():
                raise PollinationsError(
                    "Device code expired. Please start again.",
                    hint="Run Connect again to get a new code.",
                ) from e
            raise
        # Success returns access_token
        token = data.get("access_token") or data.get("token")
        if token:
            return str(token)
        # Some Pollinations responses use error field for pending
        if data.get("error") == "authorization_pending":
            continue
        if data.get("error"):
            raise PollinationsError(str(data["error"]))
    raise PollinationsError("Timed out waiting for approval.", hint="Please try again.")


def get_user_info(private_key: str) -> Dict[str, Any]:
    """Verify the private key and return user info for the status line."""
    try:
        return _request_json(
            USERINFO_URL, headers={"Authorization": f"Bearer {private_key}"}
        )
    except PollinationsError as e:
        # 401 means expired/revoked
        raw = str(e.hint) if e.hint else str(e)
        if "401" in raw or "unauthorized" in raw.lower():
            raise PollinationsError(
                "Authorization expired or revoked. Please reconnect.",
                hint="Use Disconnect then Connect again.",
            ) from e
        raise


def list_image_models(private_key: str) -> List[ModelInfo]:
    """Load /image/models at runtime — never hardcoded. Includes community models."""
    try:
        data = _request_json(
            IMAGE_MODELS_URL, headers={"Authorization": f"Bearer {private_key}"}
        )
    except PollinationsError as e:
        raw = str(e.hint) if e.hint else str(e)
        if "401" in raw:
            raise PollinationsError(
                "Authorization expired. Please reconnect.",
                hint="Disconnect and Connect again.",
            ) from e
        if "402" in raw or "insufficient" in raw.lower() or "pollen" in raw.lower():
            raise PollinationsError(
                "Insufficient Pollen. Top up at https://enter.pollinations.ai/buy",
                hint="Check your Pollen balance.",
            ) from e
        raise
    # Pollinations returns { data: [...] } or [...] — handle both.
    models_raw = data.get("data") if isinstance(data, dict) and "data" in data else data
    if not isinstance(models_raw, list):
        raise PollinationsError(f"Unexpected models response: {data}")
    out: List[ModelInfo] = []
    for m in models_raw:
        if not isinstance(m, dict):
            continue
        mid = str(m.get("id") or m.get("name") or "")
        if not mid:
            continue
        out.append(
            ModelInfo(
                id=mid,
                name=str(m.get("name") or m.get("title") or mid),
                description=str(m.get("description") or ""),
                input_modalities=list(m.get("input_modalities") or ["text"]),
                context_length=m.get("context_length"),
            )
        )
    return out


def model_supports_image_input(model: ModelInfo) -> bool:
    return "image" in [x.lower() for x in model.input_modalities]


def generate_image(
    private_key: str,
    model: str,
    prompt: str,
    width: int = 1024,
    height: int = 1024,
    nologo: bool = True,
) -> bytes:
    """Generate an image via Pollinations. Returns PNG/JPEG bytes."""
    body: Dict[str, Any] = {
        "model": model,
        "prompt": prompt,
        "width": width,
        "height": height,
        "nologo": nologo,
        "enhance": False,
    }
    try:
        # Use the simple GET endpoint for generation — it returns image bytes directly.
        # For models that require POST /v1/images/generations, fall back to POST.
        # Minimal: try POST first for consistency with the docs.
        data = _request_json(
            IMAGE_GENERATIONS_URL,
            method="POST",
            headers={"Authorization": f"Bearer {private_key}"},
            body=body,
        )
        # Pollinations POST returns { data: [{ b64_json: ... }] } or { url: ... }
        # Handle both shapes.
        if isinstance(data, dict) and "data" in data:
            items = data["data"]
            if isinstance(items, list) and items:
                first = items[0]
                if isinstance(first, dict):
                    if "b64_json" in first and first["b64_json"]:
                        import base64

                        return base64.b64decode(str(first["b64_json"]))
                    if "url" in first and first["url"]:
                        return _download_bytes(str(first["url"]))
        # Fallback: try GET /image/{prompt}
        encoded = urllib.parse.quote(prompt, safe="")
        url = f"https://image.pollinations.ai/prompt/{encoded}?model={urllib.parse.quote(model)}&width={width}&height={height}&nologo={str(nologo).lower()}"
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {private_key}"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            if resp.status != 200:
                raise PollinationsError(f"Image generation failed: HTTP {resp.status}")
            ctype = resp.headers.get("Content-Type", "")
            if "image" not in ctype:
                raw = resp.read().decode("utf-8", errors="replace")[:500]
                raise PollinationsError(f"Unexpected response: {raw}")
            return resp.read()
    except PollinationsError:
        raise
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace") if e.fp else ""
        if e.code == 401:
            raise PollinationsError(
                "Authorization expired. Please reconnect.",
                hint="Disconnect and Connect again.",
            ) from e
        if e.code == 402:
            raise PollinationsError(
                "Insufficient Pollen. Top up at https://enter.pollinations.ai/buy",
                hint="Check https://enter.pollinations.ai/buy",
            ) from e
        raise PollinationsError(f"API error {e.code}: {raw[:300]}") from e
    except Exception as e:
        raise PollinationsError(f"Network error: {e}") from e


def edit_image(
    private_key: str,
    model: str,
    prompt: str,
    image_bytes: bytes,
    width: int = 1024,
    height: int = 1024,
) -> bytes:
    """Edit an image via Pollinations. Sends the active layer bytes for models that support image input."""
    # Pollinations image edit is POST /v1/images/edits with multipart form.
    # Minimal: reuse the same endpoint as generation but with image field.
    # The GIMP plug-in will call this only for models that advertise image input.
    import mimetypes

    boundary = "----PollinationsGimpBoundary7MA4YWxkTrZu0gW"
    # Build multipart body manually to avoid extra deps.
    body_parts: List[bytes] = []

    def add_field(name: str, value: str) -> None:
        body_parts.append(f"--{boundary}\r\n".encode())
        body_parts.append(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
        body_parts.append(f"{value}\r\n".encode())

    def add_file(name: str, filename: str, content: bytes, ctype: str) -> None:
        body_parts.append(f"--{boundary}\r\n".encode())
        body_parts.append(
            f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'.encode()
        )
        body_parts.append(f"Content-Type: {ctype}\r\n\r\n".encode())
        body_parts.append(content)
        body_parts.append(b"\r\n")

    add_field("model", model)
    add_field("prompt", prompt)
    add_field("n", "1")
    add_field("size", f"{width}x{height}")
    add_file("image", "input.png", image_bytes, "image/png")

    body_parts.append(f"--{boundary}--\r\n".encode())
    body = b"".join(body_parts)

    req = urllib.request.Request(
        IMAGE_EDITS_URL,
        data=body,
        headers={
            "Authorization": f"Bearer {private_key}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read()
            ctype = resp.headers.get("Content-Type", "")
            if "image" in ctype:
                return raw
            # JSON with b64_json
            try:
                j = json.loads(raw.decode("utf-8", errors="replace"))
                if isinstance(j, dict) and "data" in j:
                    items = j["data"]
                    if isinstance(items, list) and items and isinstance(items[0], dict):
                        if "b64_json" in items[0]:
                            import base64

                            return base64.b64decode(str(items[0]["b64_json"]))
                        if "url" in items[0]:
                            return _download_bytes(str(items[0]["url"]))
            except Exception:
                pass
            # Fallback: treat raw as image if it looks like PNG/JPEG
            if raw[:8].startswith(b"\x89PNG") or raw[:2] == b"\xff\xd8":
                return raw
            raise PollinationsError(f"Unexpected edit response: {raw[:200]!r}")
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace") if e.fp else ""
        if e.code == 401:
            raise PollinationsError("Authorization expired. Please reconnect.") from e
        if e.code == 402:
            raise PollinationsError("Insufficient Pollen. Top up at https://enter.pollinations.ai/buy") from e
        raise PollinationsError(f"Edit failed {e.code}: {raw[:300]}") from e


def _download_bytes(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "Pollinations-GIMP/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()
