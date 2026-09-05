"""Pure-Python Pollinations API client for the GIMP plug-in.

This module intentionally uses ONLY the Python standard library
(``urllib`` / ``json`` / ``pathlib``) so it works unchanged inside GIMP 3's
bundled Python on Linux, macOS and Windows, with no pip-install step.

It is also importable *without* GIMP (no ``gi`` import), which is what makes
the unit tests runnable with plain ``python3`` on any machine.

Covers:
  * BYOP device authorization (RFC 8628 style) against enter.pollinations.ai
  * Private token persistence (atomic write, mode 0600) in a user config dir
  * Runtime model-catalog loading from gen.pollinations.ai/image/models
  * Capability parsing (image input, resolutions, community models)
  * Generate / edit request construction and binary image responses
  * A small error taxonomy mapped to clear, user-facing recovery messages
"""

from __future__ import annotations

import base64
import binascii
import json
import os
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Optional

# ---------------------------------------------------------------------------
# Public constants
# ---------------------------------------------------------------------------

ENTER_BASE = "https://enter.pollinations.ai"
GEN_BASE = "https://gen.pollinations.ai"

# Publishable App Key identifying this integration for attribution.
# Replace with your own pk_ key from https://enter.pollinations.ai/keys
# if you distribute a fork. This key is publishable by design; the private
# per-user authorization (sk_...) is obtained via the device flow below and
# is never derived from, or embedded alongside, the App Key.
APP_KEY = "pk_gimp_plugin"

DEVICE_POLL_INTERVAL_S = 5
DEFAULT_TIMEOUT_S = 30
GENERATE_TIMEOUT_S = 180


# ---------------------------------------------------------------------------
# Error taxonomy — every failure maps to a clear recovery message
# ---------------------------------------------------------------------------


class PollinationsError(RuntimeError):
    """Base class. ``recovery`` is a user-facing instruction string."""

    recovery = "Something went wrong. Please try again."

    def __init__(self, message: str = "", *, status: Optional[int] = None):
        super().__init__(message or self.recovery)
        self.status = status


class NetworkError(PollinationsError):
    recovery = (
        "Could not reach Pollinations. Check your internet connection "
        "and firewall settings, then try again."
    )


class AuthExpiredError(PollinationsError):
    recovery = (
        "Your Pollinations authorization has expired or been revoked. "
        "Use 'Connect Account' to authorize again."
    )


class InsufficientPollenError(PollinationsError):
    recovery = (
        "Insufficient Pollen balance for this model. "
        "Add balance or pick a free-tier model at https://enter.pollinations.ai"
    )


class DeviceFlowError(PollinationsError):
    """Terminal device-flow error (denied, expired code, bad response)."""

    recovery = "Authorization could not be completed. Please try connecting again."


class APIError(PollinationsError):
    recovery = "The Pollinations API returned an error. Please try again later."


def map_http_error(status: int, body: bytes) -> PollinationsError:
    """Translate an HTTP error status + body into the error taxonomy."""
    detail = ""
    try:
        payload = json.loads(body.decode("utf-8", "replace"))
        if isinstance(payload, dict):
            detail = str(payload.get("error") or payload.get("message") or "")
    except (ValueError, UnicodeDecodeError):
        detail = body.decode("utf-8", "replace")[:200]
    if status in (401, 403):
        return AuthExpiredError(status=status)
    if status == 402:
        return InsufficientPollenError(status=status)
    message = f"Pollinations API error (HTTP {status})" + (f": {detail}" if detail else "")
    return APIError(message, status=status)


# ---------------------------------------------------------------------------
# Minimal JSON HTTP helper
# ---------------------------------------------------------------------------


