#!/usr/bin/env python3
"""Pollinations AI plug-in for GIMP 3 — generate and edit images with your own
Pollinations account (BYOP).

Install (copy this file into the plug-ins folder, then restart GIMP):

  Linux   ~/.config/GIMP/3.0/plug-ins/pollinations-gimp/pollinations_gimp.py
  macOS   ~/Library/Application Support/GIMP/3.0/plug-ins/pollinations-gimp/pollinations_gimp.py
  Windows %APPDATA%\\GIMP\\3.0\\plug-ins\\pollinations-gimp\\pollinations_gimp.py

The file must be executable (chmod +x on Linux/macOS). GIMP 3 ships its own
Python; no extra packages are required.

Usage: Filters ▸ Pollinations ▸ Connect Account, then Generate Image… or
Edit with AI…. Authorization uses the BYOP device flow (RFC 8628): GIMP shows
a code, you approve it in your browser — you never paste an API key here.

Attribution: create your own publishable App Key at enter.pollinations.ai/keys
and either set it below or export POLLINATIONS_APP_KEY before launching GIMP.
"""

import base64
import json
import os
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import uuid
import webbrowser
from pathlib import Path

import gi

gi.require_version("Gimp", "3.0")
gi.require_version("GimpUi", "3.0")
gi.require_version("Gtk", "3.0")
from gi.repository import Gio, GLib, Gimp, GimpUi, Gtk  # noqa: E402

ENTER_BASE = "https://enter.pollinations.ai"
GEN_BASE = "https://gen.pollinations.ai"
APP_KEY = os.environ.get("POLLINATIONS_APP_KEY", "pk_gimp_pollinations")
USER_AGENT = "Mozilla/5.0 (compatible; PollinationsGimp/1.0; +https://github.com/pollinations/pollinations)"
MENU_PATH = "<Image>/Filters/Pollinations"
TOKEN_FILE = Path(GLib.get_user_config_dir()) / "GIMP" / "3.0" / "pollinations" / "auth.json"


# ── Stored authorization (survives GIMP restarts) ────────────────────────────


def load_auth() -> dict | None:
    """Return the stored {"token": ..., "user": ...} record, or None."""
    try:
        record = json.loads(TOKEN_FILE.read_text())
        return record if record.get("token") else None
    except (OSError, ValueError):
        return None


def save_auth(token: str, user: str | None) -> None:
    TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
    TOKEN_FILE.write_text(json.dumps({"token": token, "user": user or ""}))
    os.chmod(TOKEN_FILE, 0o600)


def clear_auth() -> None:
    TOKEN_FILE.unlink(missing_ok=True)


# ── HTTP + error classification ──────────────────────────────────────────────


def http_request(url: str, *, method: str = "GET", token: str | None = None,
                 body: bytes | None = None, content_type: str | None = None,
                 timeout: int = 120) -> bytes:
    headers = {"User-Agent": USER_AGENT}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if content_type:
        headers["Content-Type"] = content_type
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def json_request(url: str, **kwargs) -> dict:
    kwargs.setdefault("content_type", "application/json")
    return json.loads(http_request(url, **kwargs))


def error_message(exc: Exception) -> str:
    """Map any transport/API failure to a message that says what to do next."""
    code = status = None
    if isinstance(exc, urllib.error.HTTPError):
        status = exc.code
        try:
            err = json.loads(exc.read().decode(errors="replace")).get("error", {})
            code = err.get("code")
            detail = err.get("message") or ""
        except ValueError:
            detail = ""
    elif isinstance(exc, urllib.error.URLError):
        return (f"Network error: {exc.reason}\n"
                "Check your internet connection and try again.")
    else:
        return f"Unexpected error: {exc}"

    if status in (401, 403) or code == "UNAUTHORIZED":
        return ("Your Pollinations authorization is missing or expired.\n"
                "Run Filters ▸ Pollinations ▸ Connect Account again, then retry.")
    if status == 402 or code == "PAYMENT_REQUIRED":
        return (f"Not enough Pollen to make this request.\n{detail}\n"
                "Top up your balance at enter.pollinations.ai and retry.")
    if detail:
        return f"Pollinations API error ({code or status}): {detail}"
    return f"Request failed with HTTP {status}."


