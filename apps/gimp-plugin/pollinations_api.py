"""Pure-standard-library Pollinations client for the GIMP plug-in.

Kept separate from the GIMP/GTK glue so it can be imported and tested
without ``gi`` (GIMP 3's bundled Python has no reliable pip environment).
Only uses the Python standard library.
"""

from __future__ import annotations

import json
import os
import shutil
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

# Pollinations App Key (publishable). Identify the integration for
# attribution; user authorization stays private. Replace with your own.
DEFAULT_CLIENT_ID = "pk_pollinations_gimp"

ENTER_BASE = "https://enter.pollinations.ai"
GEN_BASE = "https://gen.pollinations.ai"
DEVICE_CODE_URL = ENTER_BASE + "/api/device/code"
DEVICE_TOKEN_URL = ENTER_BASE + "/api/device/token"
USERINFO_URL = ENTER_BASE + "/api/device/userinfo"
MODELS_URL = GEN_BASE + "/image/models"
IMAGE_URL = GEN_BASE + "/image/"

CONFIG_DIR_NAME = "pollinations-gimp"
TOKEN_FILENAME = "token.json"

# Polling interval for the device flow (per RFC 8628).
DEVICE_POLL_INTERVAL = 5


class PollinationsError(Exception):
    """Base error with a fixed, user-facing (credential-free) message."""

    def __init__(self, message: str, *, recoverable: bool = True):
        super().__init__(message)
        self.message = message
        self.recoverable = recoverable


class AuthError(PollinationsError):
    """Expired or missing authorization."""


class PaymentError(PollinationsError):
    """Insufficient Pollen balance."""


class AuthorizationDenied(PollinationsError):
    """User denied the device authorization."""


class AuthorizationExpired(PollinationsError):
    """The device code expired before approval."""


@dataclass
class DeviceCode:
    device_code: str
    user_code: str
    verification_uri: str
    verification_uri_complete: Optional[str] = None


def _default_config_dir() -> Path:
    """Return the platform-appropriate per-user config directory."""
    if sys.platform == "win32":
        base = os.environ.get("APPDATA") or str(Path.home())
    elif sys.platform == "darwin":
        base = str(Path.home() / "Library/Application Support")
    else:  # Linux / other Unix
        base = os.environ.get("XDG_CONFIG_HOME") or str(Path.home() / ".config")
    return Path(base) / CONFIG_DIR_NAME


def _request(
    url: str,
    method: str = "GET",
    *,
    json_payload: Optional[dict] = None,
    data: Optional[bytes] = None,
    headers: Optional[dict] = None,
    timeout: float = 30,
):
    """Thin wrapper over urllib returning the parsed JSON (or raw bytes)."""
    final_headers = dict(headers or {})
    body: Optional[bytes] = data
    if json_payload is not None:
        body = json.dumps(json_payload).encode("utf-8")
        final_headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=body, headers=final_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        raise _map_status(exc.code, exc, raw)
    except urllib.error.URLError as exc:
        reason = getattr(exc, "reason", exc)
        raise PollinationsError(
            "Network error. Check your internet connection and try again."
        ) from reason
    content_type = resp_headers_get(resp, "Content-Type", "")
    if "json" in content_type or content_type == "":
        try:
            return json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            pass
    return raw


def resp_headers_get(resp, name: str, default: str = "") -> str:
    return resp.headers.get(name, default) if hasattr(resp, "headers") else default


def _map_status(code: int, exc, raw: bytes) -> PollinationsError:
    detail = ""
    try:
        body = json.loads(raw.decode("utf-8") or "{}")
        detail = str(body.get("detail") or body.get("message") or body.get("error") or "")
    except (ValueError, UnicodeDecodeError):
        pass
    if code in (401, 403):
        return AuthError("Authorization expired. Connect your account again.")
    if code == 402:
        return PaymentError(
            "Insufficient Pollen. Add balance at enter.pollinations.ai."
        )
    msg = f"The Pollinations API returned an error (HTTP {code})."
    if detail:
        msg += f" {detail}"
    return PollinationsError(msg, recoverable=False)


