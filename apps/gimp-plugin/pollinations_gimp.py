#!/usr/bin/env python3
"""
Pollinations AI — GIMP 3 plug-in

Brings Pollinations image generation and editing into GIMP with BYOP device-flow
authorization.  Every user authenticates through their own Pollinations account;
no API key is ever pasted into GIMP.

Installation (place the whole directory at the plug-ins path for your platform):
  Linux   : ~/.config/GIMP/3.0/plug-ins/pollinations_gimp/pollinations_gimp.py
  macOS   : ~/Library/Application Support/GIMP/3.0/plug-ins/pollinations_gimp/pollinations_gimp.py
  Windows : %APPDATA%\\GIMP\\3.0\\plug-ins\\pollinations_gimp\\pollinations_gimp.py

The file must be executable:
  chmod +x pollinations_gimp.py

After restarting GIMP, the menu Filters ▸ Pollinations AI appears.
"""

from __future__ import annotations

import base64
import json
import os
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from pathlib import Path

import gi

gi.require_version("Gimp", "3.0")
gi.require_version("GimpUi", "3.0")
gi.require_version("Gtk", "3.0")
gi.require_version("GLib", "2.0")
gi.require_version("Gio", "2.0")

from gi.repository import Gio, GimpUi, GLib, Gtk
from gi.repository import Gimp  # noqa: E402  (must come after gi.require_version calls)

# ── Public constants ──────────────────────────────────────────────────────────

PLUGIN_VERSION = "1.0.0"

ENTER_BASE = "https://enter.pollinations.ai"
GEN_BASE = "https://gen.pollinations.ai"

# Publishable App Key that identifies this plug-in for attribution and developer
# earnings.  Obtain or replace your own at enter.pollinations.ai/keys.
APP_KEY = "pk_gimp_plugin"

POLL_INTERVAL_S = 5  # seconds between device-token polls

# Token is stored per-user in the GIMP config directory so it survives restarts.
_TOKEN_DIR = Path(GLib.get_user_config_dir()) / "GIMP" / "3.0" / "pollinations"
_TOKEN_FILE = _TOKEN_DIR / "token.json"


# ── Auth helpers ──────────────────────────────────────────────────────────────


def _json_request(
    url: str,
    data: dict | None = None,
    token: str | None = None,
    method: str | None = None,
) -> dict:
    """Minimal JSON HTTP helper — no third-party dependencies required."""
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method=method or ("POST" if body else "GET"),
    )
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode())


def load_token() -> str | None:
    """Return the stored user sk_ token, or None if not connected."""
    try:
        payload = json.loads(_TOKEN_FILE.read_text())
        return payload.get("access_token") or None
    except Exception:
        return None


def save_token(token: str) -> None:
    _TOKEN_DIR.mkdir(parents=True, exist_ok=True)
    _TOKEN_FILE.write_text(json.dumps({"access_token": token}))


def delete_token() -> None:
    try:
        _TOKEN_FILE.unlink()
    except FileNotFoundError:
        pass


def request_device_code() -> dict:
    """Start a BYOP device-flow session and return the code response."""
    return _json_request(
        f"{ENTER_BASE}/api/device/code",
        {"client_id": APP_KEY},
    )


def poll_device_token(device_code: str) -> str | None:
    """
    Poll for the user-authorized sk_ token.
    Returns the token string when approved, None while still pending.
    Raises on hard errors (expired code, network failure, etc.).
    """
    resp = _json_request(
        f"{ENTER_BASE}/api/device/token",
        {"device_code": device_code},
    )
    error = resp.get("error", "")
    if error in ("authorization_pending", "slow_down"):
        return None
    if "access_token" in resp:
        return resp["access_token"]
    raise RuntimeError(resp.get("error_description") or error or "Unknown error")


def get_userinfo(token: str) -> dict:
    """Fetch the OIDC userinfo for a connected account."""
    return _json_request(f"{ENTER_BASE}/api/device/userinfo", token=token)


