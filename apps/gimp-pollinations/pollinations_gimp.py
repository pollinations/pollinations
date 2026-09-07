#!/usr/bin/env python3
"""
Pollinations AI — GIMP 3 Plug-in (BYOP)

Generate and edit images inside GIMP 3 using the Pollinations AI API.
Each user authenticates through their own Pollinations account via
the BYOP device flow (RFC 8628).

Pure standard library — no pip packages required.
"""

from __future__ import annotations

import base64
import json
import os
import platform
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Callable, Optional

try:
    import gi
    gi.require_version("Gimp", "3.0")
    gi.require_version("Gtk", "3.0")
    gi.require_version("Gegl", "0.4")
    from gi.repository import Gimp, Gtk, Gegl, GObject
    GIMP_AVAILABLE = True
except (ImportError, ValueError):
    GIMP_AVAILABLE = False

# ============================================================================
# Configuration
# ============================================================================

GEN_BASE = "https://gen.pollinations.ai"
AUTH_BASE = "https://enter.pollinations.ai"
DEVICE_CODE_ENDPOINT = f"{AUTH_BASE}/api/device/code"
DEVICE_TOKEN_ENDPOINT = f"{AUTH_BASE}/api/device/token"
MODELS_ENDPOINT = f"{GEN_BASE}/image/models"
IMAGE_GEN_ENDPOINT = f"{GEN_BASE}/v1/images/generations"
IMAGE_EDIT_ENDPOINT = f"{GEN_BASE}/v1/images/edits"

APP_KEY = "pk_gimp_pollinations_plugin"
CLIENT_ID = "gimp-pollinations-plugin"
SCOPE = "generate"

POLL_INTERVAL_S = 5
POLL_TIMEOUT_S = 180

# ============================================================================
# Token Storage (atomic, cross-platform)
# ============================================================================

def _get_config_dir() -> str:
    """Get platform-native config directory for GIMP 3.0."""
    system = platform.system()
    if system == "Windows":
        base = os.environ.get("APPDATA", os.path.expanduser("~"))
    elif system == "Darwin":
        base = os.path.expanduser("~/Library/Application Support")
    else:
        base = os.environ.get("XDG_CONFIG_HOME", os.path.expanduser("~/.config"))
    path = os.path.join(base, "GIMP", "3.0", "pollinations")
    os.makedirs(path, exist_ok=True)
    return path


def _get_token_path() -> str:
    return os.path.join(_get_config_dir(), "token.json")


def load_token() -> Optional[str]:
    """Load the stored device token, if any."""
    path = _get_token_path()
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r") as f:
            data = json.load(f)
        return data.get("token")
    except (json.JSONDecodeError, OSError):
        return None