# ── BYOP device flow (RFC 8628) ──────────────────────────────────────────────


def request_device_code() -> dict:
    return json_request(f"{ENTER_BASE}/api/device/code", method="POST",
                        body=json.dumps({"client_id": APP_KEY}).encode())


def poll_device_token(device_code: str) -> str | None:
    """One poll: returns the access_token when approved, None while pending."""
    try:
        resp = json_request(f"{ENTER_BASE}/api/device/token", method="POST",
                            body=json.dumps({"device_code": device_code}).encode())
    except urllib.error.HTTPError as exc:
        try:
            err = json.loads(exc.read().decode(errors="replace"))
        except ValueError:
            raise
        if err.get("error") in ("authorization_pending", "slow_down"):
            return None
        raise RuntimeError(err.get("error_description") or err.get("error") or
                           f"Device authorization failed (HTTP {exc.code}).")
    return resp.get("access_token")


def fetch_username(token: str) -> str | None:
    try:
        return json_request(f"{ENTER_BASE}/api/device/userinfo", token=token).get(
            "preferred_username")
    except Exception:
        return None


# ── Live model catalog (capabilities come from the API, never hardcoded) ─────


def build_generate_url(prompt: str, model: str, width: int | None,
                       height: int | None) -> str:
    query = {"model": model, "width": width, "height": height}
    return (f"{GEN_BASE}/image/{urllib.parse.quote(prompt)}"
            f"?{urllib.parse.urlencode({k: v for k, v in query.items() if v})}")


def fetch_models(token: str) -> list[dict]:
    models = json_request(f"{GEN_BASE}/image/models", token=token)
    return [m for m in models if "image" in (m.get("output_modalities") or [])]


def supports_image_input(model: dict) -> bool:
    return "image" in (model.get("input_modalities") or [])


def model_label(model: dict) -> str:
    label = model.get("title") or model.get("name", "?")
    price = (model.get("pricing") or {}).get("completionImageTokens")
    if price:
        label += f"  (~{price} pollen/image)"
    return label


# ── GIMP image I/O ───────────────────────────────────────────────────────────


def export_source_png(image: Gimp.Image) -> bytes:
    """PNG bytes of the selection (if any) or the active layer — the source
    image is never modified (all work happens on a throwaway duplicate)."""
    handle, path = tempfile.mkstemp(suffix=".png")
    os.close(handle)
    try:
        dup = image.duplicate()
        try:
            _ok, non_empty, x1, y1, x2, y2 = dup.get_selection().bounds(dup)
            if non_empty:
                dup.crop(x2 - x1, y2 - y1, x1, y1)
            else:
                selected = dup.get_selected_layers()
                active = selected[0] if selected else None
                keep = {active, active.get_parent()} if active else set()
                for layer in dup.get_layers():
                    if layer not in keep:
                        layer.set_visible(False)
            dup.flatten()
            Gimp.file_save(Gimp.RunMode.NONINTERACTIVE, dup,
                           Gio.File.new_for_path(path), Gimp.ExportOptions())
        finally:
            dup.delete()
        return Path(path).read_bytes()
    finally:
        os.unlink(path)