def fetch_models(token: str | None = None) -> list[dict]:
    """
    Fetch the image model catalogue from /image/models.
    Returns a list of model dicts, each with at least 'id' and 'title'.
    Falls back to an empty list on network errors.
    """
    try:
        resp = _json_request(
            f"{GEN_BASE}/image/models",
            token=token,
        )
        if isinstance(resp, dict):
            return resp.get("data", [])
        return resp if isinstance(resp, list) else []
    except Exception:
        return []


def models_with_image_input(models: list[dict]) -> list[dict]:
    """Filter model list to those that accept an image as additional input."""
    return [m for m in models if "image" in m.get("inputModalities", [])]


# ── GIMP image I/O helpers ───────────────────────────────────────────────────


def _load_result_into_gimp(
    image_bytes: bytes,
    target_image: "Gimp.Image | None",
    layer_name: str,
) -> None:
    """
    Load raw image bytes into GIMP.
    target_image=None  → open as a new standalone image
    target_image=image → insert as a new layer on top of that image
    """
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as fh:
        fh.write(image_bytes)
        tmp_path = fh.name

    try:
        tmp_file = Gio.File.new_for_path(tmp_path)
        loaded = Gimp.file_load(Gimp.RunMode.NONINTERACTIVE, tmp_file)

        if target_image is None:
            Gimp.display_new(loaded)
        else:
            src_layer = loaded.get_active_drawable()
            new_layer = Gimp.Layer.new_from_drawable(src_layer, target_image)
            new_layer.set_name(layer_name)
            target_image.insert_layer(new_layer, None, -1)
            Gimp.image_delete(loaded)
            Gimp.displays_flush()
    finally:
        os.unlink(tmp_path)


def _export_drawable_png_bytes(
    image: "Gimp.Image",
    drawable: "Gimp.Drawable",
) -> bytes:
    """
    Export a GIMP drawable to PNG bytes via a temp file.
    The image is not modified — a throwaway duplicate is flattened instead.
    """
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as fh:
        tmp_path = fh.name

    try:
        tmp_file = Gio.File.new_for_path(tmp_path)
        # Duplicate so we can flatten without altering the source
        dup_image = image.duplicate()
        try:
            dup_image.flatten()
            flat = dup_image.get_active_drawable()
            Gimp.file_overwrite(
                Gimp.RunMode.NONINTERACTIVE,
                dup_image,
                [flat],
                tmp_file,
            )
        finally:
            Gimp.image_delete(dup_image)
        return Path(tmp_path).read_bytes()
    finally:
        os.unlink(tmp_path)


# ── Generation request ────────────────────────────────────────────────────────


def generate_image(
    prompt: str,
    model: str,
    token: str,
    *,
    width: int | None = None,
    height: int | None = None,
    input_image_b64: str | None = None,
) -> bytes:
    """
    Call the Pollinations image API and return the raw image bytes.

    If input_image_b64 is provided it is sent as a data URI in the 'image'
    parameter — supported by models whose inputModalities include 'image'.
    """
    encoded_prompt = urllib.parse.quote(prompt, safe="")
    url = f"{GEN_BASE}/image/{encoded_prompt}"

    body: dict = {"model": model}
    if width:
        body["width"] = width
    if height:
        body["height"] = height
    if input_image_b64:
        body["image"] = f"data:image/png;base64,{input_image_b64}"

    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read()


# ── GTK dialog helpers ────────────────────────────────────────────────────────


def _message_dialog(
    parent: "Gtk.Window | None",
    message_type: Gtk.MessageType,
    text: str,
    secondary: str = "",
) -> None:
    dlg = Gtk.MessageDialog(
        transient_for=parent,
        modal=True,
        message_type=message_type,
        buttons=Gtk.ButtonsType.OK,
        text=text,
    )
    if secondary:
        dlg.format_secondary_text(secondary)
    dlg.run()
    dlg.destroy()


def _error(parent: "Gtk.Window | None", msg: str) -> None:
    _message_dialog(parent, Gtk.MessageType.ERROR, "Pollinations AI", msg)


def _info(parent: "Gtk.Window | None", msg: str) -> None:
    _message_dialog(parent, Gtk.MessageType.INFO, "Pollinations AI", msg)


# ── Auth dialog ───────────────────────────────────────────────────────────────