def save_token(token: str) -> None:
    """Atomically save the device token to disk."""
    path = _get_token_path()
    fd, tmp = tempfile.mkstemp(
        dir=os.path.dirname(path),
        suffix=".tmp",
    )
    try:
        with os.fdopen(fd, "w") as f:
            json.dump({"token": token}, f)
        os.chmod(tmp, 0o600)
        os.rename(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def clear_token() -> None:
    """Delete the stored token."""
    path = _get_token_path()
    try:
        os.unlink(path)
    except FileNotFoundError:
        pass


# ============================================================================
# Error Types
# ============================================================================

class PollinationsError(Exception):
    """Base error for Pollinations API issues."""
    def __init__(self, message: str, code: str = "ERROR"):
        super().__init__(message)
        self.code = code


class AuthError(PollinationsError):
    """Authorization required or expired."""
    def __init__(self, message: str = "Authorization required. Please connect your account."):
        super().__init__(message, "AUTH_REQUIRED")


class InsufficientPollenError(PollinationsError):
    """Not enough Pollen balance."""
    def __init__(self, message: str = "Insufficient Pollen balance. Please top up your account."):
        super().__init__(message, "INSUFFICIENT_POLLEN")


class NetworkError(PollinationsError):
    """Network connectivity issue."""
    def __init__(self, message: str = "Network error. Please check your connection and try again."):
        super().__init__(message, "NETWORK_ERROR")


class ApiError(PollinationsError):
    """Generic API error."""
    def __init__(self, message: str, status: int = 500):
        super().__init__(message, f"API_ERROR_{status}")
        self.status = status


# ============================================================================
# HTTP Helpers
# ============================================================================

def _request(
    url: str,
    data: Optional[bytes] = None,
    headers: Optional[dict[str, str]] = None,
    method: str = "GET",
    timeout: int = 30,
) -> tuple[int, bytes, dict[str, str]]:
    """Make an HTTP request and return (status, body, response_headers)."""
    req = urllib.request.Request(url, data=data, method=method)
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read()
            resp_headers = dict(resp.headers.items())
            return resp.status, body, resp_headers
    except urllib.error.HTTPError as e:
        body = e.read()
        resp_headers = dict(e.headers.items()) if e.headers else {}
        return e.code, body, resp_headers
    except urllib.error.URLError as e:
        raise NetworkError(f"Connection failed: {e.reason}") from e
    except TimeoutError as e:
        raise NetworkError("Request timed out. Please try again.") from e


def _json_request(
    url: str,
    data: Optional[dict[str, Any]] = None,
    token: Optional[str] = None,
    method: str = "GET",
) -> Any:
    """Make a JSON HTTP request and return the parsed response."""
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    body = None
    if data is not None:
        headers["Content-Type"] = "application/json"
        body = json.dumps(data).encode("utf-8")

    status, resp_body, _ = _request(url, data=body, headers=headers, method=method)
    resp_text = resp_body.decode("utf-8", errors="replace")

    if status == 401 or status == 403:
        clear_token()
        raise AuthError()
    if status == 402:
        raise InsufficientPollenError()
    if status >= 500:
        try:
            err_data = json.loads(resp_text)
            msg = err_data.get("message", err_data.get("error", "Server error"))
        except json.JSONDecodeError:
            msg = f"Server error (HTTP {status})"
        raise ApiError(msg, status)

    try:
        return json.loads(resp_text)
    except json.JSONDecodeError:
        raise ApiError(f"Invalid JSON response (HTTP {status})", status)


# ============================================================================
# Device Flow (RFC 8628)
# ============================================================================

def request_device_code() -> dict[str, Any]:
    """Request a device code for the device authorization flow."""
    data = urllib.parse.urlencode({
        "client_id": CLIENT_ID,
        "scope": SCOPE,
    }).encode("utf-8")

    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    status, body, _ = _request(
        DEVICE_CODE_ENDPOINT,
        data=data,
        headers=headers,
        method="POST",
    )

    if status != 200:
        raise ApiError(f"Failed to request device code (HTTP {status})", status)

    result = json.loads(body.decode("utf-8"))
    return result


def poll_device_token(device_code: str) -> Optional[str]:
    """Poll for the device token. Returns the token if approved, None if still pending."""
    data = urllib.parse.urlencode({
        "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
        "device_code": device_code,
        "client_id": CLIENT_ID,
    }).encode("utf-8")

    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    try:
        status, body, _ = _request(
            DEVICE_TOKEN_ENDPOINT,
            data=data,
            headers=headers,
            method="POST",
        )
    except NetworkError:
        raise

    if status == 200:
        result = json.loads(body.decode("utf-8"))
        return result.get("access_token")

    # Still pending or other non-error status
    return None


# ============================================================================
# Model Catalog
# ============================================================================

def fetch_models(token: Optional[str] = None) -> list[dict[str, Any]]:
    """Fetch the image model catalog from Pollinations."""
    data = _json_request(MODELS_ENDPOINT, token=token)
    models = data.get("data", data) if isinstance(data, dict) else data
    if not isinstance(models, list):
        models = []
    # Filter to image models only
    return [
        m for m in models
        if m.get("category") == "image" or "image" in m.get("outputModalities", [])
    ]


def get_model_by_id(models: list[dict[str, Any]], model_id: str) -> Optional[dict[str, Any]]:
    """Find a model by its ID."""
    for m in models:
        if m.get("id") == model_id or m.get("name") == model_id:
            return m
    return None


def supports_image_input(model: dict[str, Any]) -> bool:
    """Check if a model supports image input for editing."""
    input_modalities = model.get("inputModalities", [])
    return "image" in input_modalities


# ============================================================================
# Image Generation
# ============================================================================

def generate_image(
    prompt: str,
    model: str = "flux",
    width: int = 1024,
    height: int = 1024,
    seed: Optional[int] = None,
    token: Optional[str] = None,
) -> bytes:
    """Generate an image from a text prompt. Returns raw image bytes."""
    payload: dict[str, Any] = {
        "prompt": prompt,
        "model": model,
        "width": width,
        "height": height,
        "response_format": "b64_json",
    }
    if seed is not None:
        payload["seed"] = seed

    result = _json_request(IMAGE_GEN_ENDPOINT, data=payload, token=token, method="POST")
    data = result.get("data", [])
    if not data:
        raise ApiError("No image data in response")

    item = data[0]
    b64 = item.get("b64_json")
    if b64:
        return base64.b64decode(b64)
    url = item.get("url")
    if url:
        _, img_bytes, _ = _request(url)
        return img_bytes
    raise ApiError("No image data or URL in response")


def edit_image(
    prompt: str,
    image_bytes: bytes,
    model: str = "flux-kontext-pro",
    width: int = 1024,
    height: int = 1024,
    token: Optional[str] = None,
) -> bytes:
    """Edit an image using a prompt. Returns raw image bytes."""
    b64_image = base64.b64encode(image_bytes).decode("utf-8")
    payload: dict[str, Any] = {
        "prompt": prompt,
        "model": model,
        "image": f"data:image/png;base64,{b64_image}",
        "width": width,
        "height": height,
        "response_format": "b64_json",
    }

    result = _json_request(IMAGE_EDIT_ENDPOINT, data=payload, token=token, method="POST")
    data = result.get("data", [])
    if not data:
        raise ApiError("No image data in response")

    item = data[0]
    b64 = item.get("b64_json")
    if b64:
        return base64.b64decode(b64)
    url = item.get("url")
    if url:
        _, img_bytes, _ = _request(url)
        return img_bytes
    raise ApiError("No image data or URL in response")


# ============================================================================
# GIMP Plugin
# ============================================================================

class PollinationsPlugin(Gimp.PlugIn):
    """GIMP 3 plug-in for Pollinations AI image generation."""

    def __init__(self):
        super().__init__()
        self._poll_thread: Optional[threading.Thread] = None
        self._poll_cancel = threading.Event()

    def do_query_procedures(self):
        return [
            "plug-in-pollinations-connect",
            "plug-in-pollinations-disconnect",
            "plug-in-pollinations-generate",
            "plug-in-pollinations-edit",
        ]

    def do_create_procedure(self, name: str):
        procedure = Gimp.ImageProcedure.new(
            self, name,
            Gimp.PDBProcType.PLUGIN,
            getattr(self, f"_run_{name.replace('plug-in-pollinations-', '').replace('-', '_')}"),
            None,
        )

        procedure.set_menu_label("Pollinations AI")
        procedure.add_menu_path("<Image>/Filters/AI")

        if name == "plug-in-pollinations-connect":
            procedure.set_menu_label("Connect Account...")
        elif name == "plug-in-pollinations-disconnect":
            procedure.set_menu_label("Disconnect Account")
        elif name == "plug-in-pollinations-generate":
            procedure.set_menu_label("Generate Image...")
        elif name == "plug-in-pollinations-edit":
            procedure.set_menu_label("Edit with AI...")

        return procedure

    def _run_connect(self, procedure, run_mode, image, drawables, config, data):
        if run_mode != Gimp.RunMode.INTERACTIVE:
            return procedure.new_return_values(Gimp.PDBStatusType.CALLING_ERROR, "Interactive only")

        # Check if already connected
        token = load_token()
        if token:
            dialog = Gtk.MessageDialog(
                message_type=Gtk.MessageType.INFO,
                buttons=Gtk.ButtonsType.OK,
                text="Already connected to Pollinations.",
            )
            dialog.format_secondary_text("You are already connected. Use Disconnect first to re-authorize.")
            dialog.run()
            dialog.destroy()
            return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, None)

        # Start device flow
        try:
            device_data = request_device_code()
        except (ApiError, NetworkError) as e:
            dialog = Gtk.MessageDialog(
                message_type=Gtk.MessageType.ERROR,
                buttons=Gtk.ButtonsType.OK,
                text="Failed to start authorization.",
            )
            dialog.format_secondary_text(str(e))
            dialog.run()
            dialog.destroy()
            return procedure.new_return_values(Gimp.PDBStatusType.CALLING_ERROR, str(e))

        device_code = device_data.get("device_code", "")
        verification_uri = device_data.get("verification_uri", "")
        verification_uri_complete = device_data.get("verification_uri_complete", verification_uri)
        interval = device_data.get("interval", POLL_INTERVAL_S)
        expires_in = device_data.get("expires_in", POLL_TIMEOUT_S)

        # Show authorization dialog
        dialog = Gtk.Dialog(
            title="Connect Pollinations Account",
            flags=Gtk.DialogFlags.MODAL,
        )
        dialog.set_default_size(400, 200)

        content = dialog.get_content_area()
        content.set_spacing(12)
        content.set_margin_top(12)
        content.set_margin_bottom(12)
        content.set_margin_start(12)
        content.set_margin_end(12)

        label = Gtk.Label()
        label.set_markup(f"<b>Authorize Pollinations in your browser</b>\n\n"
                        f"1. Open this URL in your browser:\n"
                        f"<a href='{verification_uri_complete}'>{verification_uri_complete}</a>\n\n"
                        f"2. Enter this code: <b>{device_data.get('user_code', '')}</b>\n\n"
                        f"3. Waiting for authorization...")
        label.set_line_wrap(True)
        label.set_selectable(True)
        content.pack_start(label, True, True, 0)

        spinner = Gtk.Spinner()
        spinner.start()
        content.pack_start(spinner, False, False, 0)

        open_btn = Gtk.Button(label="Open Browser")
        open_btn.connect("clicked", lambda _: self._open_browser(verification_uri_complete))
        content.pack_start(open_btn, False, False, 0)

        cancel_btn = dialog.add_button("Cancel", Gtk.ResponseType.CANCEL)
        dialog.show_all()

        # Poll in background
        self._poll_cancel.clear()
        result_token: list[Optional[str]] = [None]
        error_msg: list[Optional[str]] = [None]

        def _poll():
            start = time.time()
            while not self._poll_cancel.is_set():
                if time.time() - start > expires_in:
                    error_msg[0] = "Authorization code expired. Please try again."
                    break
                try:
                    tok = poll_device_token(device_code)
                    if tok:
                        result_token[0] = tok
                        break
                except NetworkError as e:
                    error_msg[0] = str(e)
                    break
                time.sleep(interval)
            # Close dialog when done
            Gtk.main_quit()

        self._poll_thread = threading.Thread(target=_poll, daemon=True)
        self._poll_thread.start()

        response = dialog.run()
        self._poll_cancel.set()

        if response == Gtk.ResponseType.CANCEL:
            dialog.destroy()
            return procedure.new_return_values(Gimp.PDBStatusType.CANCEL, "User cancelled")

        dialog.destroy()

        if error_msg[0]:
            err_dialog = Gtk.MessageDialog(
                message_type=Gtk.MessageType.ERROR,
                buttons=Gtk.ButtonsType.OK,
                text="Authorization failed.",
            )
            err_dialog.format_secondary_text(error_msg[0])
            err_dialog.run()
            err_dialog.destroy()
            return procedure.new_return_values(Gimp.PDBStatusType.CALLING_ERROR, error_msg[0])

        if result_token[0]:
            save_token(result_token[0])
            success_dialog = Gtk.MessageDialog(
                message_type=Gtk.MessageType.INFO,
                buttons=Gtk.ButtonsType.OK,
                text="Connected successfully!",
            )
            success_dialog.format_secondary_text("You can now generate and edit images with Pollinations.")
            success_dialog.run()
            success_dialog.destroy()
            return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, None)

        return procedure.new_return_values(Gimp.PDBStatusType.CALLING_ERROR, "Unknown error")

    def _run_disconnect(self, procedure, run_mode, image, drawables, config, data):
        clear_token()
        dialog = Gtk.MessageDialog(
            message_type=Gtk.MessageType.INFO,
            buttons=Gtk.ButtonsType.OK,
            text="Disconnected from Pollinations.",
        )
        dialog.format_secondary_text("Your authorization has been removed.")
        dialog.run()
        dialog.destroy()
        return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, None)

    def _run_generate(self, procedure, run_mode, image, drawables, config, data):
        if run_mode != Gimp.RunMode.INTERACTIVE:
            return procedure.new_return_values(Gimp.PDBStatusType.CALLING_ERROR, "Interactive only")

        token = load_token()
        if not token:
            dialog = Gtk.MessageDialog(
                message_type=Gtk.MessageType.ERROR,
                buttons=Gtk.ButtonsType.OK,
                text="Not connected to Pollinations.",
            )
            dialog.format_secondary_text("Please connect your account first via Filters > Pollinations AI > Connect Account.")
            dialog.run()
            dialog.destroy()
            return procedure.new_return_values(Gimp.PDBStatusType.CALLING_ERROR, "Not connected")

        # Fetch models
        try:
            models = fetch_models(token)
        except (ApiError, NetworkError) as e:
            dialog = Gtk.MessageDialog(
                message_type=Gtk.MessageType.ERROR,
                buttons=Gtk.ButtonsType.OK,
                text="Failed to load models.",
            )
            dialog.format_secondary_text(str(e))
            dialog.run()
            dialog.destroy()
            return procedure.new_return_values(Gimp.PDBStatusType.CALLING_ERROR, str(e))

        if not models:
            dialog = Gtk.MessageDialog(
                message_type=Gtk.MessageType.ERROR,
                buttons=Gtk.ButtonsType.OK,
                text="No image models available.",
            )
            dialog.run()
            dialog.destroy()
            return procedure.new_return_values(Gimp.PDBStatusType.CALLING_ERROR, "No models")

        # Show generate dialog
        dialog = Gtk.Dialog(
            title="Generate Image",
            flags=Gtk.DialogFlags.MODAL,
        )
        dialog.set_default_size(450, 350)

        content = dialog.get_content_area()
        content.set_spacing(8)
        content.set_margin_top(12)
        content.set_margin_bottom(12)
        content.set_margin_start(12)
        content.set_margin_end(12)

        # Prompt
        prompt_label = Gtk.Label(label="Prompt:")
        prompt_label.set_halign(Gtk.Align.START)
        content.pack_start(prompt_label, False, False, 0)

        prompt_entry = Gtk.Entry()
        prompt_entry.set_placeholder_text("Describe the image you want to generate...")
        content.pack_start(prompt_entry, False, False, 0)

        # Model selector
        model_label = Gtk.Label(label="Model:")
        model_label.set_halign(Gtk.Align.START)
        content.pack_start(model_label, False, False, 0)

        model_store = Gtk.ListStore(str, str)
        for m in models:
            name = m.get("name", m.get("id", "unknown"))
            model_store.append([name, name])

        model_combo = Gtk.ComboBox.new_with_model(model_store)
        renderer = Gtk.CellRendererText()
        model_combo.pack_start(renderer, True)
        model_combo.add_attribute(renderer, "text", 0)
        model_combo.set_active(0)
        content.pack_start(model_combo, False, False, 0)

        # Size
        size_label = Gtk.Label(label="Size:")
        size_label.set_halign(Gtk.Align.START)
        content.pack_start(size_label, False, False, 0)

        size_store = Gtk.ListStore(str, int, int)
        for label, w, h in [("512x512", 512, 512), ("1024x1024", 1024, 1024), ("1024x768", 1024, 768), ("768x1024", 768, 1024)]:
            size_store.append([label, w, h])

        size_combo = Gtk.ComboBox.new_with_model(size_store)
        size_renderer = Gtk.CellRendererText()
        size_combo.pack_start(size_renderer, True)
        size_combo.add_attribute(size_renderer, "text", 0)
        size_combo.set_active(1)
        content.pack_start(size_combo, False, False, 0)

        # Target
        target_label = Gtk.Label(label="Add as:")
        target_label.set_halign(Gtk.Align.START)
        content.pack_start(target_label, False, False, 0)

        target_store = Gtk.ListStore(str, str)
        target_store.append(["New layer", "layer"])
        target_store.append(["New image", "image"])

        target_combo = Gtk.ComboBox.new_with_model(target_store)
        target_renderer = Gtk.CellRendererText()
        target_combo.pack_start(target_renderer, True)
        target_combo.add_attribute(target_renderer, "text", 0)
        target_combo.set_active(0)
        content.pack_start(target_combo, False, False, 0)

        dialog.add_button("Cancel", Gtk.ResponseType.CANCEL)
        dialog.add_button("Generate", Gtk.ResponseType.OK)
        dialog.show_all()

        response = dialog.run()
        if response != Gtk.ResponseType.OK:
            dialog.destroy()
            return procedure.new_return_values(Gimp.PDBStatusType.CANCEL, "User cancelled")

        prompt = prompt_entry.get_text().strip()
        if not prompt:
            dialog.destroy()
            return procedure.new_return_values(Gimp.PDBStatusType.CALLING_ERROR, "Prompt required")

        model_iter = model_combo.get_active_iter()
        model_name = model_store.get_value(model_iter, 1) if model_iter else "flux"

        size_iter = size_combo.get_active_iter()
        width = size_store.get_value(size_iter, 1) if size_iter else 1024
        height = size_store.get_value(size_iter, 2) if size_iter else 1024

        target_iter = target_combo.get_active_iter()
        target = target_store.get_value(target_iter, 1) if target_iter else "layer"

        dialog.destroy()

        # Generate
        try:
            img_bytes = generate_image(prompt, model=model_name, width=width, height=height, token=token)
        except (ApiError, NetworkError) as e:
            err_dialog = Gtk.MessageDialog(
                message_type=Gtk.MessageType.ERROR,
                buttons=Gtk.ButtonsType.OK,
                text="Generation failed.",
            )
            err_dialog.format_secondary_text(str(e))
            err_dialog.run()
            err_dialog.destroy()
            return procedure.new_return_values(Gimp.PDBStatusType.CALLING_ERROR, str(e))

        # Add to GIMP
        self._add_image_to_gimp(image, img_bytes, target, prompt)
        return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, None)

    def _run_edit(self, procedure, run_mode, image, drawables, config, data):
        if run_mode != Gimp.RunMode.INTERACTIVE:
            return procedure.new_return_values(Gimp.PDBStatusType.CALLING_ERROR, "Interactive only")

        if not drawables:
            return procedure.new_return_values(Gimp.PDBStatusType.CALLING_ERROR, "No active layer")

        token = load_token()
        if not token:
            dialog = Gtk.MessageDialog(
                message_type=Gtk.MessageType.ERROR,
                buttons=Gtk.ButtonsType.OK,
                text="Not connected to Pollinations.",
            )
            dialog.format_secondary_text("Please connect your account first.")
            dialog.run()
            dialog.destroy()
            return procedure.new_return_values(Gimp.PDBStatusType.CALLING_ERROR, "Not connected")

        # Fetch models with image input support
        try:
            all_models = fetch_models(token)
        except (ApiError, NetworkError) as e:
            dialog = Gtk.MessageDialog(
                message_type=Gtk.MessageType.ERROR,
                buttons=Gtk.ButtonsType.OK,
                text="Failed to load models.",
            )
            dialog.format_secondary_text(str(e))
            dialog.run()
            dialog.destroy()
            return procedure.new_return_values(Gimp.PDBStatusType.CALLING_ERROR, str(e))

        models = [m for m in all_models if supports_image_input(m)]
        if not models:
            dialog = Gtk.MessageDialog(
                message_type=Gtk.MessageType.ERROR,
                buttons=Gtk.ButtonsType.OK,
                text="No models support image editing.",
            )
            dialog.run()
            dialog.destroy()
            return procedure.new_return_values(Gimp.PDBStatusType.CALLING_ERROR, "No edit models")

        # Export active drawable to PNG
        drawable = drawables[0]
        try:
            img_bytes = self._export_drawable_to_png(image, drawable)
        except Exception as e:
            dialog = Gtk.MessageDialog(
                message_type=Gtk.MessageType.ERROR,
                buttons=Gtk.ButtonsType.OK,
                text="Failed to export layer.",
            )
            dialog.format_secondary_text(str(e))
            dialog.run()
            dialog.destroy()
            return procedure.new_return_values(Gimp.PDBStatusType.CALLING_ERROR, str(e))

        # Show edit dialog
        dialog = Gtk.Dialog(
            title="Edit with AI",
            flags=Gtk.DialogFlags.MODAL,
        )
        dialog.set_default_size(450, 300)

        content = dialog.get_content_area()
        content.set_spacing(8)
        content.set_margin_top(12)
        content.set_margin_bottom(12)
        content.set_margin_start(12)
        content.set_margin_end(12)

        prompt_label = Gtk.Label(label="Edit prompt:")
        prompt_label.set_halign(Gtk.Align.START)
        content.pack_start(prompt_label, False, False, 0)

        prompt_entry = Gtk.Entry()
        prompt_entry.set_placeholder_text("Describe the edit...")
        content.pack_start(prompt_entry, False, False, 0)

        model_label = Gtk.Label(label="Model:")
        model_label.set_halign(Gtk.Align.START)
        content.pack_start(model_label, False, False, 0)

        model_store = Gtk.ListStore(str, str)
        for m in models:
            name = m.get("name", m.get("id", "unknown"))
            model_store.append([name, name])

        model_combo = Gtk.ComboBox.new_with_model(model_store)
        renderer = Gtk.CellRendererText()
        model_combo.pack_start(renderer, True)
        model_combo.add_attribute(renderer, "text", 0)
        model_combo.set_active(0)
        content.pack_start(model_combo, False, False, 0)

        dialog.add_button("Cancel", Gtk.ResponseType.CANCEL)
        dialog.add_button("Edit", Gtk.ResponseType.OK)
        dialog.show_all()

        response = dialog.run()
        if response != Gtk.ResponseType.OK:
            dialog.destroy()
            return procedure.new_return_values(Gimp.PDBStatusType.CANCEL, "User cancelled")

        prompt = prompt_entry.get_text().strip()
        if not prompt:
            dialog.destroy()
            return procedure.new_return_values(Gimp.PDBStatusType.CALLING_ERROR, "Prompt required")

        model_iter = model_combo.get_active_iter()
        model_name = model_store.get_value(model_iter, 1) if model_iter else models[0].get("name", "flux")

        dialog.destroy()

        # Edit
        try:
            result_bytes = edit_image(prompt, img_bytes, model=model_name, token=token)
        except (ApiError, NetworkError) as e:
            err_dialog = Gtk.MessageDialog(
                message_type=Gtk.MessageType.ERROR,
                buttons=Gtk.ButtonsType.OK,
                text="Edit failed.",
            )
            err_dialog.format_secondary_text(str(e))
            err_dialog.run()
            err_dialog.destroy()
            return procedure.new_return_values(Gimp.PDBStatusType.CALLING_ERROR, str(e))

        # Add result as new layer
        self._add_image_to_gimp(image, result_bytes, "layer", prompt)
        return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, None)

    def _add_image_to_gimp(self, image, img_bytes: bytes, target: str, name: str):
        """Add image bytes to GIMP as new layer or new image."""
        # Create temp file
        fd, tmp_path = tempfile.mkstemp(suffix=".png")
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(img_bytes)

            if target == "image":
                # Load as new image
                img = Gimp.file_load(Gimp.RunMode.NONINTERACTIVE, Gio.File.new_for_path(tmp_path), None)
                Gimp.Display.new(img)
            else:
                # Add as new layer
                layer = Gimp.file_load_layer(Gimp.RunMode.NONINTERACTIVE, image, Gio.File.new_for_path(tmp_path), None)
                image.insert_layer(layer, None, 0)
                layer.set_name(name[:64])
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    def _export_drawable_to_png(self, image, drawable) -> bytes:
        """Export a drawable to PNG bytes."""
        fd, tmp_path = tempfile.mkstemp(suffix=".png")
        os.close(fd)
        try:
            Gimp.file_save(Gimp.RunMode.NONINTERACTIVE, image, drawable, Gio.File.new_for_path(tmp_path), None)
            with open(tmp_path, "rb") as f:
                return f.read()
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    @staticmethod
    def _open_browser(url: str):
        """Open URL in default browser."""
        import webbrowser
        webbrowser.open(url)


# ============================================================================
# Entry Point
# ============================================================================

if GIMP_AVAILABLE:
    Gimp.main(PollinationsPlugin.__gtype__, __file__)
