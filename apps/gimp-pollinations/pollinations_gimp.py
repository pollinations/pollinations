#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pollinations_gimp.py — Pollinations AI image plug-in for GIMP 3.

Brings Pollinations image generation and editing into GIMP with BYOP
(Bring Your Own Pollen): every user connects their own Pollinations account
through OAuth 2.0 device authorization (RFC 8628) — no API key is ever
pasted into GIMP.

Menu: Filters > Pollinations AI
  * Connect Account…     run the device-authorization flow
  * Disconnect Account   remove the stored authorization
  * Generate Image…      text-to-image → new layer or new image
  * Edit with AI…        active layer/selection → edited copy as new layer

The image model picker is loaded live from /image/models (including
community models); no model IDs are hardcoded. Controls that a model does
not advertise are not shown.

This file is the GIMP/GTK glue; all networking lives in pollinations_api.py
(pure standard library, unit-testable without GIMP).
"""

import gi

gi.require_version('Gimp', '3.0')
gi.require_version('Gtk', '3.0')

from gi.repository import Gimp, Gio, GLib, GObject, Gtk

import os
import sys
import tempfile
import threading

# Make the sibling api module importable no matter how GIMP loads us.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pollinations_api as polli

PROC_CONNECT = "plug-in-pollinations-connect"
PROC_DISCONNECT = "plug-in-pollinations-disconnect"
PROC_GENERATE = "plug-in-pollinations-generate"
PROC_EDIT = "plug-in-pollinations-edit"

MENU_PATH = "<Image>/Filters/Pollinations AI"

NOT_CONNECTED = (
    "This plug-in is not connected to Pollinations yet.\n\n"
    "Choose Filters > Pollinations AI > Connect Account… and approve the "
    "request in your browser. You never need an API key — you authorize "
    "with your own Pollinations account and it stays yours."
)


# ---------------------------------------------------------------------------
# Small UI helpers
# ---------------------------------------------------------------------------

def _message(kind, title, text):
    dialog = Gtk.MessageDialog(
        transient_for=None,
        flags=Gtk.DialogFlags.DESTROY_WITH_PARENT,
        message_type=kind,
        buttons=Gtk.ButtonsType.OK,
        text=title)
    dialog.format_secondary_text(text)
    dialog.run()
    dialog.destroy()


def _error(text):
    _message(Gtk.MessageType.ERROR, "Pollinations AI", text)


def _info(text):
    _message(Gtk.MessageType.INFO, "Pollinations AI", text)


def _confirm(title, text):
    dialog = Gtk.MessageDialog(
        transient_for=None,
        flags=Gtk.DialogFlags.DESTROY_WITH_PARENT,
        message_type=Gtk.MessageType.QUESTION,
        buttons=Gtk.ButtonsType.YES_NO,
        text=title)
    dialog.format_secondary_text(text)
    answer = dialog.run()
    dialog.destroy()
    return answer == Gtk.ResponseType.YES


def _open_uri(uri):
    try:
        Gio.AppInfo.launch_default_for_uri(uri, None)
        return True
    except Exception:
        return False


def _on_main(function):
    """Run `function` on the GTK main thread (worker threads use this)."""
    GLib.idle_add(function)


def _store():
    return polli.TokenStore()


def _connected_client():
    token = _store().load_token()
    if not token:
        raise polli.AuthError(NOT_CONNECTED)
    return polli.PollinationsClient(token)


def _show_pollinations_error(error):
    """Map an api error to a dialog with a recovery message; returns True
    when the error invalidated the stored authorization."""
    if isinstance(error, polli.AuthError):
        _store().clear()  # dead key — force a fresh Connect
    _error(error.user_message)
    return isinstance(error, polli.AuthError)


# ---------------------------------------------------------------------------
# GIMP file / layer plumbing
# ---------------------------------------------------------------------------

def _file_load(path):
    gfile = Gio.File.new_for_path(path)
    try:
        return Gimp.file_load(Gimp.RunMode.NONINTERACTIVE, gfile)
    except TypeError:
        result = Gimp.file_load(Gimp.RunMode.NONINTERACTIVE, gfile, None)
        return result[0] if isinstance(result, tuple) else result


def _file_save_png(image, path):
    gfile = Gio.File.new_for_path(path)
    try:
        saved = Gimp.file_save(Gimp.RunMode.NONINTERACTIVE, image, gfile, None)
    except TypeError:
        saved = Gimp.file_save(Gimp.RunMode.NONINTERACTIVE, image, gfile)
    if saved is False:
        raise RuntimeError("GIMP could not export the PNG file at " + path)


def _center_layer(image, layer):
    layer.set_offsets(
        (image.get_width() - layer.get_width()) // 2,
        (image.get_height() - layer.get_height()) // 2)


def _insert_generated(image, image_bytes, as_new_image):
    """Add generated `image_bytes` to GIMP as a new image or a new layer.

    Returns the newly created Gimp.Image when `as_new_image` is true.
    """
    handle, path = tempfile.mkstemp(prefix="pollinations-", suffix=".png")
    with os.fdopen(handle, "wb") as file:
        file.write(image_bytes)
    try:
        loaded = _file_load(path)
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass

    if as_new_image:
        Gimp.Display.new(loaded)
        return loaded

    image.undo_group_start()
    try:
        layers = loaded.get_layers()
        layer = Gimp.Layer.new_from_drawable(layers[0], image)
        image.insert_layer(layer, None, 0)
        _center_layer(image, layer)
    finally:
        image.undo_group_end()
        loaded.delete()
    return None


def _export_drawable_png(image, drawable):
    """Return PNG bytes of a COPY of `drawable`, cropped to the selection.

    The source image is never touched.
    """
    non_empty, x, y, width, height = image.get_selection_bounds()
    if non_empty:
        temp = Gimp.Image.new(width, height, Gimp.ImageBaseType.RGB)
    else:
        width = drawable.get_width()
        height = drawable.get_height()
        temp = Gimp.Image.new(width, height, Gimp.ImageBaseType.RGB)

    layer = Gimp.Layer.new_from_drawable(drawable, temp)
    layer.set_offsets(0 if not non_empty else -x, 0 if not non_empty else -y)
    temp.insert_layer(layer, None, 0)

    handle, path = tempfile.mkstemp(prefix="pollinations-src-", suffix=".png")
    os.close(handle)
    try:
        _file_save_png(temp, path)
        with open(path, "rb") as file:
            return file.read()
    finally:
        temp.delete()
        try:
            os.unlink(path)
        except OSError:
            pass


# ---------------------------------------------------------------------------
# Connect Account… dialog (BYOP device flow, RFC 8628)
# ---------------------------------------------------------------------------

class ConnectDialog(Gtk.Dialog):

    def __init__(self):
        super().__init__(title="Connect Pollinations Account", modal=True)
        self.set_border_width(12)
        self.set_resizable(False)

        self._cancelled = threading.Event()
        self._thread = None

        box = self.get_content_area()
        box.set_spacing(10)

        box.pack_start(Gtk.Label(
            label="Authorize this plug-in with your own Pollinations "
                  "account (Bring Your Own Pollen)."),
            False, False, 0)

        self._code_label = Gtk.Label(label="")
        self._code_label.set_selectable(True)
        self._code_label.get_style_context().add_class("monospace")
        self._code_label.set_markup(
            "<span size='xx-large' weight='bold'>…</span>")
        box.pack_start(self._code_label, False, False, 5)

        self._uri_button = Gtk.LinkButton.new_with_label("", "")
        self._uri_button.set_visible(False)
        box.pack_start(self._uri_button, False, False, 0)

        self._browser_button = Gtk.Button.new_with_mnemonic(
            "_Open Browser with Code")
        self._browser_button.set_visible(False)
        self._browser_button.connect("clicked", self._on_open_browser)
        box.pack_start(self._browser_button, False, False, 5)

        status_row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
        self._spinner = Gtk.Spinner()
        status_row.pack_start(self._spinner, False, False, 0)
        self._status = Gtk.Label(label="Requesting a device code…")
        status_row.pack_start(self._status, False, False, 0)
        box.pack_start(status_row, False, False, 5)

        self.add_button("_Cancel", Gtk.ResponseType.CANCEL)
        self.connect("response", self._on_response)
        self.connect("delete-event", self._on_delete)

        self.show_all()
        self._spinner.start()

        self._thread = threading.Thread(target=self._work, daemon=True)
        self._thread.start()

    # -- event handlers -----------------------------------------------------

    def _on_open_browser(self, _button):
        uri = self._uri_button.get_uri()
        if uri and not _open_uri(uri):
            _error("Could not open the browser automatically.\n"
                   "Open %s manually." % uri)

    def _on_response(self, _dialog, _response):
        self._cancelled.set()
        self.destroy()

    def _on_delete(self, *_args):
        self._cancelled.set()
        return False

    # -- flow ----------------------------------------------------------------

    def _work(self):
        authenticator = polli.DeviceAuthenticator()
        try:
            code = authenticator.request_device_code()
        except polli.PollinationsError as error:
            _on_main(lambda: self._fail(error.user_message))
            return

        def show_code():
            self._code_label.set_markup(
                "<span size='xx-large' weight='bold'>%s</span>"
                % GLib.markup_escape_text(code.user_code))
            self._uri_button.set_uri(code.verification_uri_complete)
            self._uri_button.set_label(code.verification_uri_complete)
            self._uri_button.set_visible(True)
            self._browser_button.set_visible(True)
            self._status.set_text(
                "Waiting for approval… (code valid for %d minutes)"
                % max(code.expires_in // 60, 1))
            return False

        _on_main(show_code)

        try:
            token = authenticator.poll_for_token(
                code.device_code,
                interval=code.interval,
                expires_in=code.expires_in,
                is_cancelled=self._cancelled.is_set)
        except polli.PollinationsError as error:
            _on_main(lambda: self._fail(error.user_message))
            return
        if token is None:
            return  # cancelled by the user

        username = authenticator.fetch_username(token)
        _store().save(token, username)

        def succeed():
            self._spinner.stop()
            who = " as %s" % username if username else ""
            self._status.set_text("Connected%s. You can close this window."
                                  % who)
            _info("Connected to Pollinations%s.\n\nYour authorization is "
                  "stored privately and survives GIMP restarts. Choose "
                  "Disconnect Account any time to remove it." % who)
            self.destroy()
            return False

        _on_main(succeed)

    def _fail(self, message):
        if self._cancelled.is_set():
            return False
        self._spinner.stop()
        self._status.set_text("Connection failed.")
        _error(message)
        return False


# ---------------------------------------------------------------------------
# Model picker + shared dialog machinery for Generate / Edit
# ---------------------------------------------------------------------------

class ModelPicker(object):
    """Loads /image/models at runtime and fills a Gtk combo box."""

    def __init__(self, combo, edit_only, on_loaded=None, preselect=None):
        self.combo = combo
        self.edit_only = edit_only
        self.on_loaded = on_loaded
        self.preselect = preselect
        self.models = []

    def load_async(self):
        self.combo.remove_all()
        self.combo.append_text("Loading models…")
        self.combo.set_active(0)
        self.combo.set_sensitive(False)
        thread = threading.Thread(target=self._work, daemon=True)
        thread.start()

    def _work(self):
        try:
            client = _connected_client()
            models = client.list_image_models()
        except polli.PollinationsError as error:
            _on_main(lambda: self._fail(error))
            return
        _on_main(lambda: self._fill(models))

    def _fail(self, error):
        self.combo.remove_all()
        self.combo.append_text("Could not load models")
        self.combo.set_active(0)
        if isinstance(error, polli.AuthError):
            self._store_clear_auth()
        self.combo.set_sensitive(False)
        if self.on_loaded:
            self.on_loaded(error.user_message)
        return False

    @staticmethod
    def _store_clear_auth():
        _store().clear()

    def _fill(self, models):
        if self.edit_only:
            models = [m for m in models if polli.supports_image_input(m)]
        self.models = polli.sort_models(models)
        self.combo.remove_all()
        if not self.models:
            self.combo.append_text("No models available")
            self.combo.set_sensitive(False)
            if self.on_loaded:
                self.on_loaded("No image models are available to your "
                               "account right now.")
            return False
        for model in self.models:
            self.combo.append_text(polli.model_label(model))
        active = 0
        if self.preselect:
            for index, model in enumerate(self.models):
                if model.get("name") == self.preselect:
                    active = index
                    break
        self.combo.set_active(active)
        self.combo.set_sensitive(True)
        if self.on_loaded:
            self.on_loaded(None)
        return False

    def selected(self):
        index = self.combo.get_active()
        if 0 <= index < len(self.models):
            return self.models[index]
        return None


class GenerateDialog(Gtk.Dialog):
    """Prompt → image, added as a new layer or opened as a new image."""

    TARGET_LAYER, TARGET_IMAGE = 0, 1

    def __init__(self, image, prompt="", model="", size=""):
        super().__init__(title="Generate Image with Pollinations", modal=True)
        self.set_border_width(12)
        self.set_default_size(420, 380)

        self.image = image
        self.result = None      # (prompt, model_name, size, target)
        self._busy = False

        store = _store()
        auth = store.load()
        who = auth.get("username") if auth else None
        header = ("Connected as %s" % who) if who else "Connected to Pollinations"

        box = self.get_content_area()
        box.set_spacing(8)

        box.pack_start(Gtk.Label(label=header + " — model list is fetched "
                                   "live from your account."),
                       False, False, 0)

        model_row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=6)
        model_row.pack_start(Gtk.Label(label="_Model:"), False, False, 0)
        self.model_combo = Gtk.ComboBoxText()
        model_row.pack_start(self.model_combo, True, True, 0)
        box.pack_start(model_row, False, False, 0)

        box.pack_start(Gtk.Label(label="_Prompt:"), False, False, 0)
        scrolled = Gtk.ScrolledWindow()
        scrolled.set_min_content_height(120)
        scrolled.set_policy(Gtk.PolicyType.AUTOMATIC, Gtk.PolicyType.AUTOMATIC)
        self.prompt_view = Gtk.TextView()
        self.prompt_view.get_buffer().set_text(prompt)
        scrolled.add(self.prompt_view)
        box.pack_start(scrolled, True, True, 0)

        self._target_row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL,
                                   spacing=12)
        self.radio_layer = Gtk.RadioButton.new_with_label(
            None, "Add as new layer")
        self.radio_image = Gtk.RadioButton.new_with_label_from_widget(
            self.radio_layer, "Open as new image")
        self._target_row.pack_start(self.radio_layer, False, False, 0)
        self._target_row.pack_start(self.radio_image, False, False, 0)
        box.pack_start(self._target_row, False, False, 0)

        self._size_row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL,
                                 spacing=6)
        self._size_row.pack_start(Gtk.Label(label="_Size:"), False, False, 0)
        self.size_entry = Gtk.Entry()
        self.size_entry.set_text(size or "1024x1024")
        self.size_entry.set_width_chars(12)
        self._size_row.pack_start(self.size_entry, False, False, 0)
        self.resolution_combo = Gtk.ComboBoxText()
        self.resolution_combo.set_no_show_all(True)
        self._size_row.pack_start(self.resolution_combo, False, False, 0)
        box.pack_start(self._size_row, False, False, 0)
        box.pack_start(Gtk.Label(
            label="The size control only appears for models that advertise "
                  "supported resolutions."),
            False, False, 0)

        status_row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
        self.spinner = Gtk.Spinner()
        status_row.pack_start(self.spinner, False, False, 0)
        self.status = Gtk.Label(label="")
        status_row.pack_start(self.status, False, False, 0)
        box.pack_start(status_row, False, False, 0)

        self.add_button("_Cancel", Gtk.ResponseType.CANCEL)
        self.generate_button = self.add_button(
            "_Generate", Gtk.ResponseType.OK)
        self.set_default_response(Gtk.ResponseType.OK)
        self.connect("response", self._on_response)

        self.show_all()
        self.model_combo.connect("changed", self._on_model_changed)
        self.picker = ModelPicker(self.model_combo, edit_only=False,
                                  on_loaded=self._models_loaded,
                                  preselect=model or None)
        self.picker.load_async()

    def _models_loaded(self, error):
        if error:
            self.status.set_text(error)

    def _on_model_changed(self, _combo):
        model = self.picker.selected()
        # Capability gating: show resolution tiers only when advertised,
        # otherwise a free-form size.
        if model is not None and polli.has_resolutions(model):
            self.size_entry.hide()
            self.resolution_combo.show_all()
            self.resolution_combo.remove_all()
            for resolution in model.get("resolutions") or []:
                self.resolution_combo.append_text(str(resolution))
            self.resolution_combo.set_active(0)
        else:
            self.resolution_combo.hide()
            self.size_entry.show_all()

    def _selected_size(self):
        model = self.picker.selected()
        if model is not None and polli.has_resolutions(model):
            text = self.resolution_combo.get_active_text()
            return polli.resolution_to_size(text) if text else ""
        return self.size_entry.get_text().strip()

    def _on_response(self, _dialog, response):
        if response != Gtk.ResponseType.OK:
            self.destroy()
            return
        if self._busy:
            return
        model = self.picker.selected()
        prompt = self._prompt_text()
        if not prompt:
            self.status.set_text("Enter a prompt first.")
            return
        self._busy = True
        self.generate_button.set_sensitive(False)
        self.spinner.start()
        self.status.set_text("Generating… this can take a moment.")
        threading.Thread(
            target=self._work,
            args=(prompt, (model or {}).get("name", ""), self._selected_size()),
            daemon=True).start()

    def _prompt_text(self):
        buffer = self.prompt_view.get_buffer()
        return buffer.get_text(buffer.get_start_iter(), buffer.get_end_iter(),
                               False).strip()

    def _work(self, prompt, model_name, size):
        try:
            client = _connected_client()
            image_bytes = client.generate_image(prompt, model=model_name,
                                                size=size)
        except polli.PollinationsError as error:
            _on_main(lambda: self._fail(error))
            return
        _on_main(lambda: self._succeed(prompt, model_name, size, image_bytes))

    def _fail(self, error):
        self._busy = False
        self.spinner.stop()
        self.generate_button.set_sensitive(True)
        self.status.set_text("")
        _show_pollinations_error(error)
        return False

    def _succeed(self, prompt, model_name, size, image_bytes):
        self.result = (
            prompt, model_name, size,
            self.TARGET_IMAGE if self.radio_image.get_active()
            else self.TARGET_LAYER,
        )
        self.result_bytes = image_bytes
        self.spinner.stop()
        self.destroy()
        return False


class EditDialog(Gtk.Dialog):
    """Active layer (cropped to the selection) → edited copy as a new layer."""

    def __init__(self, image, drawable, prompt="", model=""):
        super().__init__(title="Edit with AI (Pollinations)", modal=True)
        self.set_border_width(12)
        self.set_default_size(420, 340)

        self.image = image
        self.drawable = drawable
        self.result = None
        self.result_bytes = None
        self._busy = False

        box = self.get_content_area()
        box.set_spacing(8)

        store = _store()
        auth = store.load()
        who = auth.get("username") if auth else None
        header = ("Connected as %s" % who) if who else "Connected to Pollinations"

        box.pack_start(Gtk.Label(label=header + " — image-input models only."),
                       False, False, 0)

        model_row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=6)
        model_row.pack_start(Gtk.Label(label="_Model:"), False, False, 0)
        self.model_combo = Gtk.ComboBoxText()
        model_row.pack_start(self.model_combo, True, True, 0)
        box.pack_start(model_row, False, False, 0)

        box.pack_start(Gtk.Label(label="_Prompt:"), False, False, 0)
        scrolled = Gtk.ScrolledWindow()
        scrolled.set_min_content_height(120)
        scrolled.set_policy(Gtk.PolicyType.AUTOMATIC, Gtk.PolicyType.AUTOMATIC)
        self.prompt_view = Gtk.TextView()
        self.prompt_view.get_buffer().set_text(prompt)
        scrolled.add(self.prompt_view)
        box.pack_start(scrolled, True, True, 0)

        box.pack_start(Gtk.Label(
            label="A copy of the active layer%s is sent for editing. The "
                  "result is added as a NEW layer — your original is never "
                  "touched." % self._source_note()), False, False, 0)

        status_row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
        self.spinner = Gtk.Spinner()
        status_row.pack_start(self.spinner, False, False, 0)
        self.status = Gtk.Label(label="")
        status_row.pack_start(self.status, False, False, 0)
        box.pack_start(status_row, False, False, 0)

        self.add_button("_Cancel", Gtk.ResponseType.CANCEL)
        self.edit_button = self.add_button("_Edit", Gtk.ResponseType.OK)
        self.set_default_response(Gtk.ResponseType.OK)
        self.connect("response", self._on_response)

        self.show_all()
        self.picker = ModelPicker(self.model_combo, edit_only=True,
                                  on_loaded=self._models_loaded,
                                  preselect=model or None)
        self.picker.load_async()

    def _source_note(self):
        non_empty, _x, _y, width, height = self.image.get_selection_bounds()
        if non_empty:
            return " (cropped to the %d×%d selection)" % (width, height)
        return ""

    def _models_loaded(self, error):
        if error:
            self.status.set_text(error)

    def _prompt_text(self):
        buffer = self.prompt_view.get_buffer()
        return buffer.get_text(buffer.get_start_iter(), buffer.get_end_iter(),
                               False).strip()

    def _on_response(self, _dialog, response):
        if response != Gtk.ResponseType.OK:
            self.destroy()
            return
        if self._busy:
            return
        prompt = self._prompt_text()
        if not prompt:
            self.status.set_text("Enter a prompt describing the edit.")
            return
        model = self.picker.selected()
        if model is not None and not polli.supports_image_input(model):
            self.status.set_text("Pick a model that accepts image input.")
            return
        self._busy = True
        self.edit_button.set_sensitive(False)
        self.spinner.start()
        self.status.set_text("Uploading and editing… this can take a moment.")

        source_bytes = _export_drawable_png(self.image, self.drawable)
        threading.Thread(
            target=self._work,
            args=(prompt, (model or {}).get("name", ""), source_bytes),
            daemon=True).start()

    def _work(self, prompt, model_name, source_bytes):
        try:
            client = _connected_client()
            result_bytes = client.edit_image(prompt, source_bytes,
                                             model=model_name)
        except polli.PollinationsError as error:
            _on_main(lambda: self._fail(error))
            return
        _on_main(lambda: self._succeed(prompt, model_name, result_bytes))

    def _fail(self, error):
        self._busy = False
        self.spinner.stop()
        self.edit_button.set_sensitive(True)
        self.status.set_text("")
        _show_pollinations_error(error)
        return False

    def _succeed(self, prompt, model_name, result_bytes):
        self.result = (prompt, model_name)
        self.result_bytes = result_bytes
        self.spinner.stop()
        self.destroy()
        return False


# ---------------------------------------------------------------------------
# Procedure run callbacks
# ---------------------------------------------------------------------------

def run_connect(procedure, run_mode, config, data):
    if run_mode != Gimp.RunMode.NONINTERACTIVE:
        ConnectDialog().run()
    return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, None)


def run_disconnect(procedure, run_mode, config, data):
    store = _store()
    if run_mode != Gimp.RunMode.NONINTERACTIVE and store.load_token():
        if not _confirm("Disconnect Pollinations?",
                        "Remove the stored authorization? You will be able "
                        "to connect again at any time."):
            return procedure.new_return_values(Gimp.PDBStatusType.CANCEL, None)
    store.clear()
    if run_mode != Gimp.RunMode.NONINTERACTIVE:
        _info("Disconnected. Your Pollinations account is no longer "
              "authorized in GIMP.")
    return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, None)


def run_generate(procedure, run_mode, image, drawables, config, data):
    prompt = config.get_property("prompt") or ""
    model = config.get_property("model") or ""
    size = config.get_property("size") or ""
    target = config.get_property("target")

    dialog = None
    if run_mode != Gimp.RunMode.NONINTERACTIVE:
        dialog = GenerateDialog(image, prompt=prompt, model=model, size=size)
        dialog.run()
        if dialog.result is None:
            return procedure.new_return_values(Gimp.PDBStatusType.CANCEL,
                                               None)
        prompt, model, size, target = dialog.result
        try:
            _insert_generated(image, dialog.result_bytes,
                              target == GenerateDialog.TARGET_IMAGE)
        except polli.PollinationsError as error:
            _show_pollinations_error(error)
            return procedure.new_return_values(
                Gimp.PDBStatusType.EXECUTION_ERROR, None)
        except Exception as error:
            _error("Could not add the generated image to GIMP:\n%s" % error)
            return procedure.new_return_values(
                Gimp.PDBStatusType.EXECUTION_ERROR, None)
        Gimp.displays_flush()
        return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, None)

    # NONINTERACTIVE / batch: run straight from the procedure arguments.
    if not prompt:
        return procedure.new_return_values(
            Gimp.PDBStatusType.CALLING_ERROR,
            GLib.Error("The 'prompt' argument is required."))
    try:
        client = _connected_client()
        image_bytes = client.generate_image(prompt, model=model, size=size)
        _insert_generated(image, image_bytes, target == 1)
    except polli.PollinationsError as error:
        _show_pollinations_error(error)
        return procedure.new_return_values(
            Gimp.PDBStatusType.EXECUTION_ERROR, None)
    except Exception as error:
        return procedure.new_return_values(
            Gimp.PDBStatusType.EXECUTION_ERROR,
            GLib.Error(str(error)))
    Gimp.displays_flush()
    return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, None)


def run_edit(procedure, run_mode, image, drawables, config, data):
    if not drawables:
        return procedure.new_return_values(
            Gimp.PDBStatusType.CALLING_ERROR,
            GLib.Error("Edit with AI needs an active layer."))
    drawable = drawables[0]

    prompt = config.get_property("prompt") or ""
    model = config.get_property("model") or ""

    if run_mode != Gimp.RunMode.NONINTERACTIVE:
        dialog = EditDialog(image, drawable, prompt=prompt, model=model)
        dialog.run()
        if dialog.result is None:
            return procedure.new_return_values(Gimp.PDBStatusType.CANCEL,
                                               None)
        prompt, model = dialog.result
        try:
            _insert_generated(image, dialog.result_bytes, as_new_image=False)
        except Exception as error:
            _error("Could not add the edited result to GIMP:\n%s" % error)
            return procedure.new_return_values(
                Gimp.PDBStatusType.EXECUTION_ERROR, None)
        Gimp.displays_flush()
        return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, None)

    if not prompt:
        return procedure.new_return_values(
            Gimp.PDBStatusType.CALLING_ERROR,
            GLib.Error("The 'prompt' argument is required."))
    try:
        client = _connected_client()
        source_bytes = _export_drawable_png(image, drawable)
        image_bytes = client.edit_image(prompt, source_bytes, model=model)
        _insert_generated(image, image_bytes, as_new_image=False)
    except polli.PollinationsError as error:
        _show_pollinations_error(error)
        return procedure.new_return_values(
            Gimp.PDBStatusType.EXECUTION_ERROR, None)
    except Exception as error:
        return procedure.new_return_values(
            Gimp.PDBStatusType.EXECUTION_ERROR,
            GLib.Error(str(error)))
    Gimp.displays_flush()
    return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, None)


# ---------------------------------------------------------------------------
# Plug-in registration
# ---------------------------------------------------------------------------

class PollinationsPlugin(Gimp.PlugIn):

    def do_set_i18n(self):
        return True, "gnu", None

    def do_query_procedures(self):
        return [PROC_CONNECT, PROC_DISCONNECT, PROC_GENERATE, PROC_EDIT]

    def do_create_procedure(self, name):
        procedure = None

        if name == PROC_CONNECT:
            procedure = Gimp.Procedure.new(
                self, name, Gimp.PDBProcType.PLUGIN, run_connect, None)
            procedure.set_menu_label("Connect _Account…")
            procedure.add_menu_path(MENU_PATH)
            procedure.set_documentation(
                "Connect your own Pollinations account (BYOP)",
                "Runs the OAuth 2.0 device authorization flow: open the "
                "approval page in a browser, enter the shown code, and the "
                "plug-in stores the resulting user key privately. No API "
                "key is ever typed into GIMP.",
                name)

        elif name == PROC_DISCONNECT:
            procedure = Gimp.Procedure.new(
                self, name, Gimp.PDBProcType.PLUGIN, run_disconnect, None)
            procedure.set_menu_label("_Disconnect Account")
            procedure.add_menu_path(MENU_PATH)
            procedure.set_documentation(
                "Remove the stored Pollinations authorization",
                "Deletes the user key that Connect Account stored. The "
                "account can be reconnected at any time.",
                name)

        elif name == PROC_GENERATE:
            procedure = Gimp.ImageProcedure.new(
                self, name, Gimp.PDBProcType.PLUGIN, run_generate, None)
            procedure.set_menu_label("_Generate Image…")
            procedure.add_menu_path(MENU_PATH)
            procedure.set_sensitivity_mask(
                Gimp.ProcedureSensitivityMask.DRAWABLE
                | Gimp.ProcedureSensitivityMask.NO_DRAWABLES)
            procedure.add_string_argument(
                "prompt", "Prompt",
                "Text description of the image to generate", "",
                GObject.ParamFlags.READWRITE)
            procedure.add_string_argument(
                "model", "Model",
                "Image model ID from /image/models (empty = default)", "",
                GObject.ParamFlags.READWRITE)
            procedure.add_string_argument(
                "size", "Size",
                "Output size as WIDTHxHEIGHT", "1024x1024",
                GObject.ParamFlags.READWRITE)
            procedure.add_int_argument(
                "target", "Target",
                "0 = add as new layer, 1 = open as new image",
                0, 1, 0, GObject.ParamFlags.READWRITE)
            procedure.set_documentation(
                "Generate an image with Pollinations",
                "Generates an image from a text prompt using the connected "
                "Pollinations account and adds the result to GIMP as a new "
                "layer or a new image. The model list is fetched live from "
                "/image/models.",
                name)

        elif name == PROC_EDIT:
            procedure = Gimp.ImageProcedure.new(
                self, name, Gimp.PDBProcType.PLUGIN, run_edit, None)
            procedure.set_menu_label("Edit with _AI…")
            procedure.add_menu_path(MENU_PATH)
            procedure.set_sensitivity_mask(
                Gimp.ProcedureSensitivityMask.DRAWABLE)
            procedure.add_string_argument(
                "prompt", "Prompt",
                "How the image should be edited", "",
                GObject.ParamFlags.READWRITE)
            procedure.add_string_argument(
                "model", "Model",
                "Image model ID (must accept image input)", "",
                GObject.ParamFlags.READWRITE)
            procedure.set_documentation(
                "Edit the active layer with Pollinations",
                "Sends a copy of the active layer (cropped to the selection) "
                "to Pollinations with the prompt, and inserts the result as "
                "a new layer. The source layer is never modified.",
                name)

        if procedure is not None:
            procedure.set_attribution(
                "Pollinations contributors",
                "CC0 — public domain",
                "2026")
        return procedure


Gimp.main(PollinationsPlugin.__gtype__, sys.argv)
