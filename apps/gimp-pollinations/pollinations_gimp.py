#!/usr/bin/env python3
"""Pollinations AI — GIMP 3 plug-in (BYOP device authorization).

Menu: Filters ▸ Pollinations AI
  • Connect Account…   — authorize via browser (device flow, RFC 8628 style);
                         users NEVER paste an API key into GIMP.
  • Disconnect         — remove the stored authorization.
  • Generate Image…    — prompt → image → new image or new layer.
  • Edit with AI…      — active layer/selection → image-editing model → NEW layer
                         (the source layer is never modified).

All API / auth / model-catalog logic lives in ``pollinations_api.py`` (pure
standard library, importable without GIMP). This file only contains the GIMP
GObject-introspection glue and GTK dialogs.

Install (file must sit in a folder of the same name and be executable):
  Linux   : ~/.config/GIMP/3.0/plug-ins/pollinations-gimp/
  macOS   : ~/Library/Application Support/GIMP/3.0/plug-ins/pollinations-gimp/
  Windows : %APPDATA%\\GIMP\\3.0\\plug-ins\\pollinations-gimp\\
Copy BOTH pollinations_gimp.py and pollinations_api.py, then restart GIMP.
"""

from __future__ import annotations

import os
import re
import sys
import tempfile
import threading
import time
import webbrowser
from pathlib import Path

import gi

gi.require_version("Gimp", "3.0")
gi.require_version("GimpUi", "3.0")
gi.require_version("Gtk", "3.0")
gi.require_version("GLib", "2.0")

from gi.repository import Gio, Gimp, GimpUi, GLib, Gtk  # noqa: E402

# The API client ships next to this file inside the plug-in folder.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import pollinations_api as api  # noqa: E402

PLUGIN_VERSION = "1.0.0"
MENU_PATH = "<Image>/Filters/Pollinations AI"
_RESOLUTION_RE = re.compile(r"^\d+x\d+$")


# ---------------------------------------------------------------------------
# Dialog helpers
# ---------------------------------------------------------------------------


def _message(parent, text, error=False):
    dlg = Gtk.MessageDialog(
        transient_for=parent,
        modal=True,
        message_type=Gtk.MessageType.ERROR if error else Gtk.MessageType.INFO,
        buttons=Gtk.ButtonsType.OK,
        text="Pollinations AI",
    )
    dlg.format_secondary_text(text)
    dlg.run()
    dlg.destroy()


def _show_error(parent, exc):
    """Show a clear, recovery-oriented error dialog for any failure."""
    if isinstance(exc, api.PollinationsError):
        text = f"{exc}\n\n{exc.recovery}"
    else:
        text = f"Unexpected error: {exc}"
    _message(parent, text, error=True)


# ---------------------------------------------------------------------------
# Connect (device flow) dialog — live polling with cancel
# ---------------------------------------------------------------------------


