#!/usr/bin/env python3
"""Pollinations image generation and editing for GIMP 3."""

from __future__ import annotations

import os
import sys
import tempfile
import webbrowser
from pathlib import Path

import gi

gi.require_version("Gimp", "3.0")
gi.require_version("GimpUi", "3.0")
gi.require_version("Gtk", "3.0")
from gi.repository import Gimp, GimpUi, Gio, GLib, GObject, Gtk

from pollinations_gimp import (
    AuthorizationExpiredError,
    DeviceAuthorization,
    ImageModel,
    PollinationsClient,
    PollinationsError,
    TokenStore,
)

PROCEDURE = "python-fu-pollinations-image"
PLUGIN_NAME = "pollinations-gimp"
CONFIG_DIR = Path(GLib.get_user_config_dir()) / "pollinations-gimp"
CONFIG_FILE = CONFIG_DIR / "config"


def load_app_key() -> str:
    """An App Key is public attribution, never a user's private sk_ token."""
    if os.environ.get("POLLINATIONS_GIMP_APP_KEY"):
        return os.environ["POLLINATIONS_GIMP_APP_KEY"]
    try:
        return CONFIG_FILE.read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def save_app_key(value: str) -> None:
    CONFIG_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    CONFIG_FILE.write_text(value.strip(), encoding="utf-8")
    os.chmod(CONFIG_FILE, 0o600)


