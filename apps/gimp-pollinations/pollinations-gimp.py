#!/usr/bin/env python3
"""GIMP 3: Filters > Pollinations. No third-party Python dependencies."""
import os
from pathlib import Path
import sys
import tempfile
import threading
import webbrowser

import gi
gi.require_version("Gimp", "3.0")
gi.require_version("GimpUi", "3.0")
gi.require_version("Gtk", "3.0")
from gi.repository import Gimp, GimpUi, Gio, GLib, Gtk

from pollinations_api import ApiError, AuthError, Cancelled, begin_authorization, generate, load_models, poll_authorization
from token_store import TokenStore


def background(label, task, cancellable=False):
    """Network runs off the GTK thread. GIMP PDB calls always stay on it."""
    dialog = Gtk.Dialog(title="Pollinations", modal=True)
    dialog.set_default_size(440, 100)
    text = Gtk.Label(label=label, wrap=True, selectable=True, margin=16)
    dialog.get_content_area().pack_start(text, True, True, 0)
    cancel = threading.Event()
    result = []
    finished = False
    if cancellable:
        dialog.add_button("Cancel", Gtk.ResponseType.CANCEL)

    def close_request(*_):
        if cancellable:
            cancel.set()
            dialog.response(Gtk.ResponseType.CANCEL)
        return True

    dialog.connect("delete-event", close_request)

    def complete():
        if not finished:
            dialog.response(Gtk.ResponseType.OK)
        return False

    def worker():
        try:
            result.append((True, task(cancel)))
        except Exception as error:
            result.append((False, error))
        GLib.idle_add(complete)

    dialog.show_all()
    threading.Thread(target=worker, daemon=True).start()
    response = dialog.run()
    finished = True
    dialog.destroy()
    if response != Gtk.ResponseType.OK:
        cancel.set()
        raise Cancelled("Cancelled.")
    success, value = result[0]
    if not success:
        raise value
    return value


def export_source(drawable):
    intersects, x, y, width, height = drawable.mask_intersect()
    if not intersects:
        raise ApiError("The selection does not overlap the active layer.")
    _, offset_x, offset_y = drawable.get_offsets()
    # Copy the drawable so exporting/cropping cannot modify the source image.
    copy = Gimp.Image.new(drawable.get_width(), drawable.get_height(), Gimp.ImageBaseType.RGB)
    if copy is None:
        raise ApiError("Could not copy the active layer.")
    try:
        copied_layer = Gimp.Layer.new_from_drawable(drawable, copy)
        copy.insert_layer(copied_layer, None, 0)
        copied_layer.set_offsets(0, 0)
        copy.crop(width, height, x, y)
        with tempfile.TemporaryDirectory(prefix="pollinations-source-") as directory:
            path = Path(directory) / "source.png"
            procedure = Gimp.get_pdb().lookup_procedure("file-png-export")
            config = procedure.create_config()
            config.set_property("run-mode", Gimp.RunMode.NONINTERACTIVE)
            config.set_property("image", copy)
            config.set_property("file", Gio.File.new_for_path(str(path)))
            result = procedure.run(config)
            if result.index(0) != Gimp.PDBStatusType.SUCCESS:
                raise ApiError("Could not export the active layer as PNG.")
            return path.read_bytes(), (offset_x + x, offset_y + y, width, height)
    finally:
        copy.delete()


def insert_result(data, image=None, bounds=None):
    with tempfile.TemporaryDirectory(prefix="pollinations-result-") as directory:
        path = Path(directory) / "result.png"
        path.write_bytes(data)
        file = Gio.File.new_for_path(str(path))
        if image is None:
            result = Gimp.file_load(Gimp.RunMode.NONINTERACTIVE, file)
            if result is None:
                raise ApiError("Could not open the generated image.")
            Gimp.Display.new(result)
            return result
        layer = Gimp.file_load_layer(Gimp.RunMode.NONINTERACTIVE, image, file)
        if layer is None:
            raise ApiError("Could not load the generated layer.")
        image.undo_group_start()
        try:
            image.insert_layer(layer, None, 0)
            layer.set_name("Pollinations result")
            if bounds:
                x, y, width, height = bounds
                layer.scale(width, height, False)
                layer.set_offsets(x, y)
        finally:
            image.undo_group_end()
        Gimp.displays_flush()
        return layer