def run_auth_dialog() -> bool:
    """
    Run the BYOP device-flow dialog.
    Opens a browser to the approval page and polls for the token.
    Returns True when the token is saved, False on cancel.
    """
    try:
        code_resp = request_device_code()
    except Exception as exc:
        _error(None, f"Could not reach Pollinations: {exc}")
        return False

    device_code = code_resp["device_code"]
    user_code = code_resp.get("user_code", "")
    verify_uri = code_resp.get("verification_uri", f"{ENTER_BASE}/device")
    full_uri = code_resp.get("verification_uri_complete") or f"{verify_uri}?user_code={urllib.parse.quote(user_code)}"

    dlg = GimpUi.Dialog(title="Connect Pollinations Account", role="pollinations-auth")
    dlg.add_button("Cancel", Gtk.ResponseType.CANCEL)
    dlg.set_border_width(12)
    dlg.set_default_size(400, -1)

    box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=10)
    box.set_border_width(6)

    instructions = Gtk.Label(xalign=0.0, use_markup=True)
    instructions.set_markup(
        "1. Click <b>Open Browser</b> to approve access for this plug-in.\n"
        "2. If no browser opens, visit the URL below and enter the code."
    )
    box.pack_start(instructions, False, False, 0)

    url_row = Gtk.Box(spacing=6)
    url_entry = Gtk.Entry(text=verify_uri, editable=False, can_focus=False)
    url_entry.set_hexpand(True)
    open_btn = Gtk.Button(label="Open Browser")
    open_btn.connect("clicked", lambda _btn: webbrowser.open(full_uri))
    url_row.pack_start(url_entry, True, True, 0)
    url_row.pack_start(open_btn, False, False, 0)
    box.pack_start(url_row, False, False, 0)

    code_lbl = Gtk.Label(xalign=0.0, use_markup=True)
    code_lbl.set_markup(f"Approval code: <b><tt>{user_code}</tt></b>")
    box.pack_start(code_lbl, False, False, 0)

    status_lbl = Gtk.Label(label="Waiting for your approval in the browser…", xalign=0.0)
    box.pack_start(status_lbl, False, False, 0)

    spinner = Gtk.Spinner()
    spinner.start()
    box.pack_start(spinner, False, False, 0)

    dlg.vbox.pack_start(box, True, True, 0)
    dlg.show_all()

    state: dict = {"token": None, "done": False}

    def _poll():
        while not state["done"]:
            time.sleep(POLL_INTERVAL_S)
            if state["done"]:
                break
            try:
                tok = poll_device_token(device_code)
                if tok:
                    state["token"] = tok
                    state["done"] = True
                    GLib.idle_add(_on_approved)
            except Exception:
                # Hard error from the device endpoint — stop polling
                state["done"] = True
                GLib.idle_add(lambda: dlg.response(Gtk.ResponseType.CANCEL) or False)

    def _on_approved():
        spinner.stop()
        status_lbl.set_text("Approved!")
        dlg.response(Gtk.ResponseType.OK)
        return False  # GLib.idle_add: do not reschedule

    thread = threading.Thread(target=_poll, daemon=True)
    thread.start()

    response = dlg.run()
    state["done"] = True  # signal poll thread to stop
    dlg.destroy()

    if state["token"]:
        save_token(state["token"])
        return True
    return False


# ── Generate / Edit dialog ────────────────────────────────────────────────────


