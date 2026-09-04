#!/usr/bin/env python3
"""
Pollinations AI plug-in for GIMP 3.

Provides image generation and editing using Pollinations models with
Bring Your Own Pollen (BYOP) device authorization. Users connect their
own Pollinations account — no API key is ever pasted into GIMP.

Installation:
  Copy pollinations.py to your GIMP 3 plug-in directory:
    Linux:   ~/.config/GIMP/3.0/plug-ins/
    macOS:   ~/Library/Application Support/GIMP/3.0/plug-ins/
    Windows: %APPDATA%\GIMP\3.0\plug-ins\

  Then restart GIMP. The plug-in appears under Filters > AI > Pollinations.
"""

import json
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

try:
    from gi.repository import Gimp, GimpUi, GLib, Gtk, Gio, Pango
    import gi

    gi.require_version("Gimp", "3.0")
    gi.require_version("GimpUi", "3.0")
    HAS_GIMP = True
except ImportError:
    HAS_GIMP = False

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

APP_KEY = "pk_gimp_pollinations_001"
GEN_BASE = "https://gen.pollinations.ai"
ENTER_BASE = "https://enter.pollinations.ai"
CONFIG_DIR = Path.home() / ".config" / "pollinations-gimp"
TOKEN_FILE = CONFIG_DIR / "token.json"
MODELS_CACHE_FILE = CONFIG_DIR / "models_cache.json"
MODELS_CACHE_TTL = 3600  # 1 hour

# ---------------------------------------------------------------------------
# Token storage
# ---------------------------------------------------------------------------


def _ensure_config_dir():
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)


def load_token():
    """Load stored access token, or None if not authenticated."""
    if not TOKEN_FILE.exists():
        return None
    try:
        data = json.loads(TOKEN_FILE.read_text())
        if data.get("access_token"):
            return data["access_token"]
    except (json.JSONDecodeError, OSError):
        pass
    return None


def save_token(access_token):
    _ensure_config_dir()
    TOKEN_FILE.write_text(json.dumps({"access_token": access_token}))
    # Restrict permissions on Unix
    try:
        TOKEN_FILE.chmod(0o600)
    except OSError:
        pass


def clear_token():
    if TOKEN_FILE.exists():
        TOKEN_FILE.unlink()


# ---------------------------------------------------------------------------
# Pollinations API helpers
# ---------------------------------------------------------------------------