def _json_request(
    url: str,
    payload: Optional[dict] = None,
    *,
    token: Optional[str] = None,
    timeout: int = DEFAULT_TIMEOUT_S,
    opener: Optional[Callable] = None,
) -> Any:
    """POST/GET JSON with an optional bearer token. No third-party deps."""
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Accept": "application/json", "Content-Type": "application/json"},
        method="POST" if data is not None else "GET",
    )
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    open_fn = opener or urllib.request.urlopen
    try:
        with open_fn(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise map_http_error(exc.code, exc.read()) from None
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise NetworkError(f"Network error contacting {urllib.parse.urlparse(url).netloc}: {exc}") from None


# ---------------------------------------------------------------------------
# BYOP device authorization (RFC 8628 style)
# ---------------------------------------------------------------------------


@dataclass
class DeviceSession:
    device_code: str
    user_code: str
    verification_uri: str
    verification_uri_complete: str
    interval: int = DEVICE_POLL_INTERVAL_S
    expires_in: int = 600


def start_device_flow(
    client_id: str = APP_KEY,
    *,
    opener: Optional[Callable] = None,
    enter_base: str = ENTER_BASE,
) -> DeviceSession:
    """Request a device code. The App Key goes as ``client_id`` for attribution."""
    resp = _json_request(
        f"{enter_base}/api/device/code",
        {"client_id": client_id},
        opener=opener,
    )
    try:
        verification_uri = resp["verification_uri"]
        if verification_uri.startswith("/"):
            verification_uri = enter_base + verification_uri
        user_code = resp["user_code"]
        return DeviceSession(
            device_code=resp["device_code"],
            user_code=user_code,
            verification_uri=verification_uri,
            verification_uri_complete=resp.get("verification_uri_complete")
            or f"{verification_uri}?user_code={urllib.parse.quote(user_code)}",
            interval=int(resp.get("interval") or DEVICE_POLL_INTERVAL_S),
            expires_in=int(resp.get("expires_in") or 600),
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise DeviceFlowError(f"Invalid device-code response from Pollinations: {exc}") from None


def poll_device_token(
    session: DeviceSession,
    *,
    opener: Optional[Callable] = None,
    enter_base: str = ENTER_BASE,
) -> Optional[str]:
    """One poll round.

    Returns the user-authorized ``sk_...`` token once approved, ``None`` while
    the user has not finished yet (pending / slow_down), and raises
    :class:`DeviceFlowError` on terminal failures (denied, expired).
    """
    try:
        resp = _json_request(
            f"{enter_base}/api/device/token",
            {"device_code": session.device_code},
            opener=opener,
        )
    except APIError as exc:
        raise DeviceFlowError(str(exc), status=exc.status) from None
    if not isinstance(resp, dict):
        raise DeviceFlowError("Unexpected response while polling for authorization.")
    error = resp.get("error")
    if error in ("authorization_pending", "slow_down"):
        return None
    if error:
        raise DeviceFlowError(str(resp.get("error_description") or error))
    token = resp.get("access_token")
    if isinstance(token, str) and token:
        return token
    raise DeviceFlowError("Unexpected response while polling for authorization.")


def fetch_userinfo(token: str, *, opener: Optional[Callable] = None) -> dict:
    """Return the OIDC userinfo for a connected account (who am I)."""
    resp = _json_request(f"{ENTER_BASE}/api/device/userinfo", token=token, opener=opener)
    return resp if isinstance(resp, dict) else {}


# ---------------------------------------------------------------------------
# Token persistence — private, atomic, survives restarts
# ---------------------------------------------------------------------------


def default_token_path() -> Path:
    """Per-user config location, platform-appropriate.

    Linux:   ~/.config/pollinations-gimp/token.json   (XDG_CONFIG_HOME aware)
    macOS:   ~/Library/Application Support/pollinations-gimp/token.json
    Windows: %APPDATA%\\pollinations-gimp\\token.json
    """
    if sys.platform.startswith("win"):
        base = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming"))
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))
    return base / "pollinations-gimp" / "token.json"


def save_token(token: str, path: Optional[Path] = None) -> Path:
    """Persist the user authorization atomically with mode 0600."""
    path = Path(path) if path else default_token_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=".token.", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump({"access_token": token}, fh)
            fh.flush()
            os.fsync(fh.fileno())
        try:
            os.chmod(tmp_name, 0o600)
        except OSError:
            pass  # Windows has no POSIX modes
        os.replace(tmp_name, path)
    except Exception:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise
    return path


def load_token(path: Optional[Path] = None) -> Optional[str]:
    """Return the stored user token, or None if absent/corrupt."""
    path = Path(path) if path else default_token_path()
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    token = payload.get("access_token") if isinstance(payload, dict) else None
    return token if isinstance(token, str) and token else None


def delete_token(path: Optional[Path] = None) -> None:
    path = Path(path) if path else default_token_path()
    try:
        path.unlink()
    except FileNotFoundError:
        pass


# ---------------------------------------------------------------------------
# Model catalog — loaded at runtime, capabilities drive the UI
# ---------------------------------------------------------------------------


@dataclass
class ImageModel:
    """One entry of the /image/models catalog."""

    id: str
    title: str = ""
    description: str = ""
    input_modalities: list = field(default_factory=list)
    output_modalities: list = field(default_factory=list)
    resolutions: list = field(default_factory=list)
    paid_only: bool = False
    community: bool = False

    @property
    def supports_image_input(self) -> bool:
        """True when the model advertises image input (editing)."""
        return "image" in self.input_modalities

    @property
    def display_name(self) -> str:
        label = self.title or self.id
        if self.community:
            label += " (community)"
        if self.paid_only:
            label += " [paid]"
        return label


