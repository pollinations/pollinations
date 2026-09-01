#!/usr/bin/env python3
r"""
Pollinations AI — GIMP 3 plug-in
================================

Generate and edit images inside GIMP using the Pollinations AI image API.
Every user authenticates through their own Pollinations account via the
BYOP device-flow — no API key is ever pasted into GIMP.

Placement (restart GIMP after installing):
  Linux   : ~/.config/GIMP/3.0/plug-ins/pollinations_gimp/pollinations_gimp.py
  macOS   : ~/Library/Application Support/GIMP/3.0/plug-ins/pollinations_gimp/pollinations_gimp.py
  Windows : %APPDATA%\GIMP\3.0\plug-ins\pollinations_gimp\pollinations_gimp.py

Menu after installation:
  Filters ▸ Pollinations AI ▸ Connect / Generate / Edit / Disconnect
"""

from __future__ import annotations

import base64
import json
import os
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from pathlib import Path

# ── Constants ─────────────────────────────────────────────────────────────────

PLUGIN_VERSION = "1.0.0"
ENTER_BASE = "https://enter.pollinations.ai"
GEN_BASE = "https://gen.pollinations.ai"

# Publishable App Key that identifies this plug-in for attribution and
# developer earnings.  Replace with your own key for forks:
#   https://enter.pollinations.ai/keys
APP_KEY = "pk_pollinations_gimp"

USER_AGENT = f"pollinations-gimp/{PLUGIN_VERSION} (+https://github.com/pollinations/pollinations)"
POLL_INTERVAL_S = 5

_TOKEN_PATH = Path.home() / ".config" / "pollinations-gimp" / "token.json"


# ── Error type (user-safe messages) ───────────────────────────────────────────


class PollinationsError(Exception):
    """Error with a user-safe message, HTTP status, and API error code."""

    def __init__(
        self,
        message: str,
        *,
        status: int | None = None,
        code: str | None = None,
        payload: dict | None = None,
    ):
        super().__init__(message)
        self.status = status
        self.code = code
        self.payload = payload


def _map_error(status: int | None, payload: dict | None = None) -> PollinationsError:
    """Build a user-safe PollinationsError from a status + JSON payload."""
    code = payload.get("error") if isinstance(payload, dict) else None
    if status == 401 or code in ("invalid_token", "invalid_client", "UNAUTHORIZED"):
        return PollinationsError(
            "Your Pollinations authorization has expired or is invalid.\n"
            "Disconnect, then run Connect Account again.",
            status=status,
            code=code,
            payload=payload,
        )
    if status == 402:
        return PollinationsError(
            "Not enough Pollen balance for this request.\n"
            "Top up at enter.pollinations.ai.",
            status=status,
            code=code,
            payload=payload,
        )
    if status is not None and status == 429:
        return PollinationsError(
            "Too many requests. Wait a moment and try again.",
            status=status,
            code=code,
            payload=payload,
        )
    if status is not None and status >= 500:
        return PollinationsError(
            "Pollinations is temporarily unavailable. Try again shortly.",
            status=status,
            code=code,
            payload=payload,
        )
    if code in ("access_denied", "denied"):
        return PollinationsError(
            "Authorization was declined in the browser.", status=status, code=code, payload=payload
        )
    if code in ("expired_token",):
        return PollinationsError(
            "The approval code expired. Connect again.", status=status, code=code, payload=payload
        )
    if code in ("authorization_pending",):
        return PollinationsError(
            "Waiting for authorization.", status=status, code=code, payload=payload
        )
    if code == "timeout":
        return PollinationsError(
            "Request timed out. Try again.",
            status=status, code=code, payload=payload,
        )
    if code == "network":
        return PollinationsError(
            "Cannot reach Pollinations. Check your internet connection.",
            status=status, code=code, payload=payload,
        )
    return PollinationsError(
        f"Request failed (HTTP {status or '?'})",
        status=status,
        code=code,
        payload=payload,
    )


# ── HTTP helpers (no GIMP dependency) ─────────────────────────────────────────