def add_result(data: bytes, image: Gimp.Image | None, layer_name: str) -> None:
    """Load result bytes; add as a new layer on `image`, or open as a new
    image when there is none. The source content is never altered."""
    handle, path = tempfile.mkstemp(suffix=".png")
    os.write(handle, data)
    os.close(handle)
    try:
        loaded = Gimp.file_load(Gimp.RunMode.NONINTERACTIVE,
                                Gio.File.new_for_path(path))
        layer = loaded.get_selected_layers()[0]
        if image is not None:
            new_layer = Gimp.Layer.new_from_drawable(layer, image)
            image.insert_layer(new_layer, None, 0)
            new_layer.set_name(layer_name)
            loaded.delete()
        else:
            layer.set_name(layer_name)
            loaded.set_file(Gio.File.new_for_path("Pollinations"))
            try:
                Gimp.Display.new(loaded)
            except Exception:
                pass  # headless run: image exists, no window to show
        Gimp.displays_flush()
    finally:
        os.unlink(path)


# ── GTK dialogs ──────────────────────────────────────────────────────────────


def _dialog(title: str) -> Gtk.Dialog:
    dlg = GimpUi.Dialog(title=title, role="pollinations")
    dlg.set_border_width(12)
    return dlg


def _grid(dlg: Gtk.Dialog) -> tuple[Gtk.Grid, list[int]]:
    grid = Gtk.Grid(column_spacing=10, row_spacing=8)
    dlg.vbox.pack_start(grid, True, True, 0)
    return grid, [0]


def _row(grid: Gtk.Grid, row: list, label: str, widget: Gtk.Widget) -> None:
    grid.attach(Gtk.Label(label=label, xalign=1.0), 0, row[0], 1, 1)
    widget.set_hexpand(True)
    grid.attach(widget, 1, row[0], 1, 1)
    row[0] += 1


def _combo(models: list[dict]) -> Gtk.ComboBoxText:
    combo = Gtk.ComboBoxText()
    for m in models:
        combo.append(m.get("name", ""), model_label(m))
    combo.set_active(0)
    return combo


def _error(msg: str) -> None:
    _info(msg, title="Pollinations", error=True)


def _info(msg: str, title: str = "Pollinations", error: bool = False) -> None:
    GimpUi.init("pollinations_gimp")
    kind = Gtk.MessageType.ERROR if error else Gtk.MessageType.INFO
    dlg = Gtk.MessageDialog(text=title, message_type=kind, buttons=Gtk.ButtonsType.OK)
    dlg.format_secondary_text(msg)
    dlg.run()
    dlg.destroy()


def connect_flow() -> bool:
    """Simplified modal loop: show code, let the user click approve-check."""
    GimpUi.init("pollinations_gimp")
    try:
        resp = request_device_code()
    except Exception as exc:
        _error(error_message(exc))
        return False
    user_code = resp["user_code"]
    device_code = resp["device_code"]
    verify = resp.get("verification_uri") or "/device"
    verify_url = verify if verify.startswith("http") else ENTER_BASE + verify

    dlg = _dialog("Connect your Pollinations account")
    dlg.set_default_size(420, -1)
    grid, row = _grid(dlg)
    grid.attach(Gtk.Label(label=f"1. Open {verify_url}", xalign=0.0), 0, row[0], 2, 1)
    row[0] += 1
    grid.attach(Gtk.Label(label="2. Enter this code:", xalign=0.0), 0, row[0], 2, 1)
    row[0] += 1
    code_lbl = Gtk.Label()
    code_lbl.set_markup(f"<b><big>{GLib.markup_escape_text(user_code)}</big></b>")
    code_lbl.set_selectable(True)
    grid.attach(code_lbl, 0, row[0], 2, 1)
    row[0] += 1
    status = Gtk.Label(label="3. After approving in the browser, click below.",
                       xalign=0.0)
    grid.attach(status, 0, row[0], 2, 1)
    row[0] += 1
    dlg.add_button("_Open browser", Gtk.ResponseType.APPLY)
    dlg.add_button("Cancel", Gtk.ResponseType.CANCEL)
    dlg.add_button("_Continue", Gtk.ResponseType.OK)
    dlg.show_all()

    ok = False
    while not ok:
        response = dlg.run()
        if response == Gtk.ResponseType.CANCEL:
            break
        if response == Gtk.ResponseType.APPLY:
            webbrowser.open(verify_url)
            continue
        try:
            token = poll_device_token(device_code)
            if token:
                save_auth(token, fetch_username(token))
                ok = True
            else:
                status.set_text("Not approved yet — approve in the browser, "
                                "then click Continue again.")
        except Exception as exc:
            _error(error_message(exc))
            break
    dlg.destroy()
    return ok