def run_generate_dialog(
    models: list[dict],
    *,
    image_input_mode: bool,
    current_image_size: tuple[int, int] | None,
) -> dict | None:
    """
    Show the model + prompt dialog.

    image_input_mode=True  → filter to image-input models; skip size controls.
    Returns a dict with keys: model, prompt, width, height, add_as_layer
    or None when cancelled.
    """
    if image_input_mode:
        models = models_with_image_input(models)

    if not models:
        _error(
            None,
            "No suitable models are available on your account.\n"
            "Image-editing models (such as FLUX Kontext) require a Paid Pollen balance.",
        )
        return None

    title = "Edit with AI" if image_input_mode else "Generate Image"
    dlg = GimpUi.Dialog(title=title, role="pollinations-generate")
    dlg.add_button("Cancel", Gtk.ResponseType.CANCEL)
    gen_btn = dlg.add_button("Generate", Gtk.ResponseType.OK)
    gen_btn.get_style_context().add_class("suggested-action")
    dlg.set_border_width(12)
    dlg.set_default_size(460, -1)

    grid = Gtk.Grid(column_spacing=12, row_spacing=8, border_width=6)
    row = 0

    # Model picker
    grid.attach(Gtk.Label(label="Model:", xalign=1.0), 0, row, 1, 1)
    model_store = Gtk.ListStore(str, str)  # (id, display label)
    for m in models:
        mid = m.get("id") or m.get("name", "")
        label = m.get("title") or mid
        desc = m.get("description", "")
        display = f"{label} — {desc[:60]}" if desc else label
        model_store.append([mid, display])

    model_combo = Gtk.ComboBox(model=model_store)
    cell = Gtk.CellRendererText()
    model_combo.pack_start(cell, True)
    model_combo.add_attribute(cell, "text", 1)
    model_combo.set_active(0)
    model_combo.set_hexpand(True)
    grid.attach(model_combo, 1, row, 1, 1)
    row += 1

    # Prompt
    grid.attach(Gtk.Label(label="Prompt:", xalign=1.0), 0, row, 1, 1)
    prompt_entry = Gtk.Entry(placeholder_text="Describe the image you want…")
    prompt_entry.set_hexpand(True)
    prompt_entry.connect("activate", lambda _e: dlg.response(Gtk.ResponseType.OK))
    grid.attach(prompt_entry, 1, row, 1, 1)
    row += 1

    width_spin = height_spin = as_layer_check = None

    if not image_input_mode:
        # Width
        grid.attach(Gtk.Label(label="Width:", xalign=1.0), 0, row, 1, 1)
        default_w = current_image_size[0] if current_image_size else 1024
        width_spin = Gtk.SpinButton.new_with_range(64, 2048, 64)
        width_spin.set_value(default_w)
        grid.attach(width_spin, 1, row, 1, 1)
        row += 1

        # Height
        grid.attach(Gtk.Label(label="Height:", xalign=1.0), 0, row, 1, 1)
        default_h = current_image_size[1] if current_image_size else 1024
        height_spin = Gtk.SpinButton.new_with_range(64, 2048, 64)
        height_spin.set_value(default_h)
        grid.attach(height_spin, 1, row, 1, 1)
        row += 1

        # Insert destination
        grid.attach(Gtk.Label(label="Insert as:", xalign=1.0), 0, row, 1, 1)
        as_layer_check = Gtk.CheckButton(label="New layer on current image")
        as_layer_check.set_active(current_image_size is not None)
        grid.attach(as_layer_check, 1, row, 1, 1)

    dlg.vbox.pack_start(grid, True, True, 0)
    dlg.show_all()
    response = dlg.run()
    dlg.hide()

    if response != Gtk.ResponseType.OK:
        dlg.destroy()
        return None

    it = model_combo.get_active_iter()
    selected_id = model_store[it][0] if it else (models[0].get("id") or "")

    result = {
        "model": selected_id,
        "prompt": prompt_entry.get_text().strip(),
        "width": int(width_spin.get_value()) if width_spin else None,
        "height": int(height_spin.get_value()) if height_spin else None,
        "add_as_layer": bool(as_layer_check and as_layer_check.get_active()),
    }
    dlg.destroy()
    return result


# ── Procedure implementations ─────────────────────────────────────────────────


def _proc_connect(procedure, run_mode, image, drawables, config, data):
    GimpUi.init("pollinations_gimp")

    existing = load_token()
    if existing:
        try:
            info = get_userinfo(existing)
            username = info.get("preferred_username", "you")
            _info(None, f"Already connected as @{username}.\nUse 'Disconnect' to switch accounts.")
            return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, GLib.Error())
        except Exception:
            pass  # token expired — fall through to re-auth

    if run_auth_dialog():
        try:
            info = get_userinfo(load_token())
            username = info.get("preferred_username", "you")
            _info(None, f"Connected as @{username}. Happy creating!")
        except Exception:
            _info(None, "Connected! Your Pollinations account is now linked to GIMP.")
    else:
        _error(None, "Authorization was not completed. Run 'Connect Account' to try again.")

    return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, GLib.Error())