def _http_json(
    url: str,
    method: str = "GET",
    payload: dict | None = None,
    token: str | None = None,
    *,
    timeout: float = 60,
    opener=None,
) -> dict | list:
    """Send a JSON request and return the parsed response.

    Raises PollinationsError on network or HTTP errors.
    The *opener* parameter is for testing (inject a mock).
    """
    body = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": USER_AGENT,
        },
        method=method or ("POST" if body else "GET"),
    )
    if token:
        req.add_header("Authorization", f"Bearer {token}")

    open_fn = opener or urllib.request.urlopen
    try:
        with open_fn(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            payload_resp = json.loads(raw.decode())
        except (UnicodeDecodeError, json.JSONDecodeError):
            payload_resp = None
        raise _map_error(exc.code, payload_resp) from None
    except (TimeoutError, urllib.error.URLError, OSError) as exc:
        timed_out = isinstance(exc, TimeoutError) or (
            isinstance(exc, urllib.error.URLError) and isinstance(exc.reason, TimeoutError)
        )
        code = "timeout" if timed_out else "network"
        message = (
            "Request timed out. Try again."
            if code == "timeout"
            else "Cannot reach Pollinations. Check your internet connection."
        )
        raise PollinationsError(message, code=code) from None


def _http_bytes(url: str, token: str | None = None, *, timeout: float = 120, opener=None) -> bytes:
    """GET *url* and return raw bytes (for the image endpoint)."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    open_fn = opener or urllib.request.urlopen
    try:
        with open_fn(req, timeout=timeout) as resp:
            return resp.read()
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            payload = json.loads(raw.decode())
        except (UnicodeDecodeError, json.JSONDecodeError):
            payload = None
        raise _map_error(exc.code, payload) from None
    except (TimeoutError, urllib.error.URLError, OSError) as exc:
        timed_out = isinstance(exc, TimeoutError) or (
            isinstance(exc, urllib.error.URLError) and isinstance(exc.reason, TimeoutError)
        )
        code = "timeout" if timed_out else "network"
        message = "Request timed out." if code == "timeout" else "Cannot reach Pollinations."
        raise PollinationsError(message, code=code) from None


def _build_multipart(
    fields: list[tuple[str, str] | tuple[str, str, str, bytes]],
    boundary: str | None = None,
) -> tuple[str, bytes]:
    """Build a multipart/form-data body.

    *fields* items are (name, value) for text fields or
    (name, filename, content_type, file_bytes) for binary uploads.
    Returns (content_type, body_bytes).
    """
    if boundary is None:
        import uuid
        boundary = uuid.uuid4().hex
    parts: list[bytes] = []
    for field in fields:
        if len(field) == 2:
            name, value = field
            parts.append(
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'
                f"{value}\r\n".encode()
            )
        else:
            name, filename, content_type, data = field
            parts.append(
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'
                f"Content-Type: {content_type}\r\n\r\n".encode()
                + data
                + b"\r\n"
            )
    parts.append(f"--{boundary}--\r\n".encode())
    body = b"".join(parts)
    return f"multipart/form-data; boundary={boundary}", body


# ── Token validation / persistence ────────────────────────────────────────────


def validate_token(token: str) -> str:
    """Validate and normalize a Pollinations sk_ token."""
    token = token.strip()
    if len(token) < 8 or not token.startswith("sk_"):
        raise PollinationsError(
            "Received an invalid API token from Pollinations.",
            code="invalid_token",
        )
    return token


def save_token(token: str, path: Path = _TOKEN_PATH) -> None:
    token = validate_token(token)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        os.chmod(tmp_name, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump({"access_token": token}, handle, separators=(",", ":"))
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_name, path)
        try:
            os.chmod(path, 0o600)
        except OSError:
            pass
    except Exception:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise


def load_token(path: Path = _TOKEN_PATH) -> str | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict) or set(data) != {"access_token"}:
        return None
    try:
        return validate_token(data["access_token"])
    except PollinationsError:
        return None


def clear_token(path: Path = _TOKEN_PATH) -> None:
    try:
        path.unlink()
    except FileNotFoundError:
        pass


# ── Device-flow authentication ─────────────────────────────────────────────────


def start_device_flow(client_id: str = APP_KEY, *, requester=None) -> dict:
    """Request a device code. Returns the raw code dict."""
    return _http_json(
        f"{ENTER_BASE}/api/device/code",
        method="POST",
        payload={"client_id": client_id, "scope": "generate profile usage keys"},
        opener=requester,
    )


def poll_device_token(
    device: dict,
    client_id: str = APP_KEY,
    *,
    requester=None,
    sleep_fn=None,
    monotonic=None,
) -> str:
    """Poll until the user approves. Returns the sk_ token string.

    Raises PollinationsError on expired code, denial, or network failure.
    """
    if sleep_fn is None:
        sleep_fn = time.sleep
    if monotonic is None:
        monotonic = time.monotonic

    interval = max(1, float(device.get("interval", POLL_INTERVAL_S)))
    deadline = monotonic() + float(device.get("expires_in", 1800))

    while monotonic() < deadline:
        sleep_fn(interval)
        try:
            resp = _http_json(
                f"{ENTER_BASE}/api/device/token",
                method="POST",
                payload={
                    "device_code": device["device_code"],
                    "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                },
                opener=requester,
            )
        except PollinationsError as exc:
            if exc.code == "authorization_pending":
                continue
            if exc.code == "slow_down" or exc.payload and exc.payload.get("error") == "slow_down":
                interval += 5
                continue
            raise
        if isinstance(resp, dict) and isinstance(resp.get("access_token"), str):
            return validate_token(resp["access_token"])
        code = resp.get("error") if isinstance(resp, dict) else None
        if code == "authorization_pending":
            continue
        if code == "slow_down":
            interval += 5
            continue
        raise _map_error(400, resp)
    raise PollinationsError("The approval code expired. Connect again.", code="expired_token")


def fetch_userinfo(token: str, *, requester=None) -> dict:
    return _http_json(f"{ENTER_BASE}/api/device/userinfo", token=validate_token(token), opener=requester)


# ── Model catalogue ────────────────────────────────────────────────────────────


def fetch_image_models(token: str | None = None, *, requester=None) -> list[dict]:
    """Fetch image models from /image/models.

    Returns a filtered list of image-producing models (first-party + community).
    """
    resp = _http_json(f"{GEN_BASE}/image/models", token=token, opener=requester)
    rows = resp if isinstance(resp, list) else resp.get("data", []) if isinstance(resp, dict) else []
    if not isinstance(rows, list):
        return []
    result: list[dict] = []
    for raw in rows:
        if not isinstance(raw, dict):
            continue
        model = dict(raw)
        # Normalize aliases to snake_case for consistency
        for src, dst in [
            ("inputModalities", "input_modalities"),
            ("outputModalities", "output_modalities"),
            ("paidOnly", "paid_only"),
            ("maxReferenceImages", "max_reference_images"),
        ]:
            if dst not in model and src in model:
                model[dst] = model[src]
        category = model.get("category")
        outputs = model.get("output_modalities") or []
        if category == "video":
            continue
        if category == "image" and "image" not in outputs:
            continue
        if category not in ("image", None):
            continue
        if "image" not in outputs:
            continue
        result.append(model)
    return result


def can_edit(model: dict) -> bool:
    """True if the model accepts an image as input and produces images."""
    inputs = model.get("input_modalities") or []
    outputs = model.get("output_modalities") or []
    return "image" in inputs and "image" in outputs


def model_resolutions(model: dict) -> list[str]:
    """Return the resolutions advertised by a model, or empty list."""
    return [v for v in model.get("resolutions", []) if isinstance(v, str)]


# ── API calls ──────────────────────────────────────────────────────────────────


def generate_image(
    token: str,
    prompt: str,
    model_id: str,
    *,
    width: int = 1024,
    height: int = 1024,
    requester=None,
) -> bytes:
    """Text-to-image via GET /image/{prompt}. Returns raw image bytes."""
    encoded = urllib.parse.quote(prompt, safe="")
    url = f"{GEN_BASE}/image/{encoded}?model={urllib.parse.quote(model_id, safe='')}&width={width}&height={height}"
    return _http_bytes(url, token=validate_token(token), opener=requester)


def edit_image(
    token: str,
    prompt: str,
    model_id: str,
    source_png: bytes,
    *,
    requester=None,
) -> bytes:
    """Edit via POST /v1/images/edits (multipart). Returns decoded PNG bytes."""
    ct, body = _build_multipart([
        ("image", "layer.png", "image/png", source_png),
        ("prompt", prompt),
        ("model", model_id),
    ])
    req = urllib.request.Request(
        f"{GEN_BASE}/v1/images/edits",
        data=body,
        headers={
            "Content-Type": ct,
            "Authorization": f"Bearer {validate_token(token)}",
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
        },
        method="POST",
    )
    open_fn = requester or urllib.request.urlopen
    try:
        with open_fn(req, timeout=120) as resp:
            result = json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            payload = json.loads(raw.decode())
        except (UnicodeDecodeError, json.JSONDecodeError):
            payload = None
        raise _map_error(exc.code, payload) from None
    except (TimeoutError, urllib.error.URLError, OSError) as exc:
        code = "timeout" if isinstance(exc, TimeoutError) else "network"
        raise PollinationsError("Request timed out." if code == "timeout" else "Network error.", code=code) from None
    return _decode_b64_image(result)


def _decode_b64_image(payload: dict | list) -> bytes:
    """Decode the b64_json from an OpenAI-compatible image response."""
    try:
        data = payload.get("data", payload) if isinstance(payload, dict) else payload
        encoded = data[0]["b64_json"]
        return base64.b64decode(encoded, validate=True)
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise PollinationsError(
            "The API returned an invalid image response.", code="invalid_response"
        ) from exc


# ── GIMP-specific layer I/O (depends on Gimp + Gio at runtime) ────────────────

try:
    import gi
    gi.require_version("Gimp", "3.0")
    gi.require_version("GimpUi", "3.0")
    gi.require_version("Gtk", "3.0")
    gi.require_version("Gio", "2.0")
    from gi.repository import Gio, Gimp, GimpUi, Gtk, GLib  # noqa: E402
except (ImportError, ValueError):
    Gio = Gimp = GimpUi = Gtk = GLib = None  # tests run without GIMP


def _export_drawable_as_png(
    image: object, drawable: object, exporter=None, selection_bounds=None
) -> bytes:
    """Export a drawable (optionally cropped to selection) to PNG bytes.

    *exporter*: if provided, called as exporter(drawable, bounds) -> bytes.
        Used for unit tests. When None, uses real GIMP file operations.
    """
    bounds = selection_bounds
    width = drawable.get_width()
    height = drawable.get_height()
    if bounds:
        x1, y1, x2, y2 = bounds
        width = x2 - x1
        height = y2 - y1
    if exporter:
        return exporter(drawable, bounds)
    temp_img = Gimp.Image.new(width, height, Gimp.ImageBaseType.RGB)
    layer_copy = Gimp.Layer.new_from_drawable(drawable, temp_img)
    temp_img.insert_layer(layer_copy, None, 0)
    if bounds:
        x1, y1, x2, y2 = bounds
        _, dx, dy = drawable.get_offsets()
        layer_copy.set_offsets(dx - x1, dy - y1)
    else:
        layer_copy.set_offsets(0, 0)
    fd, path = tempfile.mkstemp(suffix=".png")
    os.close(fd)
    try:
        Gimp.file_save(
            Gimp.RunMode.NONINTERACTIVE,
            temp_img,
            Gio.File.new_for_path(path),
            None,
        )
        return Path(path).read_bytes()
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass
        try:
            temp_img.delete()
        except Exception:
            pass


def _insert_image_as_layer(
    target_image: object, data: bytes, layer_name: str
) -> None:
    """Load PNG/JPEG bytes and insert as a new top layer in *target_image*."""
    fd, path = tempfile.mkstemp(suffix=".png")
    os.close(fd)
    try:
        Path(path).write_bytes(data)
        loaded = Gimp.file_load(
            Gimp.RunMode.NONINTERACTIVE,
            Gio.File.new_for_path(path),
        )
        layers = loaded.get_layers()
        if not layers:
            raise PollinationsError("GIMP could not load the generated image.", code="import_failed")
        new_layer = Gimp.Layer.new_from_drawable(layers[0], target_image)
        new_layer.set_name(layer_name)
        target_image.insert_layer(new_layer, None, -1)
        loaded.delete()
        Gimp.displays_flush()
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


def _get_selection_bounds(image: object) -> tuple[int, int, int, int] | None:
    """Return (x1, y1, x2, y2) of the non-empty selection, or None."""
    selection = image.get_selection()
    raw = selection.bounds()
    if len(raw) == 5:
        non_empty, x1, y1, x2, y2 = raw
        if not non_empty:
            return None
    elif len(raw) == 4:
        x1, y1, x2, y2 = raw
    else:
        return None
    if x2 <= x1 or y2 <= y1:
        return None
    return int(x1), int(y1), int(x2), int(y2)


# ── GTK dialogs ────────────────────────────────────────────────────────────────


def _message(parent, text: str, error: bool = False) -> None:
    dialog = Gtk.MessageDialog(
        transient_for=parent,
        modal=True,
        message_type=(Gtk.MessageType.ERROR if error else Gtk.MessageType.INFO),
        buttons=Gtk.ButtonsType.OK,
        text=text,
    )
    dialog.run()
    dialog.destroy()


def _run_connect_dialog() -> bool:
    """Show the BYOP device-flow approval dialog. Returns True on success."""
    try:
        device = start_device_flow()
    except PollinationsError as exc:
        _message(None, f"Could not reach Pollinations:\n{exc}", error=True)
        return False
    except Exception as exc:
        _message(None, f"Connection failed:\n{exc}", error=True)
        return False

    code = device.get("user_code", "")
    uri = device.get("verification_uri_complete") or f"{ENTER_BASE}/device?user_code={urllib.parse.quote(code)}"

    dlg = Gtk.MessageDialog(
        transient_for=None,
        modal=True,
        message_type=Gtk.MessageType.INFO,
        buttons=Gtk.ButtonsType.OK_CANCEL,
        text="Open the Pollinations verification URL and approve access.",
    )
    dlg.format_secondary_text(f"Code: {code}\n{uri}")
    response = dlg.run()
    dlg.destroy()
    if response != Gtk.ResponseType.OK:
        return False

    try:
        token = poll_device_token(device)
        save_token(token)
        try:
            info = fetch_userinfo(token)
            username = info.get("preferred_username", "")
            if username:
                _message(None, f"Connected as @{username}. Happy creating!")
            else:
                _message(None, "Connected! Your Pollinations account is linked to GIMP.")
        except Exception:
            _message(None, "Connected! Your Pollinations account is linked to GIMP.")
        return True
    except PollinationsError as exc:
        _message(None, str(exc), error=True)
        return False
    except Exception as exc:
        _message(None, f"Connection failed:\n{exc}", error=True)
        return False


def _run_generate_dialog(
    image: object,
    models: list[dict],
    *,
    edit_mode: bool,
) -> dict | None:
    """Show the model/prompt picker. Returns a result dict or None on cancel."""
    if edit_mode:
        models = [m for m in models if can_edit(m)]
    if not models:
        _message(
            None,
            "No suitable models available.\n"
            "Image-editing models require a Paid Pollen balance.",
            error=True,
        )
        return None

    title = "Edit with AI" if edit_mode else "Generate Image"
    dlg = Gtk.Dialog(title=title, flags=Gtk.DialogFlags.MODAL)
    dlg.add_button("Cancel", Gtk.ResponseType.CANCEL)
    gen_btn = dlg.add_button("Generate", Gtk.ResponseType.OK)
    gen_btn.get_style_context().add_class("suggested-action")
    dlg.set_border_width(12)
    dlg.set_default_size(480, -1)

    area = dlg.get_content_area()
    area.set_spacing(8)

    # Model picker
    area.pack_start(Gtk.Label(label="Model:", xalign=0.0), False, False, 0)
    combo = Gtk.ComboBoxText()
    for m in models:
        mid = m.get("name", "")
        title_text = m.get("title") or mid
        desc = (m.get("description") or "")[:50]
        combo.append(mid, f"{title_text} — {desc}" if desc else title_text)
    combo.set_active(0)
    area.pack_start(combo, False, False, 0)

    # Prompt
    area.pack_start(Gtk.Label(label="Prompt:", xalign=0.0), False, False, 0)
    prompt_view = Gtk.TextView()
    prompt_view.set_wrap_mode(Gtk.WrapMode.WORD)
    prompt_view.set_size_request(460, 80)
    area.pack_start(prompt_view, False, False, 0)

    # Resolution (for generation only)
    resolution_combo = None
    width_spin = None
    height_spin = None
    size_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=6)
    if not edit_mode:
        default_w = default_h = 1024
        if image is not None:
            default_w = image.get_width()
            default_h = image.get_height()
        area.pack_start(Gtk.Label(label="Width:", xalign=0.0), False, False, 0)
        width_spin = Gtk.SpinButton.new_with_range(64, 4096, 64)
        width_spin.set_value(default_w)
        area.pack_start(width_spin, False, False, 0)

        area.pack_start(Gtk.Label(label="Height:", xalign=0.0), False, False, 0)
        height_spin = Gtk.SpinButton.new_with_range(64, 4096, 64)
        height_spin.set_value(default_h)
        area.pack_start(height_spin, False, False, 0)

    # Resolution tier combo (shown when model advertises resolutions)
    area.pack_start(Gtk.Label(label="Resolution:", xalign=0.0), False, False, 0)
    resolution_combo = Gtk.ComboBoxText()
    area.pack_start(resolution_combo, False, False, 0)

    # Edit checkbox (for generation mode only — toggle edit mode on/off)
    as_layer_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=4)
    as_layer_check = Gtk.CheckButton(label="Add as new layer to current image")
    if image is not None:
        as_layer_check.set_active(True)
        as_layer_box.pack_start(as_layer_check, False, False, 0)
    area.pack_start(as_layer_box, False, False, 0)

    # Status label (hidden, used for async errors)
    status_label = Gtk.Label(xalign=0.0)
    area.pack_start(status_label, False, False, 0)

    # Update resolution dropdown when model changes
    def on_model_changed(*_):
        mid = combo.get_active_id()
        chosen = next((m for m in models if m.get("name") == mid), models[0])
        resolution_combo.remove_all()
        for res in model_resolutions(chosen):
            resolution_combo.append(res, res)
        has_res = bool(model_resolutions(chosen))
        resolution_combo.set_visible(has_res)
        if has_res:
            resolution_combo.set_active(0)

    combo.connect("changed", on_model_changed)
    on_model_changed()
    dlg.show_all()
    # Hide resolution if model has none
    on_model_changed()

    response = dlg.run()
    if response != Gtk.ResponseType.OK:
        dlg.destroy()
        return None

    mid = combo.get_active_id()
    buf = prompt_view.get_buffer()
    start, end = buf.get_bounds()
    prompt = buf.get_text(start, end, False).strip()
    if not prompt:
        _message(None, "Please enter a prompt.", error=True)
        dlg.destroy()
        return None

    chosen_resolution = resolution_combo.get_active_id() if resolution_combo.get_visible() else None
    result = {
        "model": mid,
        "prompt": prompt,
        "width": int(width_spin.get_value()) if width_spin else None,
        "height": int(height_spin.get_value()) if height_spin else None,
        "add_as_layer": bool(as_layer_check.get_active()),
        "resolution": chosen_resolution,
    }
    dlg.destroy()
    return result


# ── GIMP plug-in procedure implementations ─────────────────────────────────────


def _connect(procedure, run_mode, image, drawables, config, run_data):
    GimpUi.init("pollinations-gimp")
    token = load_token()
    if token:
        try:
            info = fetch_userinfo(token)
            username = info.get("preferred_username", "you")
            _message(None, f"Already connected as @{username}.\nUse Disconnect to switch accounts.")
            return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, GLib.Error())
        except PollinationsError as exc:
            if exc.status == 401:
                clear_token()
            else:
                _message(None, f"Already connected as @{info.get('preferred_username', 'someone')}.\nUse Disconnect to switch accounts.")
                return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, GLib.Error())
        except Exception:
            pass
    if _run_connect_dialog():
        return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, GLib.Error())
    return procedure.new_return_values(Gimp.PDBStatusType.CANCEL, GLib.Error())


def _disconnect(procedure, run_mode, image, drawables, config, run_data):
    GimpUi.init("pollinations-gimp")
    clear_token()
    _message(None, "Disconnected. Your Pollinations token has been removed from this computer.")
    return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, GLib.Error())


def _generate(procedure, run_mode, image, drawables, config, run_data):
    GimpUi.init("pollinations-gimp")
    token = load_token()
    if not token:
        _message(None, "Not connected.\nGo to Filters ▸ Pollinations AI ▸ Connect Account.", error=True)
        return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, GLib.Error())

    try:
        models = fetch_image_models(token)
    except PollinationsError as exc:
        _message(None, str(exc), error=True)
        return procedure.new_return_values(Gimp.PDBStatusType.EXECUTION_ERROR, GLib.Error())
    except Exception as exc:
        _message(None, f"Could not load model list:\n{exc}", error=True)
        return procedure.new_return_values(Gimp.PDBStatusType.EXECUTION_ERROR, GLib.Error())

    if not models:
        _message(None, "No image models available.", error=True)
        return procedure.new_return_values(Gimp.PDBStatusType.EXECUTION_ERROR, GLib.Error())

    params = _run_generate_dialog(image, models, edit_mode=False)
    if not params:
        return procedure.new_return_values(Gimp.PDBStatusType.CANCEL, GLib.Error())

    target = image if params["add_as_layer"] and image is not None else None

    try:
        img_bytes = generate_image(
            token,
            params["prompt"],
            params["model"],
            width=params["width"] or 1024,
            height=params["height"] or 1024,
        )
    except PollinationsError as exc:
        _message(None, f"Generation failed:\n{exc}", error=True)
        if exc.status == 401:
            clear_token()
        return procedure.new_return_values(Gimp.PDBStatusType.EXECUTION_ERROR, GLib.Error())

    layer_name = f"Pollinations · {params['prompt'][:50]}"
    try:
        _insert_image_as_layer(target, img_bytes, layer_name)
    except Exception as exc:
        _message(None, f"Could not load the result into GIMP:\n{exc}", error=True)
        return procedure.new_return_values(Gimp.PDBStatusType.EXECUTION_ERROR, GLib.Error())
    return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, GLib.Error())


def _edit(procedure, run_mode, image, drawables, config, run_data):
    GimpUi.init("pollinations-gimp")
    token = load_token()
    if not token:
        _message(None, "Not connected.\nGo to Filters ▸ Pollinations AI ▸ Connect Account.", error=True)
        return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, GLib.Error())
    if not drawables:
        _message(None, "Open an image and select a layer to edit.", error=True)
        return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, GLib.Error())

    drawable = drawables[0] if isinstance(drawables, (list, tuple)) else drawables

    try:
        models = fetch_image_models(token)
    except PollinationsError as exc:
        _message(None, str(exc), error=True)
        return procedure.new_return_values(Gimp.PDBStatusType.EXECUTION_ERROR, GLib.Error())

    edit_models = [m for m in models if can_edit(m)]
    if not edit_models:
        _message(
            None,
            "No image-editing models available.\n"
            "Models like FLUX Kontext or nanobanana require Paid Pollen.\n"
            "Top up at enter.pollinations.ai.",
            error=True,
        )
        return procedure.new_return_values(Gimp.PDBStatusType.EXECUTION_ERROR, GLib.Error())

    params = _run_generate_dialog(image, models, edit_mode=True)
    if not params:
        return procedure.new_return_values(Gimp.PDBStatusType.CANCEL, GLib.Error())

    # Export the active drawable (crop to selection if present)
    bounds = _get_selection_bounds(image) if image is not None else None
    try:
        source_png = _export_drawable_as_png(image, drawable, selection_bounds=bounds)
    except Exception as exc:
        _message(None, f"Could not export the layer:\n{exc}", error=True)
        return procedure.new_return_values(Gimp.PDBStatusType.EXECUTION_ERROR, GLib.Error())

    try:
        result_bytes = edit_image(token, params["prompt"], params["model"], source_png)
    except PollinationsError as exc:
        _message(None, f"Edit failed:\n{exc}", error=True)
        if exc.status == 401:
            clear_token()
        return procedure.new_return_values(Gimp.PDBStatusType.EXECUTION_ERROR, GLib.Error())

    layer_name = f"AI edit · {params['prompt'][:50]}"
    try:
        _insert_image_as_layer(image, result_bytes, layer_name)
    except Exception as exc:
        _message(None, f"Could not load the result into GIMP:\n{exc}", error=True)
        return procedure.new_return_values(Gimp.PDBStatusType.EXECUTION_ERROR, GLib.Error())
    return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, GLib.Error())


# ── GIMP plug-in registration ──────────────────────────────────────────────────

if Gimp is not None:
    class PollinationsPlugin(Gimp.PlugIn):
        def do_query_procedures(self):
            return [
                "python-fu-pollinations-connect",
                "python-fu-pollinations-generate",
                "python-fu-pollinations-edit",
                "python-fu-pollinations-disconnect",
            ]

        def do_set_i18n(self, name):
            return False

        def do_create_procedure(self, name):
            procedure = Gimp.ImageProcedure.new(
                self, name, Gimp.PDBProcType.PLUGIN, self.run, None
            )
            procedure.set_image_types("*")
            procedure.set_attribution("Pollinations", "Pollinations.ai", "2026")

            if name == "python-fu-pollinations-connect":
                procedure.set_menu_label("Connect Account…")
                procedure.set_documentation(
                    "Connect your Pollinations account via BYOP device flow.",
                    "Opens a browser for approval. Your API key stays private.",
                    name,
                )
            elif name == "python-fu-pollinations-generate":
                procedure.set_menu_label("Generate Image…")
                procedure.set_documentation(
                    "Generate an image from a prompt and add it to GIMP.",
                    "Select a model, enter a prompt, and the result appears as a new image or layer.",
                    name,
                )
            elif name == "python-fu-pollinations-edit":
                procedure.set_menu_label("Edit with AI…")
                procedure.set_documentation(
                    "Send the active layer to an image-input model for editing.",
                    "The edited result is added as a new layer; the source layer is never changed.",
                    name,
                )
            elif name == "python-fu-pollinations-disconnect":
                procedure.set_menu_label("Disconnect")
                procedure.set_documentation(
                    "Remove the stored Pollinations token from this computer.",
                    "Disconnect removes saved authentication. Run Connect Account to re-authorize.",
                    name,
                )

            procedure.add_menu_path("<Image>/Filters/Pollinations AI")
            return procedure

        def run(self, procedure, run_mode, image, drawables, config, run_data):
            name = procedure.get_name()
            if name == "python-fu-pollinations-connect":
                return _connect(procedure, run_mode, image, drawables, config, run_data)
            if name == "python-fu-pollinations-generate":
                return _generate(procedure, run_mode, image, drawables, config, run_data)
            if name == "python-fu-pollinations-edit":
                return _edit(procedure, run_mode, image, drawables, config, run_data)
            if name == "python-fu-pollinations-disconnect":
                return _disconnect(procedure, run_mode, image, drawables, config, run_data)
            return procedure.new_return_values(
                Gimp.PDBStatusType.CALLING_ERROR,
                GLib.Error(f"Unknown procedure: {name}"),
            )

    if __name__ == "__main__":
        Gimp.main(PollinationsPlugin.__gtype__, sys.argv)