def _api_request(url, method="GET", data=None, headers=None, token=None):
    """Make an authenticated API request. Returns parsed JSON or raises."""
    headers = headers or {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if data is not None:
        headers["Content-Type"] = "application/json"
        body = json.dumps(data).encode()
    else:
        body = None

    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body_text = ""
        try:
            body_text = e.read().decode()
        except Exception:
            pass
        raise RuntimeError(
            f"API error {e.code}: {body_text[:200] or e.reason}"
        ) from e


def fetch_models(token=None):
    """Fetch available image models, with local caching."""
    # Check cache
    if MODELS_CACHE_FILE.exists():
        try:
            cache = json.loads(MODELS_CACHE_FILE.read_text())
            if time.time() - cache.get("ts", 0) < MODELS_CACHE_TTL:
                return cache["models"]
        except (json.JSONDecodeError, OSError, KeyError):
            pass

    models = _api_request(f"{GEN_BASE}/image/models", token=token)
    # Cache
    _ensure_config_dir()
    MODELS_CACHE_FILE.write_text(
        json.dumps({"ts": time.time(), "models": models})
    )
    return models


def generate_image(prompt, model, width, height, seed=None, token=None):
    """Generate an image via the Pollinations GET endpoint. Returns image bytes."""
    params = {
        "model": model,
        "width": str(width),
        "height": str(height),
        "nologo": "true",
    }
    if seed is not None:
        params["seed"] = str(seed)

    url = f"{GEN_BASE}/image/{urllib.parse.quote(prompt)}?{urllib.parse.urlencode(params)}"
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return resp.read(), resp.headers.get("Content-Type", "image/png")
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Generation failed: {e.code} {e.reason}") from e


def edit_image(prompt, image_url, model, token=None):
    """Edit an image via the POST endpoint. Returns image bytes."""
    data = {
        "model": model,
        "prompt": prompt,
        "image": [image_url],
    }
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    url = f"{GEN_BASE}/v1/images/generations"
    result = _api_request(url, method="POST", data=data, headers=headers, token=token)

    # The POST endpoint returns URLs; download the first one
    if isinstance(result, dict) and "data" in result:
        img_data = result["data"]
        if isinstance(img_data, list) and len(img_data) > 0:
            img_url = img_data[0].get("url") or img_data[0].get("b64_json")
            if img_url and img_url.startswith("http"):
                req = urllib.request.Request(img_url)
                with urllib.request.urlopen(req, timeout=120) as resp:
                    return resp.read(), resp.headers.get("Content-Type", "image/png")
            elif img_url:
                # base64 encoded
                import base64
                return base64.b64decode(img_url), "image/png"

    raise RuntimeError("Edit failed: unexpected response format")


# ---------------------------------------------------------------------------
# Device flow authentication
# ---------------------------------------------------------------------------


def device_flow_authenticate(progress_callback=None):
    """
    Run the OAuth device flow. Returns access_token on success, None on cancel.
    progress_callback(message) is called with status updates.
    """
    _ensure_config_dir()

    # Step 1: Request device code
    if progress_callback:
        progress_callback("Requesting device code...")

    code_data = _api_request(
        f"{ENTER_BASE}/api/device/code",
        method="POST",
        data={"client_id": APP_KEY},
    )

    device_code = code_data["device_code"]
    user_code = code_data["user_code"]
    verification_uri = code_data.get("verification_uri_complete") or (
        f"{ENTER_BASE}/device?user_code={user_code}"
    )
    interval = code_data.get("interval", 5)

    if progress_callback:
        progress_callback(
            f"Go to:\n{verification_uri}\n\nEnter code: {user_code}"
        )

    # Step 2: Poll for token
    deadline = time.time() + 600  # 10 minutes
    while time.time() < deadline:
        time.sleep(interval)
        try:
            token_data = _api_request(
                f"{ENTER_BASE}/api/device/token",
                method="POST",
                data={"device_code": device_code},
            )
        except RuntimeError:
            continue

        if "access_token" in token_data:
            return token_data["access_token"]

        error = token_data.get("error", "")
        if error == "authorization_pending":
            continue
        elif error == "slow_down":
            interval += 5
            continue
        elif error in ("expired_token", "access_denied"):
            return None

    return None


# ---------------------------------------------------------------------------
# GIMP plug-in UI (only loaded when GIMP is available)
# ---------------------------------------------------------------------------

if HAS_GIMP:

    class PollinationsDialog(GimpUi.Dialog):
        """Main Pollinations generation dialog."""

        def __init__(self, run_mode, image, drawable):
            super().__init__(
                title="Pollinations AI",
                role="pollinations-gimp",
                run_mode=run_mode,
                image=image,
                drawable=drawable,
            )

            self.image = image
            self.drawable = drawable
            self.token = load_token()
            self.models = []
            self.selected_model = None

            self._build_ui()
            self._check_auth()

        def _build_ui(self):
            box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=8)
            self.get_content_area().append(box)
            box.set_margin_top(12)
            box.set_margin_bottom(12)
            box.set_margin_start(12)
            box.set_margin_end(12)

            # Auth status
            self.auth_label = Gtk.Label(label="Not connected")
            self.auth_label.set_xalign(0)
            box.append(self.auth_label)

            self.connect_btn = Gtk.Button(label="Connect Pollinations Account")
            self.connect_btn.connect("clicked", self._on_connect)
            box.append(self.connect_btn)

            self.disconnect_btn = Gtk.Button(label="Disconnect")
            self.disconnect_btn.connect("clicked", self._on_disconnect)
            self.disconnect_btn.set_visible(False)
            box.append(self.disconnect_btn)

            # Separator
            box.append(Gtk.Separator(orientation=Gtk.Orientation.HORIZONTAL))

            # Model selector
            model_label = Gtk.Label(label="Model:")
            model_label.set_xalign(0)
            box.append(model_label)

            self.model_store = Gtk.ListStore(str, str)  # display_name, model_id
            self.model_combo = Gtk.ComboBox(model=self.model_store)
            renderer_text = Gtk.CellRendererText()
            self.model_combo.pack_start(renderer_text, True)
            self.model_combo.add_attribute(renderer_text, "text", 0)
            self.model_combo.connect("changed", self._on_model_changed)
            box.append(self.model_combo)

            # Prompt
            prompt_label = Gtk.Label(label="Prompt:")
            prompt_label.set_xalign(0)
            box.append(prompt_label)

            self.prompt_entry = Gtk.TextView()
            self.prompt_entry.set_wrap_mode(Gtk.WrapMode.WORD)
            self.prompt_entry.set_size_request(-1, 80)
            scroll = Gtk.ScrolledWindow()
            scroll.set_child(self.prompt_entry)
            scroll.set_vexpand(True)
            box.append(scroll)

            # Dimensions
            dim_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
            box.append(dim_box)

            dim_box.append(Gtk.Label(label="Width:"))
            self.width_spin = Gtk.SpinButton.new_with_range(256, 4096, 64)
            self.width_spin.set_value(1024)
            dim_box.append(self.width_spin)

            dim_box.append(Gtk.Label(label="Height:"))
            self.height_spin = Gtk.SpinButton.new_with_range(256, 4096, 64)
            self.height_spin.set_value(1024)
            dim_box.append(self.height_spin)

            # Seed (optional)
            seed_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
            box.append(seed_box)
            seed_box.append(Gtk.Label(label="Seed (optional):"))
            self.seed_entry = Gtk.SpinButton.new_with_range(0, 2147483647, 1)
            self.seed_entry.set_value(0)
            self.seed_entry.set_adjustment(
                Gtk.Adjustment.new(0, 0, 2147483647, 1, 10, 0)
            )
            seed_box.append(self.seed_entry)

            # Generate button
            self.generate_btn = Gtk.Button(label="Generate Image")
            self.generate_btn.connect("clicked", self._on_generate)
            self.generate_btn.set_sensitive(False)
            box.append(self.generate_btn)

            # Edit button (visible when drawable exists)
            self.edit_btn = Gtk.Button(label="Edit Active Layer")
            self.edit_btn.connect("clicked", self._on_edit)
            self.edit_btn.set_sensitive(False)
            self.edit_btn.set_visible(self.drawable is not None)
            box.append(self.edit_btn)

            # Status
            self.status_label = Gtk.Label(label="")
            self.status_label.set_xalign(0)
            self.status_label.set_line_wrap(True)
            box.append(self.status_label)

            self.show_all()

        def _check_auth(self):
            if self.token:
                self.auth_label.set_text("Connected")
                self.connect_btn.set_visible(False)
                self.disconnect_btn.set_visible(True)
                self._load_models()
            else:
                self.auth_label.set_text("Not connected")
                self.connect_btn.set_visible(True)
                self.disconnect_btn.set_visible(False)

        def _on_connect(self, button):
            def auth_thread():
                token = device_flow_authenticate(
                    progress_callback=lambda msg: GLib.idle_add(
                        self.status_label.set_text, msg
                    )
                )
                GLib.idle_add(self._on_auth_complete, token)

            self.connect_btn.set_sensitive(False)
            self.status_label.set_text("Starting device flow...")
            thread = threading.Thread(target=auth_thread, daemon=True)
            thread.start()

        def _on_auth_complete(self, token):
            self.connect_btn.set_sensitive(True)
            if token:
                self.token = token
                save_token(token)
                self._check_auth()
            else:
                self.status_label.set_text("Authentication cancelled or timed out.")

        def _on_disconnect(self, button):
            clear_token()
            self.token = None
            self._check_auth()
            self.status_label.set_text("Disconnected.")

        def _load_models(self):
            def load_thread():
                try:
                    models = fetch_models(self.token)
                    GLib.idle_add(self._on_models_loaded, models, None)
                except Exception as e:
                    GLib.idle_add(self._on_models_loaded, None, str(e))

            self.status_label.set_text("Loading models...")
            thread = threading.Thread(target=load_thread, daemon=True)
            thread.start()

        def _on_models_loaded(self, models, error):
            if error:
                self.status_label.set_text(f"Failed to load models: {error}")
                return

            self.models = models or []
            self.model_store.clear()

            for m in self.models:
                model_id = m.get("id", "")
                name = m.get("name") or m.get("title") or model_id
                category = m.get("category", "")
                if category == "image":
                    self.model_store.append([f"{name} ({model_id})", model_id])

            if len(self.model_store) > 0:
                self.model_combo.set_active(0)

            self.generate_btn.set_sensitive(len(self.model_store) > 0)
            self.status_label.set_text(
                f"Loaded {len(self.model_store)} image models."
            )

        def _on_model_changed(self, combo):
            idx = combo.get_active()
            if idx >= 0 and idx < len(self.model_store):
                self.selected_model = self.model_store[idx][1]

        def _get_prompt(self):
            buf = self.prompt_entry.get_buffer()
            start = buf.get_start_iter()
            end = buf.get_end_iter()
            return buf.get_text(start, end, True).strip()

        def _on_generate(self, button):
            prompt = self._get_prompt()
            if not prompt:
                self.status_label.set_text("Please enter a prompt.")
                return
            if not self.selected_model:
                self.status_label.set_text("Please select a model.")
                return

            width = int(self.width_spin.get_value())
            height = int(self.height_spin.get_value())
            seed_val = int(self.seed_entry.get_value())
            seed = seed_val if seed_val > 0 else None

            def gen_thread():
                try:
                    img_bytes, content_type = generate_image(
                        prompt, self.selected_model, width, height,
                        seed=seed, token=self.token,
                    )
                    GLib.idle_add(self._on_image_generated, img_bytes, content_type, None)
                except Exception as e:
                    GLib.idle_add(self._on_image_generated, None, None, str(e))

            self.generate_btn.set_sensitive(False)
            self.status_label.set_text("Generating...")
            thread = threading.Thread(target=gen_thread, daemon=True)
            thread.start()

        def _on_image_generated(self, img_bytes, content_type, error):
            self.generate_btn.set_sensitive(True)
            if error:
                self.status_label.set_text(f"Generation failed: {error}")
                return

            # Load image bytes into GIMP
            try:
                import tempfile
                suffix = ".png" if "png" in (content_type or "") else ".jpg"
                with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
                    f.write(img_bytes)
                    tmp_path = f.name

                # Use Gimp.file_load to import the image
                new_image = Gimp.file_load(
                    Gimp.RunMode.NONINTERACTIVE,
                    Gio.File.new_for_path(tmp_path),
                )
                display = Gimp.Display.new(new_image)
                os.unlink(tmp_path)

                self.status_label.set_text("Image generated and opened.")
            except Exception as e:
                self.status_label.set_text(f"Failed to load result: {e}")

        def _on_edit(self, button):
            prompt = self._get_prompt()
            if not prompt:
                self.status_label.set_text("Please enter a prompt.")
                return
            if not self.selected_model:
                self.status_label.set_text("Please select a model.")
                return
            if not self.drawable:
                self.status_label.set_text("No active layer to edit.")
                return

            # Check if model supports image input
            model_info = None
            for m in self.models:
                if m.get("id") == self.selected_model:
                    model_info = m
                    break

            input_modalities = model_info.get("inputModalities", []) if model_info else []
            if "image" not in input_modalities:
                self.status_label.set_text(
                    f"Model '{self.selected_model}' does not support image editing."
                )
                return

            # Export active layer to temp file for editing
            def edit_thread():
                try:
                    import tempfile
                    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp_f:
                        tmp_path = tmp_f.name
                    tmp_file = Gio.File.new_for_path(tmp_path)

                    # Flatten for export
                    tmp_image = self.image.duplicate()
                    # Merge visible layers
                    layer = Gimp.ImageMergeVisibleLayers(
                        tmp_image, Gimp.MergeClipType.CLIP_TO_IMAGE
                    )
                    tmp_image.flatten()
                    Gimp.file_save(
                        Gimp.RunMode.NONINTERACTIVE,
                        tmp_image,
                        tmp_file,
                    )

                    # Read and encode as data URI
                    with open(tmp_path, "rb") as f:
                        img_data = f.read()
                    os.unlink(tmp_path)

                    import base64
                    data_uri = (
                        f"data:image/png;base64,{base64.b64encode(img_data).decode()}"
                    )

                    img_bytes, content_type = edit_image(
                        prompt, data_uri, self.selected_model, token=self.token,
                    )
                    GLib.idle_add(self._on_image_generated, img_bytes, content_type, None)
                except Exception as e:
                    GLib.idle_add(self._on_image_generated, None, None, str(e))

            self.edit_btn.set_sensitive(False)
            self.status_label.set_text("Editing layer...")
            thread = threading.Thread(target=edit_thread, daemon=True)
            thread.start()

        def _on_edit_complete(self, img_bytes, content_type, error):
            self.edit_btn.set_sensitive(True)
            self._on_image_generated(img_bytes, content_type, error)