def _proc_disconnect(procedure, run_mode, image, drawables, config, data):
    GimpUi.init("pollinations_gimp")
    delete_token()
    _info(None, "Disconnected. Your Pollinations token has been removed from this computer.")
    return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, GLib.Error())


def _proc_generate(procedure, run_mode, image, drawables, config, data):
    GimpUi.init("pollinations_gimp")

    token = load_token()
    if not token:
        _error(None, "Not connected.\nGo to Filters ▸ Pollinations AI ▸ Connect Account.")
        return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, GLib.Error())

    models = fetch_models(token)
    if not models:
        _error(None, "Could not load the model list.\nCheck your internet connection and try again.")
        return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, GLib.Error())

    current_size = (image.get_width(), image.get_height()) if image else None
    params = run_generate_dialog(models, image_input_mode=False, current_image_size=current_size)
    if not params:
        return procedure.new_return_values(Gimp.PDBStatusType.CANCEL, GLib.Error())
    if not params["prompt"]:
        _error(None, "Please enter a prompt.")
        return procedure.new_return_values(Gimp.PDBStatusType.CANCEL, GLib.Error())

    target = image if params["add_as_layer"] else None

    try:
        img_bytes = generate_image(
            prompt=params["prompt"],
            model=params["model"],
            token=token,
            width=params["width"],
            height=params["height"],
        )
    except urllib.error.HTTPError as exc:
        body = exc.read().decode(errors="replace")
        _error(None, f"Generation failed (HTTP {exc.code}):\n{body[:300]}")
        return procedure.new_return_values(Gimp.PDBStatusType.EXECUTION_ERROR, GLib.Error())
    except Exception as exc:
        _error(None, f"Generation failed:\n{exc}")
        return procedure.new_return_values(Gimp.PDBStatusType.EXECUTION_ERROR, GLib.Error())

    layer_name = f"Pollinations: {params['prompt'][:50]}"
    _load_result_into_gimp(img_bytes, target, layer_name)
    return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, GLib.Error())


def _proc_edit(procedure, run_mode, image, drawables, config, data):
    GimpUi.init("pollinations_gimp")

    token = load_token()
    if not token:
        _error(None, "Not connected.\nGo to Filters ▸ Pollinations AI ▸ Connect Account.")
        return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, GLib.Error())

    # Resolve the active drawable from whatever GIMP passes
    if not drawables:
        _error(None, "Open an image and select a layer to edit.")
        return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, GLib.Error())

    drawable = drawables[0] if isinstance(drawables, (list, tuple)) else drawables.item(0)

    models = fetch_models(token)
    edit_models = models_with_image_input(models)
    if not edit_models:
        _error(
            None,
            "No image-editing models are available on your account.\n"
            "Models such as FLUX Kontext or FLUX.2 Pro require Paid Pollen.\n"
            "Visit enter.pollinations.ai to add a balance.",
        )
        return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, GLib.Error())

    params = run_generate_dialog(
        edit_models,
        image_input_mode=True,
        current_image_size=None,
    )
    if not params:
        return procedure.new_return_values(Gimp.PDBStatusType.CANCEL, GLib.Error())
    if not params["prompt"]:
        _error(None, "Please enter an edit instruction.")
        return procedure.new_return_values(Gimp.PDBStatusType.CANCEL, GLib.Error())

    try:
        png_bytes = _export_drawable_png_bytes(image, drawable)
    except Exception as exc:
        _error(None, f"Could not read the active layer:\n{exc}")
        return procedure.new_return_values(Gimp.PDBStatusType.EXECUTION_ERROR, GLib.Error())

    image_b64 = base64.b64encode(png_bytes).decode()

    try:
        result_bytes = generate_image(
            prompt=params["prompt"],
            model=params["model"],
            token=token,
            input_image_b64=image_b64,
        )
    except urllib.error.HTTPError as exc:
        body = exc.read().decode(errors="replace")
        _error(None, f"Edit request failed (HTTP {exc.code}):\n{body[:300]}")
        return procedure.new_return_values(Gimp.PDBStatusType.EXECUTION_ERROR, GLib.Error())
    except Exception as exc:
        _error(None, f"Edit request failed:\n{exc}")
        return procedure.new_return_values(Gimp.PDBStatusType.EXECUTION_ERROR, GLib.Error())

    layer_name = f"AI edit: {params['prompt'][:50]}"
    _load_result_into_gimp(result_bytes, image, layer_name)
    return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, GLib.Error())