class PollinationsDialog(Gtk.Dialog):
    def __init__(self, image: Gimp.Image, drawable: Gimp.Drawable | None) -> None:
        super().__init__(title="Pollinations", flags=Gtk.DialogFlags.MODAL)
        self.add_button("Cancel", Gtk.ResponseType.CANCEL)
        self.add_button("Generate", Gtk.ResponseType.OK)
        self.set_default_size(520, -1)
        self.image, self.drawable = image, drawable
        self.store = TokenStore()
        self.client = PollinationsClient(self.store.load())
        self.models: list[ImageModel] = []
        self.device: DeviceAuthorization | None = None
        self.poll_source: int | None = None

        box = self.get_content_area()
        box.set_spacing(8)
        box.set_margin_top(12)
        box.set_margin_bottom(12)
        box.set_margin_start(12)
        box.set_margin_end(12)

        self.app_key = Gtk.Entry(text=load_app_key())
        self.app_key.set_placeholder_text("Publishable App Key (pk_…)")
        self.connect_button = Gtk.Button(label="Connect")
        self.connect_button.connect("clicked", self._connect)
        self.disconnect_button = Gtk.Button(label="Disconnect")
        self.disconnect_button.connect("clicked", self._disconnect)
        auth_row = Gtk.Box(spacing=6)
        auth_row.pack_start(self.app_key, True, True, 0)
        auth_row.pack_start(self.connect_button, False, False, 0)
        auth_row.pack_start(self.disconnect_button, False, False, 0)
        box.pack_start(auth_row, False, False, 0)

        self.status = Gtk.Label(xalign=0, wrap=True)
        box.pack_start(self.status, False, False, 0)
        self.prompt = Gtk.TextView(wrap_mode=Gtk.WrapMode.WORD_CHAR)
        self.prompt.set_size_request(-1, 110)
        prompt_frame = Gtk.Frame(label="Prompt")
        prompt_frame.add(self.prompt)
        box.pack_start(prompt_frame, True, True, 0)

        self.model_picker = Gtk.ComboBoxText()
        self.model_picker.connect("changed", self._model_changed)
        self.resolution_picker = Gtk.ComboBoxText()
        self.resolution_row = Gtk.Box(spacing=6)
        self.resolution_row.pack_start(Gtk.Label(label="Resolution"), False, False, 0)
        self.resolution_row.pack_start(self.resolution_picker, False, False, 0)
        self.resolution_row.set_visible(False)
        model_row = Gtk.Box(spacing=6)
        model_row.pack_start(Gtk.Label(label="Model"), False, False, 0)
        model_row.pack_start(self.model_picker, True, True, 0)
        box.pack_start(model_row, False, False, 0)
        box.pack_start(self.resolution_row, False, False, 0)

        dimensions = Gtk.Box(spacing=6)
        self.width = Gtk.SpinButton.new_with_range(64, 4096, 16)
        self.height = Gtk.SpinButton.new_with_range(64, 4096, 16)
        self.width.set_value(image.get_width())
        self.height.set_value(image.get_height())
        dimensions.pack_start(Gtk.Label(label="Width"), False, False, 0)
        dimensions.pack_start(self.width, False, False, 0)
        dimensions.pack_start(Gtk.Label(label="Height"), False, False, 0)
        dimensions.pack_start(self.height, False, False, 0)
        box.pack_start(dimensions, False, False, 0)

        self.edit_source = Gtk.CheckButton(label="Edit the active layer (keeps the source layer unchanged)")
        self.edit_source.set_sensitive(False)
        box.pack_start(self.edit_source, False, False, 0)
        self.use_selection = Gtk.CheckButton(label="Use the current selection as the edit source")
        self.use_selection.set_sensitive(False)
        box.pack_start(self.use_selection, False, False, 0)
        self._refresh_models()
        self.show_all()

    def _set_status(self, message: str) -> None:
        self.status.set_text(message)

    def _connect(self, _button: Gtk.Button) -> None:
        try:
            save_app_key(self.app_key.get_text())
            self.device = self.client.start_device_authorization(self.app_key.get_text().strip())
            webbrowser.open(self.device.verification_uri_complete)
            self._set_status(
                f"A browser was opened. Approve Pollinations access with code {self.device.user_code}."
            )
            if self.poll_source:
                GLib.source_remove(self.poll_source)
            self.poll_source = GLib.timeout_add_seconds(self.device.interval, self._poll_connection)
        except PollinationsError as error:
            self._set_status(str(error))

    def _poll_connection(self) -> bool:
        try:
            if not self.device:
                return False
            token = self.client.poll_device_authorization(self.device.device_code)
            if not token:
                return True
            self.store.save(token)
            self.device = None
            self.poll_source = None
            self._set_status("Connected. Your authorization is stored in your system keychain.")
            self._refresh_models()
            return False
        except PollinationsError as error:
            self.device = None
            self.poll_source = None
            self._set_status(str(error))
            return False

    def _disconnect(self, _button: Gtk.Button) -> None:
        self.store.clear()
        self.client.token = None
        self.models = []
        self.model_picker.remove_all()
        self.edit_source.set_sensitive(False)
        self._set_status("Disconnected. The authorization was removed from this computer.")

    def _refresh_models(self) -> None:
        if not self.client.token:
            self._set_status("Connect your Pollinations account to load the models available to you.")
            return
        try:
            self.models = self.client.list_image_models()
            self.model_picker.remove_all()
            for model in self.models:
                label = f"{model.title} ({model.id})"
                if model.community:
                    label += " — community"
                self.model_picker.append(model.id, label)
            if self.models:
                self.model_picker.set_active(0)
                self._set_status(f"Connected. Loaded {len(self.models)} image models for this account.")
            else:
                self._set_status("No image models are available to this account.")
        except PollinationsError as error:
            self._set_status(str(error))

    def _selected_model(self) -> ImageModel | None:
        active_id = self.model_picker.get_active_id()
        return next((model for model in self.models if model.id == active_id), None)

    def _model_changed(self, _picker: Gtk.ComboBoxText) -> None:
        model = self._selected_model()
        if not model:
            return
        self.edit_source.set_sensitive(bool(self.drawable and model.accepts_image))
        self.use_selection.set_sensitive(bool(self.drawable and model.accepts_image))
        if not model.accepts_image:
            self.edit_source.set_active(False)
            self.use_selection.set_active(False)
        self.resolution_picker.remove_all()
        for resolution in model.resolutions:
            self.resolution_picker.append_text(resolution)
        self.resolution_row.set_visible(bool(model.resolutions))
        if model.resolutions:
            self.resolution_picker.set_active(0)

    def values(self) -> tuple[str, ImageModel, bool, bool, int, int, str | None]:
        prompt = self.prompt.get_buffer().get_text(
            self.prompt.get_buffer().get_start_iter(), self.prompt.get_buffer().get_end_iter(), False
        ).strip()
        model = self._selected_model()
        if not prompt:
            raise PollinationsError("Enter a prompt before generating.")
        if not model:
            raise PollinationsError("Connect and select an image model first.")
        return (
            prompt,
            model,
            self.edit_source.get_active(),
            self.use_selection.get_active(),
            self.width.get_value_as_int(),
            self.height.get_value_as_int(),
            self.resolution_picker.get_active_text() if model.resolutions else None,
        )