def generation_dialog(models, editing, has_image):
    if editing:
        models = [m for m in models if "image" in m.get("input_modalities", [])]
    if not models:
        raise ApiError("No available models support image editing.")
    dialog = Gtk.Dialog(title="Edit with Pollinations" if editing else "Generate with Pollinations", modal=True)
    dialog.add_button("Cancel", Gtk.ResponseType.CANCEL)
    dialog.add_button("Generate", Gtk.ResponseType.OK)
    dialog.set_default_size(520, 300)
    box = dialog.get_content_area()
    box.set_spacing(10)
    box.set_border_width(16)
    picker = Gtk.ComboBoxText()
    for index, model in enumerate(models):
        title = model.get("title") or model["name"]
        picker.append(str(index), f"{title} ({model['name']})" + (" · Community" if model.get("community") else ""))
    box.pack_start(Gtk.Label(label="Model", xalign=0), False, False, 0)
    box.pack_start(picker, False, False, 0)
    prompt = Gtk.TextView(wrap_mode=Gtk.WrapMode.WORD_CHAR)
    scroll = Gtk.ScrolledWindow()
    scroll.set_min_content_height(100)
    scroll.add(prompt)
    box.pack_start(Gtk.Label(label="Prompt", xalign=0), False, False, 0)
    box.pack_start(scroll, True, True, 0)
    resolution = Gtk.ComboBoxText()
    resolution_row = Gtk.Box(spacing=10)
    resolution_row.pack_start(Gtk.Label(label="Resolution"), False, False, 0)
    resolution_row.pack_start(resolution, True, True, 0)
    box.pack_start(resolution_row, False, False, 0)
    new_image = Gtk.CheckButton(label="Open as a new image")
    new_image.set_active(not has_image)
    if not editing and has_image:
        box.pack_start(new_image, False, False, 0)
    if editing:
        box.pack_start(Gtk.Label(label="The selected region (or whole active layer) is sent for editing. The result becomes a new layer.", wrap=True, xalign=0), False, False, 0)

    def changed(*_):
        options = models[picker.get_active()].get("resolutions", [])
        resolution.remove_all()
        resolution.append("", "Model default")
        for option in options:
            resolution.append(option, option)
        resolution.set_active(0)
        resolution_row.set_visible(bool(options))

    picker.connect("changed", changed)
    picker.set_active(0)
    dialog.show_all()
    changed()
    try:
        while dialog.run() == Gtk.ResponseType.OK:
            buffer = prompt.get_buffer()
            text = buffer.get_text(buffer.get_start_iter(), buffer.get_end_iter(), False).strip()
            if text:
                return models[picker.get_active()], text, resolution.get_active_id() or None, new_image.get_active()
            prompt.grab_focus()
        raise Cancelled("Cancelled.")
    finally:
        dialog.destroy()


class Pollinations(Gimp.PlugIn):
    def do_query_procedures(self):
        return ["plug-in-pollinations-" + action for action in ("connect", "disconnect", "generate", "edit")]

    def do_create_procedure(self, name):
        action = name.rsplit("-", 1)[-1]
        procedure = Gimp.ImageProcedure.new(self, name, Gimp.PDBProcType.PLUGIN, self.run, action)
        procedure.set_image_types("*")
        mask = Gimp.ProcedureSensitivityMask.DRAWABLE if action == "edit" else Gimp.ProcedureSensitivityMask.ALWAYS
        procedure.set_sensitivity_mask(mask)
        procedure.set_menu_label({"connect": "Connect Account…", "disconnect": "Disconnect Account", "generate": "Generate Image…", "edit": "Edit Active Layer…"}[action])
        procedure.add_menu_path("<Image>/Filters/Pollinations")
        procedure.set_documentation("Pollinations image generation with your account", "Connect through browser authorization; generate or edit on a new layer.", name)
        procedure.set_attribution("Pollinations contributors", "Pollinations contributors", "2026")
        return procedure

    def run(self, procedure, run_mode, image, drawables, config, action):
        if run_mode != Gimp.RunMode.INTERACTIVE:
            return procedure.new_return_values(Gimp.PDBStatusType.CALLING_ERROR, GLib.Error("Use this plug-in interactively."))
        GimpUi.init("pollinations-gimp")
        store = TokenStore()
        try:
            if action == "connect":
                code = background("Starting connection…", lambda _: begin_authorization(os.environ.get("POLLINATIONS_GIMP_APP_KEY", "")))
                webbrowser.open(code["approval_url"])
                token = background(f"Approve in your browser. Code: {code['user_code']}\n{code['approval_url']}", lambda cancel: poll_authorization(code, cancel), cancellable=True)
                store.save(token)
                Gimp.message("Pollinations connected. Authorization is saved privately for future sessions.")
            elif action == "disconnect":
                store.clear()
                Gimp.message("Disconnected on this computer. You can also revoke the authorization in your Pollinations account's Keys page.")
            else:
                token = store.load()
                if not token:
                    raise ApiError("Use Filters > Pollinations > Connect Account first.")
                editing = action == "edit"
                if editing and (not image or len(drawables) != 1 or not isinstance(drawables[0], Gimp.Layer)):
                    raise ApiError("Select exactly one layer to edit.")
                models = background("Loading available image models…", lambda _: load_models(token))
                model, prompt, resolution, new_image = generation_dialog(models, editing, image is not None)
                source, bounds = export_source(drawables[0]) if editing else (None, None)
                data = background("Generating… This can take several minutes. Keep this window open until the request completes.", lambda _: generate(token, model, prompt, resolution, source))
                insert_result(data, image if editing or not new_image else None, bounds)
            return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, None)
        except Cancelled:
            return procedure.new_return_values(Gimp.PDBStatusType.CANCEL, None)
        except (ApiError, OSError) as error:
            if isinstance(error, AuthError):
                store.clear()
            return procedure.new_return_values(Gimp.PDBStatusType.EXECUTION_ERROR, GLib.Error(str(error)))


if __name__ == "__main__":
    Gimp.main(Pollinations.__gtype__, sys.argv)