# ── Plug-in class ─────────────────────────────────────────────────────────────


class PollinationsPlugin(Gimp.PlugIn):
    """
    Registers four PDB procedures under Filters ▸ Pollinations AI:
      • Connect Account   — BYOP device-flow auth
      • Disconnect        — clear stored token
      • Generate Image    — text-to-image; adds result as new image or layer
      • Edit with AI      — image-to-image; active layer → new layer
    """

    def do_set_i18n(self, procname):
        return False, None, None

    def do_query_procedures(self):
        return [
            "python-fu-pollinations-connect",
            "python-fu-pollinations-disconnect",
            "python-fu-pollinations-generate",
            "python-fu-pollinations-edit",
        ]

    def do_create_procedure(self, name):
        MENU_PATH = "<Image>/Filters/Pollinations AI"
        CREDIT = ("Pollinations AI", "Pollinations AI", "2026")

        if name == "python-fu-pollinations-connect":
            proc = Gimp.ImageProcedure.new(
                self, name, Gimp.PDBProcType.PLUGIN, _proc_connect, None
            )
            proc.set_sensitivity_mask(Gimp.ProcedureSensitivityMask.ALWAYS)
            proc.set_menu_label("Connect Account…")
            proc.set_documentation(
                "Connect your Pollinations account",
                "Opens the BYOP device-flow dialog.  Users authorize the plug-in "
                "in their browser; no API key is ever entered manually.",
                name,
            )
            proc.set_attribution(*CREDIT)
            proc.add_menu_path(MENU_PATH)
            return proc

        if name == "python-fu-pollinations-disconnect":
            proc = Gimp.ImageProcedure.new(
                self, name, Gimp.PDBProcType.PLUGIN, _proc_disconnect, None
            )
            proc.set_sensitivity_mask(Gimp.ProcedureSensitivityMask.ALWAYS)
            proc.set_menu_label("Disconnect")
            proc.set_documentation(
                "Disconnect your Pollinations account",
                "Removes the stored authorization token from this computer.",
                name,
            )
            proc.set_attribution(*CREDIT)
            proc.add_menu_path(MENU_PATH)
            return proc

        if name == "python-fu-pollinations-generate":
            proc = Gimp.ImageProcedure.new(
                self, name, Gimp.PDBProcType.PLUGIN, _proc_generate, None
            )
            proc.set_sensitivity_mask(
                Gimp.ProcedureSensitivityMask.NO_IMAGE
                | Gimp.ProcedureSensitivityMask.DRAWABLE
                | Gimp.ProcedureSensitivityMask.DRAWABLES
            )
            proc.set_menu_label("Generate Image…")
            proc.set_documentation(
                "Generate an image with Pollinations AI",
                "Shows a model picker and prompt field.  Generates an image via "
                "the Pollinations API and loads it into GIMP as a new image or layer.",
                name,
            )
            proc.set_attribution(*CREDIT)
            proc.add_menu_path(MENU_PATH)
            return proc

        if name == "python-fu-pollinations-edit":
            proc = Gimp.ImageProcedure.new(
                self, name, Gimp.PDBProcType.PLUGIN, _proc_edit, None
            )
            proc.set_sensitivity_mask(
                Gimp.ProcedureSensitivityMask.DRAWABLE
                | Gimp.ProcedureSensitivityMask.DRAWABLES
            )
            proc.set_menu_label("Edit with AI…")
            proc.set_documentation(
                "Edit the active layer using an image-to-image model",
                "Exports the active layer, sends it to a Pollinations image-editing "
                "model (e.g. FLUX Kontext), and adds the result as a new layer — "
                "the original layer is never modified.",
                name,
            )
            proc.set_attribution(*CREDIT)
            proc.add_menu_path(MENU_PATH)
            return proc

        return None


if __name__ == "__main__":
    Gimp.main(PollinationsPlugin.__gtype__, sys.argv)