def request_device_code(client_id: str = DEFAULT_CLIENT_ID) -> DeviceCode:
    """Start the RFC 8628 device flow and return the code to show the user."""
    payload = json.dumps({"client_id": client_id}).encode("utf-8")
    data = _request(
        DEVICE_CODE_URL,
        "POST",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    if not isinstance(data, dict):
        raise PollinationsError("Unexpected response while starting authorization.")
    verification = data.get("verification_uri") or "/device"
    complete = data.get("verification_uri_complete")
    return DeviceCode(
        device_code=str(data["device_code"]),
        user_code=str(data["user_code"]),
        verification_uri=verification,
        verification_uri_complete=complete,
    )


def poll_device_token(
    device_code: str,
    *,
    client_id: str = DEFAULT_CLIENT_ID,
    interval: float = DEVICE_POLL_INTERVAL,
    cancel: Optional[threading.Event] = None,
) -> str:
    """Poll the device token endpoint until the user approves.

    Returns the user-authorized ``sk_...`` token. Raises
    ``AuthorizationDenied``/``AuthorizationExpired`` on terminal states and
    honours the ``cancel`` event between polls.
    """
    payload = json.dumps({"device_code": device_code}).encode("utf-8")
    while True:
        if cancel is not None and cancel.is_set():
            raise AuthorizationDenied("Authorization canceled by the user.")
        try:
            data = _request(
                DEVICE_TOKEN_URL,
                "POST",
                data=payload,
                headers={"Content-Type": "application/json"},
            )
        except AuthorizationDenied:
            raise
        except PollinationsError:
            # Network hiccup polling; keep retrying until cancelled/expired.
            data = None
        if isinstance(data, dict):
            error = data.get("error")
            if error == "authorization_pending":
                pass
            elif error == "slow_down":
                interval += 1
            elif error == "access_denied":
                raise AuthorizationDenied(
                    "Authorization was denied. You can try again anytime."
                )
            elif error == "expired_token":
                raise AuthorizationExpired(
                    "The authorization code expired. Please start over."
                )
            else:
                token = data.get("access_token")
                if token:
                    return str(token)
        if cancel is not None:
            # Sleep in short slices so cancellation is honoured promptly.
            end = time.monotonic() + interval
            while time.monotonic() < end:
                if cancel.is_set():
                    raise AuthorizationDenied(
                        "Authorization canceled by the user."
                    )
                time.sleep(min(0.2, end - time.monotonic()))
        else:
            time.sleep(interval)


def fetch_userinfo(token: str) -> dict:
    """Return the username (and other public profile info) for a token."""
    data = _request(
        USERINFO_URL,
        headers={"Authorization": f"Bearer {token}"},
    )
    if not isinstance(data, dict):
        return {}
    return data


# --------------------------------------------------------------------------
# Token storage
# --------------------------------------------------------------------------


class TokenStore:
    """Atomic, private persistence of the user's ``sk_...`` token."""

    def __init__(self, config_dir: Optional[Path] = None):
        self.config_dir = config_dir or _default_config_dir()
        self.token_file = self.config_dir / TOKEN_FILENAME

    def save(self, token: str) -> None:
        self.config_dir.mkdir(parents=True, exist_ok=True)
        tmp_fd, tmp_path = tempfile.mkstemp(
            dir=str(self.config_dir), prefix=".token-", suffix=".tmp"
        )
        try:
            with os.fdopen(tmp_fd, "w", encoding="utf-8") as fh:
                json.dump({"token": token}, fh)
            if hasattr(os, "chmod"):
                os.chmod(tmp_path, 0o600)
            os.replace(tmp_path, str(self.token_file))
        finally:
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass

    def load(self) -> Optional[str]:
        if not self.token_file.exists():
            return None
        try:
            data = json.loads(self.token_file.read_text(encoding="utf-8"))
            token = data.get("token")
            return token if isinstance(token, str) and token else None
        except (ValueError, OSError):
            return None

    def delete(self) -> None:
        try:
            self.token_file.unlink()
        except FileNotFoundError:
            pass

    def configured(self) -> bool:
        return bool(self.load())


# --------------------------------------------------------------------------
# Model catalog + image generation
# --------------------------------------------------------------------------


@dataclass
class ImageModel:
    name: str
    title: str
    description: str
    input_modalities: list
    output_modalities: list
    capabilities: list
    community: bool
    paid_only: bool

    @property
    def accepts_image(self) -> bool:
        return "image" in (self.input_modalities or [])

    @property
    def accepts_text(self) -> bool:
        return "text" in (self.input_modalities or []) or not self.input_modalities

    @property
    def label(self) -> str:
        suffix = " (community)" if self.community else ""
        return f"{self.title or self.name}{suffix}"


def load_image_models(token: str) -> list[ImageModel]:
    """Fetch the live image-model catalog for the connected account."""
    data = _request(MODELS_URL, headers={"Authorization": f"Bearer {token}"})
    if isinstance(data, dict):
        data = data.get("data", data)
    if not isinstance(data, list):
        raise PollinationsError("Could not read the Pollinations model catalog.")
    models = []
    for item in data:
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        if not name:
            continue
        # Skip non-image models (e.g. video).
        if "image" not in (item.get("category") or "image"):
            continue
        models.append(
            ImageModel(
                name=str(name),
                title=str(item.get("title") or name),
                description=str(item.get("description") or ""),
                input_modalities=item.get("input_modalities") or [],
                output_modalities=item.get("output_modalities") or [],
                capabilities=item.get("capabilities") or [],
                community=bool(item.get("community")),
                paid_only=bool(item.get("paid_only")),
            )
        )
    if not models:
        raise PollinationsError("No image models are available for this account.")
    return models


def generate_image(
    token: str,
    prompt: str,
    *,
    model: str,
    width: Optional[int] = None,
    height: Optional[int] = None,
    seed: Optional[int] = None,
    reference: Optional[bytes] = None,
    reference_mime: str = "image/png",
    timeout: float = 180,
) -> bytes:
    """Generate an image and return the raw bytes.

    If ``reference`` is given, it is sent as a data-URI ``image`` parameter
    for image-to-image editing (must be a model advertising image input).
    """
    params: dict = {"model": model}
    if reference is not None:
        params["image"] = _data_uri(reference, reference_mime)
    if width is not None:
        params["width"] = str(int(width))
    if height is not None:
        params["height"] = str(int(height))
    if seed is not None:
        params["seed"] = str(int(seed))
    url = IMAGE_URL + urllib.parse.quote(prompt) + (
        "?" + urllib.parse.urlencode(params) if params else ""
    )
    raw = _request(url, headers={"Authorization": f"Bearer {token}", "Accept": "image/*"}, timeout=timeout)
    if not isinstance(raw, (bytes, bytearray)):
        raise PollinationsError("The API did not return an image.")
    return bytes(raw)


def _data_uri(payload: bytes, mime: str) -> str:
    import base64

    return f"data:{mime};base64,{base64.b64encode(payload).decode('ascii')}"
