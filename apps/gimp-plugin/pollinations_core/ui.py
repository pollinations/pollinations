import threading
import time
import webbrowser
from typing import Any, List, Optional, Tuple

from .api import (
    ModelInfo,
    PollinationsAPIClient,
    PollinationsAuthError,
    PollinationsPollenError,
)
from .auth import AuthManager
from .gimp_utils import export_drawable_or_selection_to_png_bytes

try:
    import gi
    gi.require_version('Gtk', '3.0')
    gi.require_version('Gdk', '3.0')
    from gi.repository import Gtk, GLib
    HAS_GTK = True
except Exception:
    HAS_GTK = False


class PollinationsDialog:
    """Main GIMP Plugin Dialog UI implemented with GTK3."""

    def __init__(self, image: Any = None, drawable: Any = None):
        self.image = image
        self.drawable = drawable
        self.auth_manager = AuthManager()
        self.token = self.auth_manager.get_saved_token()
        self.api_client = PollinationsAPIClient(token=self.token)

        self.models: List[ModelInfo] = []
        self.selected_model: Optional[ModelInfo] = None
        self.result_bytes: Optional[bytes] = None
        self.error_message: Optional[str] = None

        if HAS_GTK:
            self._build_ui()

    def _build_ui(self) -> None:
        self.window = Gtk.Dialog(title="Pollinations AI Image Generation & Editing", flags=0)
        self.window.set_default_size(520, 600)
        self.window.set_border_width(12)

        content_area = self.window.get_content_area()
        vbox = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=10)
        content_area.pack_start(vbox, True, True, 0)

        # -------------------------------------------------------------
        # Section 1: Account / Auth Status Header
        # -------------------------------------------------------------
        auth_frame = Gtk.Frame(label=" Pollinations Account (BYOP) ")
        vbox.pack_start(auth_frame, False, False, 0)

        auth_hbox = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=10)
        auth_hbox.set_border_width(8)
        auth_frame.add(auth_hbox)

        self.auth_status_label = Gtk.Label(label="Checking authentication...")
        self.auth_status_label.set_xalign(0.0)
        auth_hbox.pack_start(self.auth_status_label, True, True, 0)

        self.auth_btn = Gtk.Button(label="Connect")
        self.auth_btn.connect("clicked", self._on_auth_btn_clicked)
        auth_hbox.pack_end(self.auth_btn, False, False, 0)

        self._update_auth_ui()

        # -------------------------------------------------------------
        # Section 2: Model Picker (Dynamically loaded from /image/models)
        # -------------------------------------------------------------
        model_frame = Gtk.Frame(label=" AI Model Selection ")
        vbox.pack_start(model_frame, False, False, 0)

        model_vbox = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=6)
        model_vbox.set_border_width(8)
        model_frame.add(model_vbox)

        model_hbox = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
        model_vbox.pack_start(model_hbox, False, False, 0)

        model_lbl = Gtk.Label(label="Model:")
        model_lbl.set_xalign(0.0)
        model_hbox.pack_start(model_lbl, False, False, 0)

        self.model_combo = Gtk.ComboBoxText()
        self.model_combo.connect("changed", self._on_model_changed)
        model_hbox.pack_start(self.model_combo, True, True, 0)

        self.refresh_models_btn = Gtk.Button(label="Refresh")
        self.refresh_models_btn.connect("clicked", lambda w: self._load_models_async())
        model_hbox.pack_end(self.refresh_models_btn, False, False, 0)

        self.model_desc_label = Gtk.Label(label="")
        self.model_desc_label.set_xalign(0.0)
        self.model_desc_label.set_line_wrap(True)
        model_vbox.pack_start(self.model_desc_label, False, False, 0)

        # -------------------------------------------------------------
        # Section 3: Input Image / Editing Source (Capability driven)
        # -------------------------------------------------------------
        self.edit_frame = Gtk.Frame(label=" Input Source for Editing / Image-to-Image ")
        vbox.pack_start(self.edit_frame, False, False, 0)

        edit_vbox = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=6)
        edit_vbox.set_border_width(8)
        self.edit_frame.add(edit_vbox)

        self.edit_source_combo = Gtk.ComboBoxText()
        self.edit_source_combo.append("none", "None (Text-to-Image Generation)")
        self.edit_source_combo.append("layer", "Active Layer")
        self.edit_source_combo.append("selection", "Active Selection / Canvas Region")
        self.edit_source_combo.set_active(0)
        edit_vbox.pack_start(self.edit_source_combo, False, False, 0)

        self.capability_note = Gtk.Label(label="")
        self.capability_note.set_xalign(0.0)
        edit_vbox.pack_start(self.capability_note, False, False, 0)

        # -------------------------------------------------------------
        # Section 4: Prompt and Parameters
        # -------------------------------------------------------------
        param_frame = Gtk.Frame(label=" Generation Parameters ")
        vbox.pack_start(param_frame, True, True, 0)

        param_vbox = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=8)
        param_vbox.set_border_width(8)
        param_frame.add(param_vbox)

        prompt_lbl = Gtk.Label(label="Prompt:")
        prompt_lbl.set_xalign(0.0)
        param_vbox.pack_start(prompt_lbl, False, False, 0)

        self.prompt_textview = Gtk.TextView()
        self.prompt_textview.set_wrap_mode(Gtk.WrapMode.WORD)
        prompt_scrolled = Gtk.ScrolledWindow()
        prompt_scrolled.set_min_content_height(80)
        prompt_scrolled.add(self.prompt_textview)
        param_vbox.pack_start(prompt_scrolled, True, True, 0)

        # Aspect ratio and Seed in a horizontal row
        opt_hbox = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=10)
        param_vbox.pack_start(opt_hbox, False, False, 0)

        ar_lbl = Gtk.Label(label="Aspect Ratio:")
        opt_hbox.pack_start(ar_lbl, False, False, 0)

        self.ar_combo = Gtk.ComboBoxText()
        opt_hbox.pack_start(self.ar_combo, False, False, 0)

        seed_lbl = Gtk.Label(label="Seed (Optional):")
        opt_hbox.pack_start(seed_lbl, False, False, 0)

        self.seed_entry = Gtk.Entry()
        self.seed_entry.set_placeholder_text("Random")
        opt_hbox.pack_start(self.seed_entry, False, False, 0)

        # -------------------------------------------------------------
        # Section 5: Status / Progress / Error Recovery Banner
        # -------------------------------------------------------------
        self.spinner = Gtk.Spinner()
        vbox.pack_start(self.spinner, False, False, 0)

        self.status_label = Gtk.Label(label="")
        self.status_label.set_xalign(0.5)
        self.status_label.set_line_wrap(True)
        vbox.pack_start(self.status_label, False, False, 0)

        # Buttons
        self.window.add_button("Cancel", Gtk.ResponseType.CANCEL)
        self.generate_btn = self.window.add_button("Generate Image", Gtk.ResponseType.OK)
        self.generate_btn.connect("clicked", self._on_generate_clicked)

        self.window.show_all()
        self.spinner.hide()

        # Load models at startup asynchronously
        self._load_models_async()

    def _update_auth_ui(self) -> None:
        if not HAS_GTK:
            return
        if self.token:
            auth_data = self.auth_manager.get_saved_auth_data() or {}
            userinfo = auth_data.get("userinfo") or {}
            username = userinfo.get("preferred_username") or userinfo.get("sub") or "Connected User"
            self.auth_status_label.set_markup(f"Connected: <b>{username}</b>")
            self.auth_btn.set_label("Disconnect")
        else:
            self.auth_status_label.set_text("Not connected (Public Mode)")
            self.auth_btn.set_label("Connect Account")

    def _on_auth_btn_clicked(self, button: Any) -> None:
        if self.token:
            # Disconnect
            self.auth_manager.disconnect()
            self.token = None
            self.api_client.set_token(None)
            self._update_auth_ui()
            self._load_models_async()
        else:
            # Start BYOP Device Flow
            self._start_device_flow()

    def _start_device_flow(self) -> None:
        """Starts BYOP device code flow and shows user code popup."""
        try:
            res = self.auth_manager.request_device_code()
            device_code = res["device_code"]
            user_code = res["user_code"]
            uri = res.get("verification_uri", "https://enter.pollinations.ai/device")

            # Open browser automatically
            try:
                webbrowser.open(uri)
            except Exception:
                pass

            # Show modal popup with User Code
            dialog = Gtk.Dialog(title="Connect Pollinations Account", parent=self.window, flags=Gtk.DialogFlags.MODAL)
            dialog.set_default_size(380, 220)
            box = dialog.get_content_area()
            box.set_spacing(10)
            box.set_border_width(12)

            info_lbl = Gtk.Label(label="Opening browser to authorize Pollinations...\nPlease enter or verify this code:")
            info_lbl.set_line_wrap(True)
            box.pack_start(info_lbl, False, False, 0)

            code_entry = Gtk.Entry()
            code_entry.set_text(user_code)
            code_entry.set_alignment(0.5)
            box.pack_start(code_entry, False, False, 0)

            poll_lbl = Gtk.Label(label="Polling for authorization...")
            box.pack_start(poll_lbl, False, False, 0)

            spinner = Gtk.Spinner()
            spinner.start()
            box.pack_start(spinner, False, False, 0)

            dialog.add_button("Cancel", Gtk.ResponseType.CANCEL)

            dialog.show_all()

            # Poll for token in background
            is_polling = [True]

            def poll_worker():
                start_time = time.time()
                while is_polling[0] and (time.time() - start_time < 300):
                    status, res_token, err_msg = self.auth_manager.poll_for_token(device_code)
                    if status == "success" and res_token:
                        token = res_token.get("access_token")
                        userinfo = self.auth_manager.fetch_userinfo(token)
                        self.auth_manager.save_token(token, userinfo)
                        self.token = token
                        self.api_client.set_token(token)

                        def on_success():
                            is_polling[0] = False
                            dialog.response(Gtk.ResponseType.OK)
                        GLib.idle_add(on_success)
                        break
                    elif status == "expired":
                        def on_expired():
                            is_polling[0] = False
                            poll_lbl.set_text("Authorization code expired or denied.")
                        GLib.idle_add(on_expired)
                        break
                    time.sleep(4)

            thread = threading.Thread(target=poll_worker, daemon=True)
            thread.start()

            res_type = dialog.run()
            is_polling[0] = False
            dialog.destroy()

            if res_type == Gtk.ResponseType.OK:
                self._update_auth_ui()
                self._load_models_async()

        except Exception as e:
            self._show_error_message(f"Device authorization failed: {str(e)}")

    def _load_models_async(self) -> None:
        if not HAS_GTK:
            return
        self.status_label.set_text("Loading available models...")
        self.spinner.show()
        self.spinner.start()

        def fetch_task():
            try:
                models = self.api_client.fetch_image_models()
                GLib.idle_add(self._on_models_loaded, models, None)
            except Exception as e:
                GLib.idle_add(self._on_models_loaded, [], str(e))

        threading.Thread(target=fetch_task, daemon=True).start()

    def _on_models_loaded(self, models: List[ModelInfo], error: Optional[str]) -> None:
        self.spinner.stop()
        self.spinner.hide()
        if error:
            self.status_label.set_text(f"Failed to load models: {error}")
            return

        self.models = models
        self.status_label.set_text(f"Loaded {len(models)} image models.")
        self.model_combo.remove_all()

        for idx, m in enumerate(models):
            label = f"{m.title} ({m.name})"
            if m.community:
                label += " [Community]"
            self.model_combo.append(m.name, label)

        if models:
            self.model_combo.set_active(0)

    def _on_model_changed(self, combo: Any) -> None:
        model_name = combo.get_active_id()
        if not model_name:
            return

        selected = next((m for m in self.models if m.name == model_name), None)
        self.selected_model = selected

        if not selected:
            return

        # Update description label
        desc = selected.description or f"Model: {selected.name}"
        if selected.pricing_label:
            desc += f" • Price: {selected.pricing_label}"
        self.model_desc_label.set_text(desc)

        # Update Aspect Ratios
        self.ar_combo.remove_all()
        for ar in selected.aspect_ratios:
            self.ar_combo.append(ar, ar)
        if selected.aspect_ratios:
            self.ar_combo.set_active(0)

        # Update Capabilities-driven input source controls
        if selected.supports_image_input:
            self.edit_frame.set_sensitive(True)
            self.capability_note.set_text("✓ Selected model supports image editing and reference images.")
        else:
            self.edit_frame.set_sensitive(False)
            self.edit_source_combo.set_active(0)  # Force Text-to-Image
            self.capability_note.set_text("ℹ Selected model is text-to-image only (image editing not supported).")

    def _on_generate_clicked(self, button: Any) -> None:
        prompt_buffer = self.prompt_textview.get_buffer()
        start, end = prompt_buffer.get_bounds()
        prompt = prompt_buffer.get_text(start, end, True).strip()

        if not prompt:
            self.status_label.set_text("Please enter a prompt before generating.")
            return

        if not self.selected_model:
            self.status_label.set_text("Please select a model.")
            return

        model_name = self.selected_model.name
        aspect_ratio = self.ar_combo.get_active_id() or "1:1"
        seed_str = self.seed_entry.get_text().strip()
        seed = int(seed_str) if seed_str.isdigit() else None

        edit_source = self.edit_source_combo.get_active_id()

        # Disable UI controls during generation
        self.window.set_sensitive(False)
        self.spinner.show()
        self.spinner.start()
        self.status_label.set_text("Generating image with Pollinations AI...")

        def gen_task():
            try:
                if edit_source in ("layer", "selection") and self.selected_model.supports_image_input:
                    input_bytes = export_drawable_or_selection_to_png_bytes(self.image, self.drawable)
                    result = self.api_client.edit_image(
                        image_bytes=input_bytes,
                        prompt=prompt,
                        model=model_name,
                        seed=seed,
                    )
                else:
                    result = self.api_client.generate_image(
                        prompt=prompt,
                        model=model_name,
                        aspect_ratio=aspect_ratio,
                        seed=seed,
                    )
                GLib.idle_add(self._on_gen_success, result)
            except PollinationsAuthError as e:
                GLib.idle_add(self._on_gen_error, str(e), "auth")
            except PollinationsPollenError as e:
                GLib.idle_add(self._on_gen_error, str(e), "pollen")
            except Exception as e:
                GLib.idle_add(self._on_gen_error, str(e), "general")

        threading.Thread(target=gen_task, daemon=True).start()

    def _on_gen_success(self, image_bytes: bytes) -> None:
        self.result_bytes = image_bytes
        self.spinner.stop()
        self.spinner.hide()
        self.window.set_sensitive(True)
        self.window.response(Gtk.ResponseType.OK)

    def _on_gen_error(self, err_msg: str, error_type: str) -> None:
        self.spinner.stop()
        self.spinner.hide()
        self.window.set_sensitive(True)

        if error_type == "auth":
            msg = f"<b>Authentication Error</b>\n{err_msg}\n\nPlease click <b>Connect</b> to log in to Pollinations."
        elif error_type == "pollen":
            msg = f"<b>Insufficient Pollen / Account Limit</b>\n{err_msg}"
        else:
            msg = f"<b>Generation Failed</b>\n{err_msg}"

        self.status_label.set_markup(msg)

    def _show_error_message(self, message: str) -> None:
        if HAS_GTK:
            dialog = Gtk.MessageDialog(
                transient_for=self.window,
                flags=0,
                message_type=Gtk.MessageType.ERROR,
                buttons=Gtk.ButtonsType.OK,
                text=message,
            )
            dialog.run()
            dialog.destroy()

    def run(self) -> Tuple[int, Optional[bytes]]:
        if not HAS_GTK:
            return -1, None
        response = self.window.run()
        self.window.destroy()
        return response, self.result_bytes