def parse_models(payload: Any) -> list[ImageModel]:
    """Parse the /image/models response into ImageModel objects.

    Accepts either an OpenAI-style {"object": "list", "data": [...]} envelope
    or a bare list. Tolerates missing/extra fields — no model IDs are
    hardcoded anywhere in the plug-in.
    """
    rows = payload.get("data", []) if isinstance(payload, dict) else payload
    if not isinstance(rows, list):
        return []
    models: list[ImageModel] = []
    for raw in rows:
        if not isinstance(raw, dict):
            continue
        model_id = raw.get("id") or raw.get("name")
        if not isinstance(model_id, str) or not model_id:
            continue
        outputs = raw.get("outputModalities") or raw.get("output_modalities") or []
        # Skip non-image output models (e.g. video) — they are out of scope.
        if outputs and "image" not in outputs:
            continue
        if raw.get("category") not in (None, "image"):
            continue
        models.append(
            ImageModel(
                id=model_id,
                title=str(raw.get("title") or model_id),
                description=str(raw.get("description") or ""),
                input_modalities=list(raw.get("inputModalities") or raw.get("input_modalities") or ["text"]),
                output_modalities=list(outputs),
                resolutions=[r for r in (raw.get("resolutions") or []) if isinstance(r, str)],
                paid_only=bool(raw.get("paidOnly") or raw.get("paid_only")),
                community=bool(raw.get("community")),
            )
        )
    return models


def fetch_models(token: Optional[str] = None, *, opener: Optional[Callable] = None) -> list[ImageModel]:
    """Load the live image-model catalog for the connected account."""
    return parse_models(_json_request(f"{GEN_BASE}/image/models", token=token, opener=opener))


def editing_models(models: list[ImageModel]) -> list[ImageModel]:
    """Subset of models that accept image input (for the edit dialog)."""
    return [m for m in models if m.supports_image_input]


# ---------------------------------------------------------------------------
# Generate / edit request construction
# ---------------------------------------------------------------------------


def png_data_uri(png_bytes: bytes) -> str:
    """Encode a layer/selection PNG export as a data URI for the API."""
    return "data:image/png;base64," + base64.b64encode(png_bytes).decode("ascii")


def build_image_request(
    prompt: str,
    model: ImageModel,
    *,
    width: Optional[int] = None,
    height: Optional[int] = None,
    seed: Optional[int] = None,
    input_image_png: Optional[bytes] = None,
) -> tuple[str, dict]:
    """Build (url, json_body) for POST /image/{prompt}.

    Capability-driven: the ``image`` field is only ever sent for models that
    advertise image input; size fields are omitted when not requested.
    """
    if not prompt.strip():
        raise PollinationsError("Please enter a prompt.")
    url = f"{GEN_BASE}/image/{urllib.parse.quote(prompt, safe='')}"
    body: dict[str, Any] = {"model": model.id}
    if width:
        body["width"] = int(width)
    if height:
        body["height"] = int(height)
    if seed is not None:
        body["seed"] = int(seed)
    if input_image_png is not None:
        if not model.supports_image_input:
            raise PollinationsError(f"Model '{model.id}' does not accept image input.")
        body["image"] = png_data_uri(input_image_png)
    return url, body


def request_image(
    prompt: str,
    model: ImageModel,
    token: str,
    *,
    width: Optional[int] = None,
    height: Optional[int] = None,
    seed: Optional[int] = None,
    input_image_png: Optional[bytes] = None,
    opener: Optional[Callable] = None,
) -> bytes:
    """Run a generate (or edit, when input_image_png is given) request.

    Returns the raw image bytes of the result.
    """
    url, body = build_image_request(
        prompt, model, width=width, height=height, seed=seed, input_image_png=input_image_png
    )
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )
    open_fn = opener or urllib.request.urlopen
    try:
        with open_fn(req, timeout=GENERATE_TIMEOUT_S) as resp:
            data = resp.read()
    except urllib.error.HTTPError as exc:
        raise map_http_error(exc.code, exc.read()) from None
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise NetworkError(f"Network error during image generation: {exc}") from None
    if not data:
        raise APIError("Pollinations returned an empty response.")
    return data


def decode_image_payload(payload: Any) -> bytes:
    """Decode an OpenAI-style {"data": [{"b64_json": ...}]} image response."""
    try:
        encoded = payload["data"][0]["b64_json"]
        return base64.b64decode(encoded, validate=True)
    except (KeyError, IndexError, TypeError, ValueError, binascii.Error):
        raise APIError("Pollinations returned no usable image data.") from None