def run_connect_dialog(parent=None) -> bool:
    """Run the BYOP device-authorization dialog. Returns True when connected."""
    try:
        session = api.start_device_flow()
    except api.PollinationsError as exc:
        _show_error(parent, exc)
        return False

    dlg = GimpUi.Dialog(title="Connect Pollinations Account", role="pollinations-connect")
    dlg.add_button("Cancel", Gtk.ResponseType.CANCEL)
    dlg.set_default_size(440, -1)
    dlg.set_border_width(12)

    box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=10)
    box.set_border_width(6)

    info = Gtk.Label(xalign=0.0, use_markup=True)
    info.set_markup(
        "1. Click <b>Open Browser</b> and approve access for this plug-in.\n"
        "2. Or visit the URL below and enter the approval code.\n\n"
        "No API key is ever typed into GIMP — approval happens on the "
        "Pollinations website only."
    )
    box.pack_start(info, False, False, 0)

    row = Gtk.Box(spacing=6)
    url_entry = Gtk.Entry(text=session.verification_uri, editable=False)
    url_entry.set_hexpand(True)
    open_btn = Gtk.Button(label="Open Browser")
    open_btn.connect("clicked", lambda _b: webbrowser.open(session.verification_uri_complete))
    row.pack_start(url_entry, True, True, 0)
    row.pack_start(open_btn, False, False, 0)
    box.pack_start(row, False, False, 0)

    code_lbl = Gtk.Label(xalign=0.0, use_markup=True)
    code_lbl.set_markup(f"Approval code: <b><tt>{session.user_code}</tt></b>")
    box.pack_start(code_lbl, False, False, 0)

    status_lbl = Gtk.Label(label="Waiting for approval in your browser…", xalign=0.0)
    box.pack_start(status_lbl, False, False, 0)
    spinner = Gtk.Spinner()
    spinner.start()
    box.pack_start(spinner, False, False, 0)

    dlg.vbox.pack_start(box, True, True, 0)
    dlg.show_all()

    state = {"token": None, "error": None, "done": False, "deadline": time.monotonic() + session.expires_in}

    def _poll():
        while not state["done"]:
            time.sleep(max(1, session.interval))
            if state["done"]:
                return
            if time.monotonic() > state["deadline"]:
                state["error"] = api.DeviceFlowError(
                    "The approval code expired before authorization completed."
                )
                state["done"] = True
                GLib.idle_add(lambda: dlg.response(Gtk.ResponseType.CANCEL) or False)
                return
            try:
                token = api.poll_device_token(session)
            except api.DeviceFlowError as exc:
                state["error"] = exc
                state["done"] = True
                GLib.idle_add(lambda: dlg.response(Gtk.ResponseType.CANCEL) or False)
                return
            if token:
                state["token"] = token
                state["done"] = True
                GLib.idle_add(_approved)
                return

    def _approved():
        spinner.stop()
        status_lbl.set_text("Approved — connecting…")
        dlg.response(Gtk.ResponseType.OK)
        return False

    threading.Thread(target=_poll, daemon=True).start()
    response = dlg.run()
    state["done"] = True
    dlg.destroy()

    if state["token"]:
        api.save_token(state["token"])
        return True
    if state["error"] and response != Gtk.ResponseType.CANCEL:
        _show_error(parent, state["error"])
    return False


# ---------------------------------------------------------------------------
# Generate / Edit dialog — capability-driven controls
# ---------------------------------------------------------------------------