def settings_dialog(models: list[dict], *, editing: bool,
                    has_image: bool) -> dict | None:
    """Model + prompt (+ size when generating). Only capabilities the live
    catalog reports for the selected model are offered."""
    GimpUi.init("pollinations_gimp")
    pool = [m for m in models if supports_image_input(m)] if editing else models
    if not pool:
        _error("No model on your account supports "
               + ("image editing." if editing else "image generation."))
        return None

    dlg = _dialog("Edit with AI" if editing else "Generate Image")
    dlg.set_default_size(480, -1)
    grid, row = _grid(dlg)

    _row(grid, row, "Model:", (combo := _combo(pool)))
    _row(grid, row, "Prompt:", (prompt := Gtk.Entry()))
    prompt.set_placeholder_text("Describe the " + ("edit" if editing else "image") + "…")

    size = None
    as_layer = None
    if not editing:
        _row(grid, row, "Width:", (w := Gtk.SpinButton.new_with_range(256, 2048, 128)))
        w.set_value(1024)
        _row(grid, row, "Height:", (h := Gtk.SpinButton.new_with_range(256, 2048, 128)))
        h.set_value(1024)
        size = (w, h)
        if has_image:
            _row(grid, row, "Insert as:",
                 (as_layer := Gtk.CheckButton(label="New layer on current image")))
            as_layer.set_active(True)

    dlg.add_button("Cancel", Gtk.ResponseType.CANCEL)
    go = dlg.add_button("_Generate" if not editing else "_Edit", Gtk.ResponseType.OK)
    go.get_style_context().add_class("suggested-action")
    prompt.connect("activate", lambda _e: dlg.response(Gtk.ResponseType.OK))
    dlg.show_all()

    result = None
    if dlg.run() == Gtk.ResponseType.OK:
        text = prompt.get_text().strip()
        if not text:
            _error("Please enter a prompt.")
        else:
            result = {
                "model": combo.get_active_id(),
                "prompt": text,
                "width": int(size[0].get_value()) if size else None,
                "height": int(size[1].get_value()) if size else None,
                "as_layer": bool(as_layer and as_layer.get_active()),
            }
    dlg.destroy()
    return result


# ── PDB procedures ───────────────────────────────────────────────────────────


def _success(procedure):
    return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, GLib.Error())


def _cancelled(procedure):
    return procedure.new_return_values(Gimp.PDBStatusType.CANCEL, GLib.Error())


def _require_token(procedure):
    auth = load_auth()
    if not auth:
        _error("Not connected yet.\nRun Filters ▸ Pollinations ▸ Connect Account "
               "to authorize your Pollinations account.")
        return None
    return auth["token"]


def proc_connect(procedure, run_mode, image, drawables, config, data):
    if connect_flow():
        user = (load_auth() or {}).get("user")
        _info(f"Connected{' as ' + user if user else ''}.\nRequests now spend "
              "your own Pollen.")
    return _success(procedure)


def proc_disconnect(procedure, run_mode, image, drawables, config, data):
    clear_auth()
    _info("Disconnected. Stored authorization removed.")
    return _success(procedure)