# ---------------------------------------------------------------------------
# GIMP plug-in entry points
# ---------------------------------------------------------------------------

if HAS_GIMP:

    def pollinations_generate(run_mode, image, drawable, data):
        """Text-to-image generation."""
        dialog = PollinationsDialog(run_mode, image, drawable)
        response = dialog.run()
        dialog.destroy()
        return (Gimp.PythonProcedure.PDB_STATUS_SUCCESS, None)

    def pollinations_edit(run_mode, image, drawable, data):
        """Edit the active layer using AI."""
        dialog = PollinationsDialog(run_mode, image, drawable)
        response = dialog.run()
        dialog.destroy()
        return (Gimp.PythonProcedure.PDB_STATUS_SUCCESS, None)

    def pollinations_connect(run_mode, image, drawable, data):
        """Connect a Pollinations account via device flow."""
        token = device_flow_authenticate()
        if token:
            save_token(token)
        return (Gimp.PythonProcedure.PDB_STATUS_SUCCESS, None)

    def pollinations_disconnect(run_mode, image, drawable, data):
        """Disconnect the current Pollinations account."""
        clear_token()
        return (Gimp.PythonProcedure.PDB_STATUS_SUCCESS, None)


# ---------------------------------------------------------------------------
# Registration (GIMP 3 plug-in protocol)
# ---------------------------------------------------------------------------