def run_prompt_dialog(models, *, edit_mode: bool, current_size, parent=None):
    """Model picker + prompt; controls shown only when the model supports them.

    edit_mode=True → only image-input models are listed and size controls are
    hidden (the edit endpoint sizes from the input image).
    Returns a dict of choices, or None when cancelled.
    """
    if edit_mode:
        models = api.editing_models(models)
    if not models:
        what = "image-editing" if edit_mode else "image"
        _message(
            parent,
            f"No {what} models are available on your account right now.\n\n"
            "The model list is loaded live from gen.pollinations.ai/image/models. "
            "Paid models require Pollen balance at https://enter.pollinations.ai",
            error=True,
        )
        return None

    title = "Edit with AI" if edit_mode else "Generate Image"
    dlg = GimpUi.Dialog(title=title, role="pollinations-generate")
    dlg.add_button("Cancel", Gtk.ResponseType.CANCEL)
    ok_btn = dlg.add_button("Generate", Gtk.ResponseType.OK)
    ok_btn.get_style_context().add_class("suggested-action")
    dlg.set_default_size(480, -1)
    dlg.set_border_width(12)

    grid = Gtk.Grid(column_spacing=12, row_spacing=8, border_width=6)
    row = 0

    grid.attach(Gtk.Label(label="Model:", xalign=1.0), 0, row, 1, 1)
    store = Gtk.ListStore(str, str, object)  # id, label, ImageModel
    for m in models:
        store.append([m.id, m.display_name, m])
    combo = Gtk.ComboBox(model=store)
    cell = Gtk.CellRendererText()
    combo.pack_start(cell, True)
    combo.add_attribute(cell, "text", 1)
    combo.set_active(0)
    combo.set_hexpand(True)
    grid.attach(combo, 1, row, 1, 1)
    row += 1

    grid.attach(Gtk.Label(label="Prompt:", xalign=1.0), 0, row, 1, 1)
    prompt = Gtk.Entry(
        placeholder_text="Edit instruction…" if edit_mode else "Describe the image…"
    )
    prompt.set_hexpand(True)
    prompt.connect("activate", lambda _e: dlg.response(Gtk.ResponseType.OK))
    grid.attach(prompt, 1, row, 1, 1)
    row += 1

    # Resolution control — only for models advertising supported resolutions.
    res_label = Gtk.Label(label="Resolution:", xalign=1.0)
    res_combo = Gtk.ComboBoxText()
    grid.attach(res_label, 0, row, 1, 1)
    grid.attach(res_combo, 1, row, 1, 1)
    row += 1

    width_spin = height_spin = seed_spin = as_layer = None
    w_label = h_label = seed_label = layer_label = None

    if not edit_mode:
        w_label = Gtk.Label(label="Width:", xalign=1.0)
        width_spin = Gtk.SpinButton.new_with_range(64, 4096, 64)
        width_spin.set_value(current_size[0] if current_size else 1024)
        grid.attach(w_label, 0, row, 1, 1)
        grid.attach(width_spin, 1, row, 1, 1)
        row += 1

        h_label = Gtk.Label(label="Height:", xalign=1.0)
        height_spin = Gtk.SpinButton.new_with_range(64, 4096, 64)
        height_spin.set_value(current_size[1] if current_size else 1024)
        grid.attach(h_label, 0, row, 1, 1)
        grid.attach(height_spin, 1, row, 1, 1)
        row += 1

        seed_label = Gtk.Label(label="Seed:", xalign=1.0)
        seed_spin = Gtk.SpinButton.new_with_range(-1, 2**31 - 1, 1)
        seed_spin.set_value(-1)  # -1 = random
        grid.attach(seed_label, 0, row, 1, 1)
        grid.attach(seed_spin, 1, row, 1, 1)
        row += 1

        layer_label = Gtk.Label(label="Insert as:", xalign=1.0)
        as_layer = Gtk.CheckButton(label="New layer on the current image")
        as_layer.set_active(current_size is not None)
        as_layer.set_sensitive(current_size is not None)
        grid.attach(layer_label, 0, row, 1, 1)
        grid.attach(as_layer, 1, row, 1, 1)

    def _selected_model():
        it = combo.get_active_iter()
        return store[it][2] if it else models[0]

    def _on_model_changed(*_args):
        m = _selected_model()
        # Capability-driven controls: only show what the model supports.
        # Only "WxH" resolutions can be honored by the image endpoint.
        resolutions = [r for r in m.resolutions if _RESOLUTION_RE.match(r)] if not edit_mode else []
        res_label.set_visible(bool(resolutions))
        res_combo.set_visible(bool(resolutions))
        res_combo.remove_all()
        for r in resolutions:
            res_combo.append(r, r)
        if resolutions:
            res_combo.set_active(0)
        # When the model pins resolutions, free-form size fields would be
        # ignored by the API — don't present unsupported options.
        if not edit_mode:
            locked = bool(resolutions)
            for widget in (w_label, width_spin, h_label, height_spin):
                widget.set_sensitive(not locked)

    combo.connect("changed", _on_model_changed)

    dlg.vbox.pack_start(grid, True, True, 0)
    dlg.show_all()
    _on_model_changed()  # apply visibility after show_all
    if dlg.run() != Gtk.ResponseType.OK:
        dlg.destroy()
        return None

    it = combo.get_active_iter()
    model = store[it][2] if it else models[0]
    seed_val = int(seed_spin.get_value()) if seed_spin else None
    width = int(width_spin.get_value()) if width_spin else None
    height = int(height_spin.get_value()) if height_spin else None
    resolution = res_combo.get_active_id() if res_combo.get_visible() else None
    if resolution:  # "WxH" advertised by the model overrides free-form size
        width, height = (int(v) for v in resolution.split("x", 1))
    result = {
        "model": model,
        "prompt": prompt.get_text().strip(),
        "width": width,
        "height": height,
        "seed": seed_val if seed_val is not None and seed_val >= 0 else None,
        "add_as_layer": bool(as_layer and as_layer.get_active()),
    }
    dlg.destroy()
    return result


# ---------------------------------------------------------------------------
# GIMP image I/O
# ---------------------------------------------------------------------------