def proc_generate(procedure, run_mode, image, drawables, config, data):
    token = _require_token(procedure)
    if not token:
        return _success(procedure)
    try:
        models = fetch_models(token)
    except Exception as exc:
        _error(error_message(exc))
        return _success(procedure)
    params = settings_dialog(models, editing=False, has_image=image is not None)
    if not params:
        return _cancelled(procedure)
    url = build_generate_url(params["prompt"], params["model"],
                             params["width"], params["height"])
    try:
        data_bytes = http_request(url, token=token)
    except Exception as exc:
        _error(error_message(exc))
        return _success(procedure)
    add_result(data_bytes, image if params["as_layer"] else None,
               f"Pollinations: {params['prompt'][:40]}")
    return _success(procedure)


def proc_edit(procedure, run_mode, image, drawables, config, data):
    token = _require_token(procedure)
    if not token:
        return _success(procedure)
    if image is None:
        _error("Open an image first. Edit sends the active layer (or current "
               "selection) to the model.")
        return _success(procedure)
    try:
        png = export_source_png(image)
        models = fetch_models(token)
    except Exception as exc:
        _error(error_message(exc))
        return _success(procedure)
    params = settings_dialog(models, editing=True, has_image=True)
    if not params:
        return _cancelled(procedure)

    boundary = uuid.uuid4().hex
    body = (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"model\"\r\n\r\n"
        f"{params['model']}\r\n"
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"prompt\"\r\n\r\n"
        f"{params['prompt']}\r\n"
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\";"
        f" filename=\"source.png\"\r\nContent-Type: image/png\r\n\r\n"
    ).encode() + png + f"\r\n--{boundary}--\r\n".encode()
    try:
        result = http_request(f"{GEN_BASE}/v1/images/edits", method="POST",
                              token=token, body=body,
                              content_type=f"multipart/form-data; boundary={boundary}")
    except Exception as exc:
        _error(error_message(exc))
        return _success(procedure)
    add_result(result, image, f"Pollinations edit: {params['prompt'][:40]}")
    return _success(procedure)


class PollinationsPlugin(Gimp.PlugIn):
    """Registers four procedures under Filters ▸ Pollinations."""

    def do_set_i18n(self, procname):
        return True, "gimp-3.0", ""

    def do_query_procedures(self):
        return ["python-fu-pollinations-connect",
                "python-fu-pollinations-disconnect",
                "python-fu-pollinations-generate",
                "python-fu-pollinations-edit"]

    def _make(self, name, func, label, docs, *, needs_image=False):
        proc = Gimp.ImageProcedure.new(self, name, Gimp.PDBProcType.PLUGIN,
                                       func, None)
        proc.set_menu_label(label)
        proc.set_documentation(docs, docs, name)
        proc.set_attribution("Pollinations", "Pollinations", "2026")
        proc.add_menu_path(MENU_PATH)
        if needs_image:
            proc.set_sensitivity_mask(
                Gimp.ProcedureSensitivityMask.DRAWABLE
                | Gimp.ProcedureSensitivityMask.DRAWABLES)
        else:
            proc.set_sensitivity_mask(Gimp.ProcedureSensitivityMask.NO_IMAGE)
        return proc

    def do_create_procedure(self, name):
        if name == "python-fu-pollinations-connect":
            return self._make(name, proc_connect, "Connect Account…",
                              "Connect your Pollinations account with the BYOP "
                              "device flow (no API key pasting).")
        if name == "python-fu-pollinations-disconnect":
            return self._make(name, proc_disconnect, "Disconnect",
                              "Remove the stored Pollinations authorization.")
        if name == "python-fu-pollinations-generate":
            return self._make(name, proc_generate, "Generate Image…",
                              "Generate an image from a prompt and add it as a "
                              "new image or layer.", needs_image=True)
        if name == "python-fu-pollinations-edit":
            return self._make(name, proc_edit, "Edit with AI…",
                              "Send the active layer or selection to an "
                              "image-editing model; the result is added as a new "
                              "layer without touching the source.",
                              needs_image=True)
        return None


if __name__ == "__main__":
    Gimp.main(PollinationsPlugin.__gtype__, sys.argv)
