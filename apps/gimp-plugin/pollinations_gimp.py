#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pollinations AI image generation and editing for GIMP 3.

Adds a Filters > Pollinations AI menu with four commands:
  - Connect Account...  BYOP (RFC 8628) device-flow authorization.
  - Generate Image...   text-to-image; result as a new layer or image.
  - Edit with AI...     send the active drawable/selection to an image-input
                        model; result as a new layer (source untouched).
  - Disconnect          remove the stored authorization.

All API/auth/catalog logic lives in the pure-standard-library module
``pollinations_api.py`` so it can be unit-tested outside GIMP. This file only
contains the GIMP/GTK glue; the pollinations.py data layer never touches gi.

Requires GIMP 3 (its bundled Python) and Pillow available to that interpreter.
"""

import io
import os
import sys
import tempfile
import threading
from pathlib import Path

# Make pollinations_api importable regardless of plug-in install location.
_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

import gi  # noqa: E402

gi.require_version("Gimp", "3.0")
gi.require_version("GimpUi", "3.0")
from gi.repository import Gimp, GimpUi, Gio, GLib, Gtk  # noqa: E402

from PIL import Image  # noqa: E402

from pollinations_api import (  # noqa: E402
    AuthError,
    PollinationsError,
    TokenStore,
    fetch_userinfo,
    generate_image,
    load_image_models,
    poll_device_token,
    request_device_code,
)

PLUG_IN_BINARY = "pollinations-gimp"
MENU_LABEL = "Pollinations AI"
MENU_PATH = "<Image>/Filters/_" + MENU_LABEL  # underscore = mnemonic

CONNECT = "pollinations-connect"
GENERATE = "pollinations-generate"
EDIT = "pollinations-edit"
DISCONNECT = "pollinations-disconnect"


def _text(message):
    return message


# --------------------------------------------------------------------------
# Run functions (GIMP 3 ImageProcedure callbacks)
# --------------------------------------------------------------------------


def connect_run(procedure, run_mode, image, drawables, config, data):
    if run_mode == Gimp.RunMode.INTERACTIVE:
        GimpUi.init(PLUG_IN_BINARY)
        token = _device_flow()
        if token is None:
            return procedure.new_return_values(Gimp.PDBStatusType.CANCEL, None)
        store = TokenStore()
        store.save(token)
        username = ""
        try:
            info = fetch_userinfo(token)
            username = info.get("preferred_username") or ""
        except PollinationsError:
            pass
        _info(
            "Connected to Pollinations"
            + (f" as {username}." if username else ".")
            + "\nThe authorization is stored privately on this device"
            + " and survives restarts.",
        )
        return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, None)
    return procedure.new_return_values(Gimp.PDBStatusType.CANCEL, None)


def generate_run(procedure, run_mode, image, drawables, config, data):
    if run_mode != Gimp.RunMode.INTERACTIVE:
        return procedure.new_return_values(Gimp.PDBStatusType.EXECUTION_ERROR,
                                           GLib.Error("Interactive-only"))
    GimpUi.init(PLUG_IN_BINARY)
    token = _require_token()
    if token is None:
        return procedure.new_return_values(Gimp.PDBStatusType.CALLING_ERROR,
                                           GLib.Error("Not connected"))

    try:
        models = load_image_models(token)
    except PollinationsError as exc:
        _info(exc.message)
        return procedure.new_return_values(Gimp.PDBStatusType.CALLING_ERROR,
                                           GLib.Error(exc.message))

    text_models = [m for m in models if m.accepts_text] or models
    choice = _form(
        "Generate Image with Pollinations",
        [
            ("prompt", "Prompt", ""),
            ("model", "Model", [m.label for m in text_models]),
            ("width", "Width (px)", "1024"),
            ("height", "Height (px)", "1024"),
        ],
    )
    if choice is None:
        return procedure.new_return_values(Gimp.PDBStatusType.CANCEL, None)
    prompt = (choice.get("prompt") or "").strip()
    if not prompt:
        _info("Please enter a prompt.")
        return procedure.new_return_values(Gimp.PDBStatusType.CALLING_ERROR,
                                           GLib.Error("Empty prompt"))
    model = text_models[int(choice.get("model", 0))].name
    try:
        width = int(choice.get("width") or 1024)
        height = int(choice.get("height") or 1024)
    except ValueError:
        width, height = 1024, 1024
    try:
        image_bytes = generate_image(token, prompt, model=model,
                                     width=width, height=height)
    except (AuthError, PollinationsError) as exc:
        if isinstance(exc, AuthError):
            TokenStore().delete()
        _info(exc.message)
        return procedure.new_return_values(Gimp.PDBStatusType.EXECUTION_ERROR,
                                           GLib.Error(exc.message))
    _insert_image(image_bytes)
    _info("Image generated and added as a new layer.")
    return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, None)


def edit_run(procedure, run_mode, image, drawables, config, data):
    if run_mode != Gimp.RunMode.INTERACTIVE:
        return procedure.new_return_values(Gimp.PDBStatusType.EXECUTION_ERROR,
                                           GLib.Error("Interactive-only"))
    GimpUi.init(PLUG_IN_BINARY)
    token = _require_token()
    if token is None:
        return procedure.new_return_values(Gimp.PDBStatusType.CALLING_ERROR,
                                           GLib.Error("Not connected"))
    if image is None:
        _info("No image is open to edit.")
        return procedure.new_return_values(Gimp.PDBStatusType.CALLING_ERROR,
                                           GLib.Error("No image"))
    drawable = image.get_active_drawable()
    if drawable is None:
        _info("Select a layer to edit.")
        return procedure.new_return_values(Gimp.PDBStatusType.CALLING_ERROR,
                                           GLib.Error("No layer"))

    try:
        models = load_image_models(token)
    except PollinationsError as exc:
        _info(exc.message)
        return procedure.new_return_values(Gimp.PDBStatusType.CALLING_ERROR,
                                           GLib.Error(exc.message))
    edit_models = [m for m in models if m.accepts_image]
    if not edit_models:
        _info("No model is currently available for image editing.")
        return procedure.new_return_values(Gimp.PDBStatusType.CALLING_ERROR,
                                           GLib.Error("No edit model"))
    choice = _form(
        "Edit with Pollinations AI",
        [
            ("prompt", "Edit instruction", ""),
            ("model", "Model", [m.label for m in edit_models]),
        ],
    )
    if choice is None:
        return procedure.new_return_values(Gimp.PDBStatusType.CANCEL, None)
    prompt = (choice.get("prompt") or "").strip()
    if not prompt:
        _info("Please enter an edit instruction.")
        return procedure.new_return_values(Gimp.PDBStatusType.CALLING_ERROR,
                                           GLib.Error("Empty prompt"))
    model = edit_models[int(choice.get("model", 0))].name

    png_bytes, width, height = _export_active_png(drawable)
    if png_bytes is None:
        return procedure.new_return_values(Gimp.PDBStatusType.EXECUTION_ERROR,
                                           GLib.Error("Could not export the layer"))
    try:
        image_bytes = generate_image(token, prompt, model=model,
                                     width=width, height=height,
                                     reference=png_bytes, reference_mime="image/png")
    except (AuthError, PollinationsError) as exc:
        if isinstance(exc, AuthError):
            TokenStore().delete()
        _info(exc.message)
        return procedure.new_return_values(Gimp.PDBStatusType.EXECUTION_ERROR,
                                           GLib.Error(exc.message))
    _insert_image(image_bytes)
    _info("Edit complete. Result added as a new layer (source unchanged).")
    return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, None)


def disconnect_run(procedure, run_mode, image, drawables, config, data):
    if run_mode == Gimp.RunMode.INTERACTIVE:
        GimpUi.init(PLUG_IN_BINARY)
        TokenStore().delete()
        _info("Pollinations disconnected. The stored authorization was removed.")
        return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, None)
    return procedure.new_return_values(Gimp.PDBStatusType.CANCEL, None)


# --------------------------------------------------------------------------
# The GIMP 3 plug-in class
# --------------------------------------------------------------------------


class PollinationsPlugIn(Gimp.PlugIn):
    plug_in_procedures = [CONNECT, GENERATE, EDIT, DISCONNECT]

    def do_query_procedures(self):
        return self.plug_in_procedures

    def do_create_procedure(self, name):
        if name == CONNECT:
            run = connect_run
        elif name == GENERATE:
            run = generate_run
        elif name == EDIT:
            run = edit_run
        elif name == DISCONNECT:
            run = disconnect_run
        else:
            return None

        procedure = Gimp.ImageProcedure.new(
            self, name, Gimp.PDBProcType.PLUGIN, run, None
        )
        procedure.set_image_types("*")
        procedure.set_documentation(
            _text(_description(name)),
            _text(_description(name)),
            name,
        )
        procedure.set_attribution("Pollinations", "Pollinations Contributors", "2026")
        procedure.add_menu_path(MENU_PATH)
        procedure.set_menu_label(_text(_menu_label(name)))
        procedure.set_sensitivity_mask(_sensitivity(name))
        return procedure


# --------------------------------------------------------------------------
# Helpers: catalog / token
# --------------------------------------------------------------------------


def _require_token():
    token = TokenStore().load()
    if not token:
        _info(
            "Not connected to Pollinations.\n\n"
            "Use Filters > Pollinations AI > Connect Account first.",
        )
    return token


# --------------------------------------------------------------------------
# Dialogs
# --------------------------------------------------------------------------


def _info(text):
    dialog = Gtk.MessageDialog(
        text=text, modal=True, buttons=Gtk.ButtonsType.OK
    )
    dialog.run()
    dialog.destroy()


def _form(title, fields):
    """Modal form with entries and combos; returns {key: value} or None."""
    dialog = Gtk.Dialog(title=title)
    dialog.set_modal(True)
    dialog.add_button("Cancel", Gtk.ResponseType.CANCEL)
    dialog.add_button("OK", Gtk.ResponseType.OK)
    box = dialog.get_content_area()
    box.set_spacing(8)
    grid = Gtk.Grid()
    grid.set_column_spacing(10)
    grid.set_row_spacing(8)
    box.pack_start(grid, True, True, 0)
    box.set_margin_top(12)
    box.set_margin_bottom(8)
    box.set_margin_start(12)
    box.set_margin_end(12)

    widgets = {}
    for i, (key, label_text, spec) in enumerate(fields):
        grid.attach(Gtk.Label(label=label_text, xalign=0), 0, i, 1, 1)
        if isinstance(spec, list):
            combo = Gtk.ComboBoxText()
            for item in spec:
                combo.append_text(item)
            combo.set_active(0)
            widgets[key] = combo
            grid.attach(combo, 1, i, 1, 1)
        else:
            entry = Gtk.Entry()
            entry.set_text(str(spec))
            widgets[key] = entry
            grid.attach(entry, 1, i, 1, 1)

    dialog.show_all()
    response = dialog.run()
    dialog.destroy()
    if response != Gtk.ResponseType.OK:
        return None
    values = {}
    for key, _label, spec in fields:
        widget = widgets[key]
        values[key] = (
            widget.get_active()
            if isinstance(spec, list)
            else widget.get_text()
        )
    return values


def _device_flow():
    """BYOP device-flow with a modal dialog; returns the token or None."""

    dialog = Gtk.Dialog(title="Connect Pollinations")
    dialog.set_modal(True)
    dialog.add_button("Cancel", Gtk.ResponseType.CANCEL)
    dialog.add_button("Open Browser", Gtk.ResponseType.ACCEPT)
    dialog.set_default_size(440, 200)
    box = dialog.get_content_area()
    box.set_spacing(10)
    box.set_margin_top(14)
    box.set_margin_bottom(10)
    box.set_margin_start(14)
    box.set_margin_end(14)

    label = Gtk.Label(label="Requesting device code…", wrap=True, xalign=0)
    box.pack_start(label, True, True, 0)

    state = {"token": None, "device": None, "error": None}

    def show_code(device):
        url = device.verification_uri_complete or (
            "https://enter.pollinations.ai" + device.verification_uri
        )
        label.set_markup(
            "Open your browser and go to:\n<b>{0}</b>\n\n"
            "Enter the code: <b>{1}</b>\n\n"
            "Waiting for approval… (do not close this dialog yet)".format(
                url, device.user_code
            )
        )
        label.show()

    def worker():
        try:
            device = request_device_code()
            state["device"] = device
            GLib.idle_add(show_code, device)
            token = poll_device_token(device.device_code)
            state["token"] = token
        except Exception as exc:  # noqa: BLE001 - shown in the UI
            state["error"] = str(exc)
        try:
            GLib.idle_add(dialog.response, Gtk.ResponseType.OK)
        except Exception:  # noqa: BLE001 - dialog may already be gone
            pass

    def on_response(_dlg, response_id):
        if response_id == Gtk.ResponseType.ACCEPT and state.get("device"):
            _open_url(
                state["device"].verification_uri_complete
                or "https://enter.pollinations.ai"
                + state["device"].verification_uri
            )

    threading.Thread(target=worker, daemon=True).start()
    dialog.connect("response", on_response)
    dialog.show_all()
    dialog.run()
    dialog.destroy()

    if state["error"]:
        _info(state["error"])
        return None
    return state["token"]


def _open_url(url):
    import subprocess

    try:
        if sys.platform == "darwin":
            subprocess.Popen(["open", url])
        elif sys.platform.startswith("win"):
            subprocess.Popen(["cmd", "/c", "start", "", url])
        else:
            subprocess.Popen(["xdg-open", url], stderr=subprocess.DEVNULL)
    except Exception:  # noqa: BLE001 - best effort
        pass


# --------------------------------------------------------------------------
# Image helpers (GIMP PDB glue)
# --------------------------------------------------------------------------


def _pdb_call(name, **props):
    """Run a PDB procedure non-interactively; returns result tuple."""
    proc = Gimp.get_pdb().lookup_procedure(name)
    if proc is None:
        raise PollinationsError(f"Missing GIMP procedure: {name}")
    cfg = proc.create_config()
    cfg.set_property("run-mode", Gimp.RunMode.NONINTERACTIVE)
    for key, value in props.items():
        cfg.set_property(key, value)
    return proc.run(cfg)


def _export_active_png(drawable, max_side=1024):
    """Export the active drawable (cropped to selection) as PNG bytes.

    Works on a duplicate so the source is never altered. Returns
    (png_bytes, width, height) or (None, 0, 0) on failure.
    """
    image = drawable.get_image()
    dup = image.duplicate()

    # Keep only the counterpart of the active drawable.
    active_name = drawable.get_name()
    target = None
    for layer in dup.get_layers():
        if layer.get_name() == active_name:
            target = layer
            break
    if target is not None:
        for layer in list(dup.get_layers()):
            if layer is not target:
                layer.delete()

    # Honour the active selection when one exists.
    rect = _selection_rect(dup)
    if rect is not None:
        x, y, w, h = rect
        if w > 0 and h > 0:
            _pdb_call("gimp-image-crop",
                      image=dup, new_width=w, new_height=h,
                      offset_x=x, offset_y=y)

    # Flatten to a single layer.
    _pdb_call("gimp-image-flatten", image=dup)
    width, height = dup.get_width(), dup.get_height()
    if width == 0 or height == 0:
        return None, 0, 0
    scale = min(1.0, max_side / float(max(width, height)))
    if scale < 1.0:
        _pdb_call("gimp-image-scale", image=dup,
                  new_width=int(width * scale), new_height=int(height * scale))
        width, height = dup.get_width(), dup.get_height()

    path = str(Path(tempfile.mkdtemp(prefix="pollinations-gimp-")) / "input.png")
    drawable_out = dup.get_active_drawable()
    if drawable_out is not None:
        try:
            result = _pdb_call(
                "file-png-save",
                image=dup,
                drawable=drawable_out,
                file=Gio.File.new_for_path(path),
                filename=path,
            )
            if result.index(0) == Gimp.PDBStatusType.SUCCESS:
                with open(path, "rb") as fh:
                    return fh.read(), width, height
        except Exception as exc:  # noqa: BLE001
            GLib.log(PLUG_IN_BINARY, GLib.LogLevelFlags.LEVEL_WARNING,
                     "PNG export failed: %s", exc)
    return None, 0, 0


def _selection_rect(image):
    """Return the selection bounds (x, y, w, h) or None when none."""
    try:
        selection = image.get_selection()
        if selection is None:
            return None
        non_empty, x1, y1, x2, y2 = selection.bounds()
    except Exception:  # noqa: BLE001 - empty or entirely selected
        return None
    if not non_empty or x2 <= x1 or y2 <= y1:
        return None
    return int(x1), int(y1), int(x2 - x1), int(y2 - y1)


def _insert_image(png_bytes):
    """Insert PNG bytes as a new layer on the active image (or a new image)."""
    pil_img = Image.open(io.BytesIO(png_bytes))
    width, height = pil_img.size

    images = Gimp.image_list()
    if images:
        image = images[0]
    else:
        image = Gimp.Image.new(width, height, Gimp.ImageType.RGB)
        Gimp.context_append_image(image)
        Gimp.context_set_image(image)

    tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    try:
        tmp.write(png_bytes)
        tmp.close()
        layer = Gimp.file_load_layer(Gimp.RunMode.NONINTERACTIVE, image, tmp.name)
        if layer is not None:
            image.insert_layer(layer, None, 0)
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass


# --------------------------------------------------------------------------
# Labels / metadata
# --------------------------------------------------------------------------


def _menu_label(name):
    return {
        CONNECT: "Connect Account…",
        GENERATE: "Generate Image…",
        EDIT: "Edit with AI…",
        DISCONNECT: "Disconnect",
    }[name]


def _description(name):
    return {
        CONNECT: "Authorize Pollinations on this device via BYOP device flow.",
        GENERATE: "Generate an image from a prompt and add it as a new layer.",
        EDIT: "Send the active drawable/selection to an image-input model; "
               "adds the result as a new layer.",
        DISCONNECT: "Remove the stored Pollinations authorization.",
    }[name]


def _sensitivity(name):
    if name == EDIT:
        return Gimp.ProcedureSensitivityMask.DRAWABLE
    if name == GENERATE:
        return (
            Gimp.ProcedureSensitivityMask.DRAWABLE
            | Gimp.ProcedureSensitivityMask.NO_IMAGE
            | Gimp.ProcedureSensitivityMask.NO_DRAWABLES
        )
    return (
        Gimp.ProcedureSensitivityMask.NO_IMAGE
        | Gimp.ProcedureSensitivityMask.NO_DRAWABLES
    )


Gimp.main(PollinationsPlugIn.__gtype__, sys.argv)