def export_source_layer(image: Gimp.Image, drawable: Gimp.Drawable, selection_only: bool) -> Path:
    """Export only a copied active layer, so no source image data is changed."""
    duplicate = Gimp.Image.new(image.get_width(), image.get_height(), image.get_base_type())
    duplicate_layer = Gimp.Layer.new_from_drawable(drawable, duplicate)
    duplicate.insert_layer(duplicate_layer, None, 0)
    if selection_only:
        _success, non_empty, x1, y1, x2, y2 = Gimp.Selection.bounds(image)
        if not non_empty:
            raise PollinationsError("Make a selection first, or untick Use the current selection.")
        duplicate.crop(x2 - x1, y2 - y1, x1, y1)
    selected = duplicate.get_selected_drawables()
    if not selected:
        raise PollinationsError("Select a paintable layer before using image editing.")
    handle, filename = tempfile.mkstemp(suffix=".png", prefix="pollinations-gimp-")
    os.close(handle)
    path = Path(filename)
    try:
        saved = Gimp.file_save(
            Gimp.RunMode.NONINTERACTIVE, duplicate, Gio.File.new_for_path(str(path)), None
        )
        if not saved:
            raise RuntimeError("GIMP did not export the source layer")
        return path
    except Exception as error:
        path.unlink(missing_ok=True)
        raise PollinationsError("GIMP could not export the active layer for editing.") from error


def add_result_as_layer(image: Gimp.Image, source: Gimp.Drawable | None, result: bytes) -> None:
    handle, filename = tempfile.mkstemp(suffix=".png", prefix="pollinations-gimp-result-")
    os.close(handle)
    path = Path(filename)
    try:
        path.write_bytes(result)
        generated = Gimp.file_load(Gimp.RunMode.NONINTERACTIVE, Gio.File.new_for_path(str(path)))
        generated_layer = generated.get_layers()[0]
        layer = Gimp.Layer.new_from_drawable(generated_layer, image)
        layer.set_name("Pollinations result")
        position = image.get_item_position(source) + 1 if source else 0
        image.insert_layer(layer, None, position)
    except Exception as error:
        raise PollinationsError("GIMP could not add Pollinations' result as a layer.") from error
    finally:
        path.unlink(missing_ok=True)


def run(procedure, run_mode, image, drawables, config, data):
    GimpUi.init(PLUGIN_NAME)
    drawable = drawables[0] if drawables else None
    dialog = PollinationsDialog(image, drawable)
    response = dialog.run()
    if response != Gtk.ResponseType.OK:
        dialog.destroy()
        return procedure.new_return_values(Gimp.PDBStatusType.CANCEL, None)
    undo_started = False
    try:
        prompt, model, edit, selection_only, width, height, resolution = dialog.values()
        client = dialog.client
        dialog.destroy()
        if edit:
            if not drawable or not model.accepts_image:
                raise PollinationsError("The selected model does not support image editing.")
            source_path = export_source_layer(image, drawable, selection_only)
            try:
                result = client.edit(prompt, model, source_path, resolution)
            finally:
                source_path.unlink(missing_ok=True)
        else:
            result = client.generate(prompt, model, width, height, resolution)
        image.undo_group_start()
        undo_started = True
        add_result_as_layer(image, drawable, result)
        image.undo_group_end()
        undo_started = False
        return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, None)
    except PollinationsError as error:
        if undo_started:
            image.undo_group_end()
        Gimp.message(str(error))
        return procedure.new_return_values(Gimp.PDBStatusType.EXECUTION_ERROR, GLib.Error(message=str(error)))


class PollinationsGimp(Gimp.PlugIn):
    def do_query_procedures(self):
        return [PROCEDURE]

    def do_create_procedure(self, name):
        if name != PROCEDURE:
            return None
        procedure = Gimp.ImageProcedure.new(self, name, Gimp.PDBProcType.PLUGIN, run, None)
        procedure.set_sensitivity_mask(
            Gimp.ProcedureSensitivityMask.DRAWABLE | Gimp.ProcedureSensitivityMask.NO_DRAWABLES
        )
        procedure.set_menu_label("_Pollinations Image…")
        procedure.add_menu_path("<Image>/Filters/Artistic")
        procedure.set_documentation(
            "Generate or edit images with a connected Pollinations account.",
            "Uses browser-based Pollinations device authorization; no API key is pasted into GIMP.",
            None,
        )
        procedure.set_attribution("Pollinations contributors", "Apache-2.0", "2026")
        return procedure


Gimp.main(PollinationsGimp.__gtype__, sys.argv)