if HAS_GIMP:

    class PollinationsInit(Gimp.PlugIn):
        def do_query_procedures(self):
            return [
                "pollinations-generate",
                "pollinations-edit",
                "pollinations-connect",
                "pollinations-disconnect",
            ]

        def do_create_procedure(self, name):
            if name == "pollinations-generate":
                proc = GimpUi.PythonProcedure(
                    name,
                    "Pollinations AI",
                    "Generate an image from a text prompt using Pollinations AI",
                    "Pollinations AI",
                    "Kreggscode",
                    "2026",
                    "_Generate...",
                    None,
                    Gimp.PROCEDURE_CATEGORYFILTER,
                )
                proc.set_image_types("*")
                proc.set_sensitivity_mask(
                    Gimp.ProcedureSensitivityMask.ALWAYS
                )
                proc.connect("run", pollinations_generate)
                return proc

            elif name == "pollinations-edit":
                proc = GimpUi.PythonProcedure(
                    name,
                    "Pollinations AI",
                    "Edit the active layer using AI",
                    "Pollinations AI",
                    "Kreggscode",
                    "2026",
                    "_Edit with AI...",
                    None,
                    Gimp.PROCEDURE_CATEGORYFILTER,
                )
                proc.set_image_types("RGB*, RGBA*")
                proc.set_sensitivity_mask(
                    Gimp.ProcedureSensitivityMask.DRAWABLE
                )
                proc.connect("run", pollinations_edit)
                return proc

            elif name == "pollinations-connect":
                proc = GimpUi.PythonProcedure(
                    name,
                    "Pollinations AI",
                    "Connect your Pollinations account",
                    "Pollinations AI",
                    "Kreggscode",
                    "2026",
                    "_Connect Account...",
                    None,
                    Gimp.PROCEDURE_CATEGORYFILTER,
                )
                proc.set_image_types("*")
                proc.set_sensitivity_mask(
                    Gimp.ProcedureSensitivityMask.ALWAYS
                )
                proc.connect("run", pollinations_connect)
                return proc

            elif name == "pollinations-disconnect":
                proc = GimpUi.PythonProcedure(
                    name,
                    "Pollinations AI",
                    "Disconnect your Pollinations account",
                    "Pollinations AI",
                    "Kreggscode",
                    "2026",
                    "_Disconnect Account",
                    None,
                    Gimp.PROCEDURE_CATEGORYFILTER,
                )
                proc.set_image_types("*")
                proc.set_sensitivity_mask(
                    Gimp.ProcedureSensitivityMask.ALWAYS
                )
                proc.connect("run", pollinations_disconnect)
                return proc

    Gimp.main(PollinationsInit.__gtype__, sys.argv)