def _export_active_drawable_png(image, drawable) -> bytes:
    """Export the active drawable (cropped to the selection, if any) as PNG.

    A throwaway image is built from a copy of the drawable, so the user's
    image and source layer are never touched.
    """
    width, height = drawable.get_width(), drawable.get_height()
    tmp_image = Gimp.Image.new(width, height, Gimp.ImageBaseType.RGB)
    try:
        layer_copy = Gimp.Layer.new_from_drawable(drawable, tmp_image)
        tmp_image.insert_layer(layer_copy, None, 0)
        # Crop to the active selection bounds when a selection exists.
        sel = image.get_selection()
        bounds = sel.bounds()
        if len(bounds) == 5:
            non_empty, x1, y1, x2, y2 = bounds
        else:
            non_empty, x1, y1, x2, y2 = (True, *bounds) if len(bounds) == 4 else (False, 0, 0, 0, 0)
        if non_empty and x2 > x1 and y2 > y1:
            off_x, off_y = drawable.get_offsets()
            tmp_image.crop(x2 - x1, y2 - y1, x1 - off_x, y1 - off_y)
        fd, path = tempfile.mkstemp(suffix=".png")
        os.close(fd)
        try:
            Gimp.file_save(
                Gimp.RunMode.NONINTERACTIVE,
                tmp_image,
                tmp_image.get_active_drawable(),
                Gio.File.new_for_path(path),
            )
            return Path(path).read_bytes()
        finally:
            os.unlink(path)
    finally:
        tmp_image.delete()


def _insert_result(image, png_bytes, name, as_new_image):
    """Load result bytes into GIMP: new standalone image, or a NEW layer."""
    fd, path = tempfile.mkstemp(suffix=".png")
    os.close(fd)
    try:
        Path(path).write_bytes(png_bytes)
        loaded = Gimp.file_load(Gimp.RunMode.NONINTERACTIVE, Gio.File.new_for_path(path))
        if as_new_image or image is None:
            Gimp.display_new(loaded)
        else:
            src = loaded.get_active_drawable()
            layer = Gimp.Layer.new_from_drawable(src, image)
            layer.set_name(name)
            image.undo_group_start()
            try:
                image.insert_layer(layer, None, -1)
            finally:
                image.undo_group_end()
            loaded.delete()
        Gimp.displays_flush()
    finally:
        os.unlink(path)


# ---------------------------------------------------------------------------
# Procedure bodies
# ---------------------------------------------------------------------------


def _get_token_or_connect(parent):
    token = api.load_token()
    if token:
        return token
    if run_connect_dialog(parent):
        return api.load_token()
    return None


def _proc_connect(procedure, run_mode, image, drawables, config, data):
    GimpUi.init("pollinations-gimp")
    token = api.load_token()
    if token:
        try:
            info = api.fetch_userinfo(token)
            who = info.get("preferred_username") or info.get("name") or "your account"
            _message(None, f"Already connected as {who}.\nUse 'Disconnect' to switch accounts.")
            return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, GLib.Error())
        except api.AuthExpiredError:
            api.delete_token()  # fall through to re-authorize
        except api.PollinationsError:
            pass
    if run_connect_dialog(None):
        try:
            info = api.fetch_userinfo(api.load_token())
            who = info.get("preferred_username") or "your account"
            _message(None, f"Connected as {who}. Your authorization is stored privately on this computer.")
        except api.PollinationsError:
            _message(None, "Connected! Your Pollinations account is now linked to GIMP.")
    return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, GLib.Error())


def _proc_disconnect(procedure, run_mode, image, drawables, config, data):
    GimpUi.init("pollinations-gimp")
    api.delete_token()
    _message(None, "Disconnected. The stored Pollinations authorization was removed from this computer.")
    return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, GLib.Error())


def _proc_generate(procedure, run_mode, image, drawables, config, data):
    GimpUi.init("pollinations-gimp")
    try:
        token = _get_token_or_connect(None)
        if not token:
            return procedure.new_return_values(Gimp.PDBStatusType.CANCEL, GLib.Error())
        models = api.fetch_models(token)
        if not models:
            raise api.APIError(
                "The model catalog is empty. Check your connection and Pollen balance."
            )
        size = (image.get_width(), image.get_height()) if image else None
        params = run_prompt_dialog(models, edit_mode=False, current_size=size)
        if not params:
            return procedure.new_return_values(Gimp.PDBStatusType.CANCEL, GLib.Error())
        result = api.request_image(
            params["prompt"],
            params["model"],
            token,
            width=params["width"],
            height=params["height"],
            seed=params["seed"],
        )
        name = f"Pollinations: {params['prompt'][:50]}"
        _insert_result(image, result, name, as_new_image=not params["add_as_layer"])
        return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, GLib.Error())
    except api.AuthExpiredError as exc:
        api.delete_token()
        _show_error(None, exc)
        return procedure.new_return_values(Gimp.PDBStatusType.EXECUTION_ERROR, GLib.Error())
    except api.PollinationsError as exc:
        _show_error(None, exc)
        return procedure.new_return_values(Gimp.PDBStatusType.EXECUTION_ERROR, GLib.Error())


