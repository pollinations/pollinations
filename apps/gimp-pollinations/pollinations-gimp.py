#!/usr/bin/env python3
"""Pollinations image generation and editing for GIMP 3."""

from __future__ import annotations

import os
import sys
import tempfile
import threading
import webbrowser
from pathlib import Path

import gi

gi.require_version("Gimp", "3.0")
gi.require_version("GimpUi", "3.0")
gi.require_version("Gtk", "3.0")
from gi.repository import Gimp, GimpUi, Gio, GLib, Gtk

from pollinations_gimp import (
    DeviceAuthorization,
    ImageModel,
    PollinationsClient,
    PollinationsError,
    SlowDownError,
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
    try:
        CONFIG_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
        CONFIG_FILE.write_text(value.strip(), encoding="utf-8")
        os.chmod(CONFIG_FILE, 0o600)
    except OSError as error:
        raise PollinationsError(
            "GIMP could not save the public App Key in your preferences."
        ) from error


class PollinationsDialog(Gtk.Dialog):
    def __init__(self, image: Gimp.Image, drawable: Gimp.Drawable | None) -> None:
        super().__init__(title="Pollinations", flags=Gtk.DialogFlags.MODAL)
        self.add_button("Cancel", Gtk.ResponseType.CANCEL)
        self.generate_button = Gtk.Button(label="Generate")
        self.generate_button.connect("clicked", self._start_generation)
        self.get_action_area().pack_end(self.generate_button, False, False, 0)
        self.cancel_request_button = Gtk.Button(label="Cancel request")
        self.cancel_request_button.connect("clicked", self._cancel_generation)
        self.cancel_request_button.set_no_show_all(True)
        self.cancel_request_button.set_visible(False)
        self.get_action_area().pack_end(
            self.cancel_request_button, False, False, 0
        )
        self.set_default_size(520, -1)
        self.image, self.drawable = image, drawable
        self.store = TokenStore()
        self.client = PollinationsClient(self.store.load())
        self.models: list[ImageModel] = []
        self.device: DeviceAuthorization | None = None
        self.poll_source: int | None = None
        self.poll_interval = 5
        self.result: bytes | None = None
        self.result_placement: tuple[int, int, int, int] | None = None
        self._alive = True
        self._job_id = 0
        self.connect("destroy", self._destroyed)

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
        self.resolution_row.pack_start(
            Gtk.Label(label="Resolution"), False, False, 0
        )
        self.resolution_row.pack_start(self.resolution_picker, False, False, 0)
        self.resolution_row.set_no_show_all(True)
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

        seed_row = Gtk.Box(spacing=6)
        self.seed = Gtk.SpinButton.new_with_range(0, 2147483647, 1)
        self.seed.set_value(0)
        seed_row.pack_start(Gtk.Label(label="Seed"), False, False, 0)
        seed_row.pack_start(self.seed, False, False, 0)
        box.pack_start(seed_row, False, False, 0)

        self.edit_source = Gtk.CheckButton(
            label="Edit the active layer (keeps the source layer unchanged)"
        )
        self.edit_source.set_sensitive(False)
        box.pack_start(self.edit_source, False, False, 0)
        self.use_selection = Gtk.CheckButton(
            label="Use the current selection as the edit source"
        )
        self.use_selection.set_sensitive(False)
        box.pack_start(self.use_selection, False, False, 0)
        self._refresh_models()
        self.show_all()

    def _set_status(self, message: str) -> None:
        self.status.set_text(message)

    def _set_busy(self, busy: bool) -> None:
        self.generate_button.set_sensitive(not busy)
        self.connect_button.set_sensitive(not busy)
        self.disconnect_button.set_sensitive(not busy)
        if not busy:
            self.cancel_request_button.set_visible(False)

    def _run_worker(self, task, callback) -> None:
        self._job_id += 1
        job_id = self._job_id

        def work() -> None:
            try:
                result, error = task(), None
            except PollinationsError as caught:
                result, error = None, caught
            except Exception:
                result = None
                error = PollinationsError(
                    "The operation failed unexpectedly. Please try again."
                )
            GLib.idle_add(self._finish_worker, job_id, callback, result, error)

        threading.Thread(target=work, daemon=True).start()

    def _finish_worker(self, job_id, callback, result, error) -> bool:
        if self._alive and job_id == self._job_id:
            callback(result, error)
        return False

    def _destroyed(self, _dialog: Gtk.Dialog) -> None:
        self._alive = False
        self._job_id += 1
        if self.poll_source is not None:
            GLib.source_remove(self.poll_source)
            self.poll_source = None

    def _connect(self, _button: Gtk.Button) -> None:
        try:
            save_app_key(self.app_key.get_text())
        except PollinationsError as error:
            self._set_status(str(error))
            return
        app_key = self.app_key.get_text().strip()
        self._set_busy(True)
        self._set_status("Starting Pollinations authorization…")

        def start():
            return self.client.start_device_authorization(app_key)

        self._run_worker(start, self._authorization_started)

    def _authorization_started(self, device, error) -> None:
        if error:
            self._set_busy(False)
            self._set_status(str(error))
            return
        self.device = device
        self.poll_interval = device.interval
        opened = webbrowser.open(device.verification_uri_complete)
        if opened:
            self._set_status(
                f"A browser was opened. Approve Pollinations access with code {device.user_code}."
            )
        else:
            self._set_status(
                f"Open {device.verification_uri_complete} and approve access with "
                f"code {device.user_code}."
            )
        self._schedule_poll()

    def _schedule_poll(self) -> None:
        self.poll_source = GLib.timeout_add_seconds(
            self.poll_interval, self._poll_connection
        )

    def _poll_connection(self) -> bool:
        self.poll_source = None
        if not self.device:
            return False
        device_code = self.device.device_code

        def poll():
            token = self.client.poll_device_authorization(device_code)
            if token:
                self.store.save(token)
            return token

        self._run_worker(poll, self._authorization_polled)
        return False

    def _authorization_polled(self, token, error) -> None:
        if isinstance(error, SlowDownError):
            self.poll_interval += 5
            self._schedule_poll()
            return
        if error:
            self.device = None
            self._set_busy(False)
            self._set_status(str(error))
            return
        if not token:
            self._schedule_poll()
            return
        self.device = None
        self._set_status(
            "Connected. Your authorization is stored in your system keychain."
        )
        self._refresh_models()

    def _disconnect(self, _button: Gtk.Button) -> None:
        self.client.token = None
        self.models = []
        self.model_picker.remove_all()
        self.edit_source.set_sensitive(False)
        self.use_selection.set_sensitive(False)
        self._set_busy(True)

        def disconnected(_result, error) -> None:
            self._set_busy(False)
            self._set_status(
                str(error)
                if error
                else "Disconnected. The authorization was removed from this computer."
            )

        self._run_worker(self.store.clear, disconnected)

    def _refresh_models(self) -> None:
        if not self.client.token:
            self._set_status(
                "Connect your Pollinations account to load the models available to you."
            )
            return
        self._set_busy(True)
        self._set_status("Loading the image models available to this account…")
        self._run_worker(self.client.list_image_models, self._models_loaded)

    def _models_loaded(self, models, error) -> None:
        self._set_busy(False)
        if error:
            self._set_status(str(error))
            return
        self.models = models
        self.model_picker.remove_all()
        for model in self.models:
            label = f"{model.title} ({model.id})"
            if model.community:
                label += " — community"
            self.model_picker.append(model.id, label)
        if self.models:
            self.model_picker.set_active(0)
            self._set_status(
                f"Connected. Loaded {len(self.models)} image models for this account."
            )
        else:
            self._set_status("No image models are available to this account.")

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

    def values(
        self,
    ) -> tuple[str, ImageModel, bool, bool, int, int, str | None, int]:
        prompt = self.prompt.get_buffer().get_text(
            self.prompt.get_buffer().get_start_iter(),
            self.prompt.get_buffer().get_end_iter(),
            False,
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
            (
                self.resolution_picker.get_active_text()
                if model.resolutions
                else None
            ),
            self.seed.get_value_as_int(),
        )

    def _start_generation(self, _button: Gtk.Button) -> None:
        try:
            prompt, model, edit, selection_only, width, height, resolution, seed = (
                self.values()
            )
            if edit:
                if not self.drawable or not model.accepts_image:
                    raise PollinationsError(
                        "The selected model does not support image editing."
                    )
                source_path, placement = export_source_layer(
                    self.image, self.drawable, selection_only
                )
            else:
                source_path, placement = None, None
        except PollinationsError as error:
            self._set_status(str(error))
            return

        self._set_busy(True)
        self.cancel_request_button.set_visible(True)
        self._set_status(
            "Editing with Pollinations…"
            if edit
            else "Generating with Pollinations…"
        )

        def generate():
            if source_path:
                try:
                    return self.client.edit(prompt, model, source_path, resolution)
                finally:
                    source_path.unlink(missing_ok=True)
            return self.client.generate(prompt, model, width, height, resolution, seed)

        def generated(result, error) -> None:
            self._set_busy(False)
            if error:
                self._set_status(str(error))
                return
            self.result = result
            self.result_placement = placement
            self.response(Gtk.ResponseType.OK)

        self._run_worker(generate, generated)

    def _cancel_generation(self, _button: Gtk.Button) -> None:
        self._job_id += 1
        self.result = None
        self.result_placement = None
        self._set_busy(False)
        self._set_status(
            "Request cancelled. Any response already in flight will be discarded."
        )


def export_source_layer(
    image: Gimp.Image, drawable: Gimp.Drawable, selection_only: bool
) -> tuple[Path, tuple[int, int, int, int] | None]:
    """Export only a copied active layer, so no source image data is changed."""
    duplicate = Gimp.Image.new(
        image.get_width(), image.get_height(), image.get_base_type()
    )
    duplicate_layer = Gimp.Layer.new_from_drawable(drawable, duplicate)
    duplicate.insert_layer(duplicate_layer, None, 0)
    placement = None
    handle, filename = tempfile.mkstemp(suffix=".png", prefix="pollinations-gimp-")
    os.close(handle)
    path = Path(filename)
    try:
        if selection_only:
            _success, non_empty, x1, y1, x2, y2 = Gimp.Selection.bounds(image)
            if not non_empty:
                raise PollinationsError(
                    "Make a selection first, or untick Use the current selection."
                )
            placement = (x1, y1, x2 - x1, y2 - y1)
            duplicate.crop(placement[2], placement[3], x1, y1)
        saved = Gimp.file_save(
            Gimp.RunMode.NONINTERACTIVE,
            duplicate,
            Gio.File.new_for_path(str(path)),
            None,
        )
        if not saved:
            raise RuntimeError("GIMP did not export the source layer")
        return path, placement
    except Exception as error:
        path.unlink(missing_ok=True)
        if isinstance(error, PollinationsError):
            raise
        raise PollinationsError(
            "GIMP could not export the active layer for editing."
        ) from error
    finally:
        duplicate.delete()


def add_result_as_layer(
    image: Gimp.Image,
    source: Gimp.Drawable | None,
    result: bytes,
    placement: tuple[int, int, int, int] | None,
) -> None:
    handle, filename = tempfile.mkstemp(
        suffix=".png", prefix="pollinations-gimp-result-"
    )
    os.close(handle)
    path = Path(filename)
    generated = None
    try:
        path.write_bytes(result)
        generated = Gimp.file_load(
            Gimp.RunMode.NONINTERACTIVE, Gio.File.new_for_path(str(path))
        )
        generated_layer = generated.get_layers()[0]
        layer = Gimp.Layer.new_from_drawable(generated_layer, image)
        layer.set_name("Pollinations result")
        parent = source.get_parent() if source else None
        position = image.get_item_position(source) if source else 0
        image.insert_layer(layer, parent, position)
        if placement:
            x, y, width, height = placement
            layer.scale(width, height, False)
            layer.set_offsets(x, y)
    except Exception as error:
        raise PollinationsError(
            "GIMP could not add Pollinations' result as a layer."
        ) from error
    finally:
        if generated:
            generated.delete()
        path.unlink(missing_ok=True)


def run(procedure, run_mode, image, drawables, config, data):
    GimpUi.init(PLUGIN_NAME)
    drawable = drawables[0] if drawables else None
    dialog = PollinationsDialog(image, drawable)
    response = dialog.run()
    if response != Gtk.ResponseType.OK:
        dialog.destroy()
        return procedure.new_return_values(Gimp.PDBStatusType.CANCEL, None)
    result = dialog.result
    placement = dialog.result_placement
    dialog.destroy()
    if result is None:
        return procedure.new_return_values(
            Gimp.PDBStatusType.EXECUTION_ERROR,
            GLib.Error(message="Pollinations did not return an image."),
        )
    undo_started = False
    try:
        image.undo_group_start()
        undo_started = True
        add_result_as_layer(image, drawable, result, placement)
        image.undo_group_end()
        undo_started = False
        Gimp.displays_flush()
        return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, None)
    except PollinationsError as error:
        if undo_started:
            image.undo_group_end()
        Gimp.message(str(error))
        return procedure.new_return_values(
            Gimp.PDBStatusType.EXECUTION_ERROR,
            GLib.Error(message=str(error)),
        )


class PollinationsGimp(Gimp.PlugIn):
    def do_query_procedures(self):
        return [PROCEDURE]

    def do_create_procedure(self, name):
        if name != PROCEDURE:
            return None
        procedure = Gimp.ImageProcedure.new(
            self, name, Gimp.PDBProcType.PLUGIN, run, None
        )
        procedure.set_sensitivity_mask(
            Gimp.ProcedureSensitivityMask.DRAWABLE
            | Gimp.ProcedureSensitivityMask.NO_DRAWABLES
        )
        procedure.set_menu_label("_Pollinations Image…")
        procedure.add_menu_path("<Image>/Filters/Artistic")
        procedure.set_documentation(
            "Generate or edit images with a connected Pollinations account.",
            "Uses browser-based Pollinations device authorization; no API key "
            "is pasted into GIMP.",
            None,
        )
        procedure.set_attribution("Pollinations contributors", "Apache-2.0", "2026")
        return procedure


Gimp.main(PollinationsGimp.__gtype__, sys.argv)