def _proc_edit(procedure, run_mode, image, drawables, config, data):
    GimpUi.init("pollinations-gimp")
    try:
        if image is None or not drawables:
            _message(None, "Open an image and select a layer to edit.", error=True)
            return procedure.new_return_values(Gimp.PDBStatusType.CANCEL, GLib.Error())
        drawable = drawables[0] if isinstance(drawables, (list, tuple)) else drawables
        token = _get_token_or_connect(None)
        if not token:
            return procedure.new_return_values(Gimp.PDBStatusType.CANCEL, GLib.Error())
        models = api.editing_models(api.fetch_models(token))
        if not models:
            raise api.APIError(
                "No image-editing models are available on your account. "
                "Editing models (e.g. FLUX Kontext) require Pollen balance at "
                "https://enter.pollinations.ai"
            )
        params = run_prompt_dialog(models, edit_mode=True, current_size=None)
        if not params:
            return procedure.new_return_values(Gimp.PDBStatusType.CANCEL, GLib.Error())
        source_png = _export_active_drawable_png(image, drawable)
        result = api.request_image(
            params["prompt"],
            params["model"],
            token,
            input_image_png=source_png,
        )
        _insert_result(image, result, f"AI edit: {params['prompt'][:50]}", as_new_image=False)
        return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, GLib.Error())
    except api.AuthExpiredError as exc:
        api.delete_token()
        _show_error(None, exc)
        return procedure.new_return_values(Gimp.PDBStatusType.EXECUTION_ERROR, GLib.Error())
    except api.PollinationsError as exc:
        _show_error(None, exc)
        return procedure.new_return_values(Gimp.PDBStatusType.EXECUTION_ERROR, GLib.Error())
    except Exception as exc:  # GIMP-side failures (export/load) still get a message
        _show_error(None, exc)
        return procedure.new_return_values(Gimp.PDBStatusType.EXECUTION_ERROR, GLib.Error())


# ---------------------------------------------------------------------------
# Plug-in registration
# ---------------------------------------------------------------------------


class PollinationsGimp(Gimp.PlugIn):
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
        credit = ("Pollinations AI", "Pollinations AI", "2026")
        specs = {
            "python-fu-pollinations-connect": (
                "Connect Account…",
                "Connect your Pollinations account (BYOP device authorization)",
                "Opens the approval page in your browser; the user authorization "
                "is stored privately and persists across GIMP restarts.",
                _proc_connect,
                Gimp.ProcedureSensitivityMask.ALWAYS,
            ),
            "python-fu-pollinations-disconnect": (
                "Disconnect",
                "Disconnect your Pollinations account",
                "Removes the stored authorization from this computer.",
                _proc_disconnect,
                Gimp.ProcedureSensitivityMask.ALWAYS,
            ),
            "python-fu-pollinations-generate": (
                "Generate Image…",
                "Generate an image with Pollinations AI",
                "Pick any image model from your account's live catalog, enter a "
                "prompt, and get the result as a new image or layer.",
                _proc_generate,
                Gimp.ProcedureSensitivityMask.ALWAYS,
            ),
            "python-fu-pollinations-edit": (
                "Edit with AI…",
                "Edit the active layer or selection with an image-input model",
                "Sends the active layer (or current selection) to a model that "
                "advertises image input and returns the result as a NEW layer; "
                "the source layer is never modified.",
                _proc_edit,
                Gimp.ProcedureSensitivityMask.DRAWABLE | Gimp.ProcedureSensitivityMask.DRAWABLES,
            ),
        }
        if name not in specs:
            return None
        label, blurb, help_text, handler, sensitivity = specs[name]
        proc = Gimp.ImageProcedure.new(self, name, Gimp.PDBProcType.PLUGIN, handler, None)
        proc.set_image_types("*")
        proc.set_sensitivity_mask(sensitivity)
        proc.set_menu_label(label)
        proc.set_documentation(blurb, help_text, name)
        proc.set_attribution(*credit)
        proc.add_menu_path(MENU_PATH)
        return proc


if __name__ == "__main__":
    Gimp.main(PollinationsGimp.__gtype__, sys.argv)
