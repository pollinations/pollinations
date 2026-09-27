"""Krita: Tools > Scripts > Pollinations. No dependencies beyond Krita's bundled PyQt5."""
import os
import threading
import webbrowser

from krita import Extension, Krita
from PyQt5.QtCore import QByteArray, Qt, QTimer
from PyQt5.QtWidgets import (
    QComboBox,
    QDialog,
    QDialogButtonBox,
    QLabel,
    QMessageBox,
    QPlainTextEdit,
    QProgressDialog,
    QVBoxLayout,
)

from .image_codec import png_to_pixels, pixels_to_png
from .pollinations_api import (
    ApiError,
    AuthError,
    Cancelled,
    begin_authorization,
    generate,
    load_models,
    poll_authorization,
)
from .token_store import TokenStore

APP_KEY_ENV = "POLLINATIONS_KRITA_APP_KEY"


def background(parent, label, task, cancellable=False):
    """Network runs on a worker thread; Krita/Qt calls stay on the main thread."""
    dialog = QProgressDialog(label, "Cancel" if cancellable else "", 0, 0, parent)
    dialog.setWindowTitle("Pollinations")
    dialog.setWindowModality(Qt.WindowModal)
    dialog.setMinimumDuration(0)
    dialog.setAutoClose(False)
    dialog.setAutoReset(False)
    if not cancellable:
        dialog.setCancelButton(None)
    cancel = threading.Event()
    result = []

    def worker():
        try:
            result.append((True, task(cancel)))
        except Exception as error:
            result.append((False, error))

    def poll():
        if result:
            timer.stop()
            dialog.close()

    timer = QTimer()
    timer.setInterval(100)
    timer.timeout.connect(poll)
    dialog.canceled.connect(cancel.set)
    threading.Thread(target=worker, daemon=True).start()
    timer.start()
    dialog.exec_()
    timer.stop()
    if not result:
        cancel.set()
        raise Cancelled("Cancelled.")
    success, value = result[0]
    if not success:
        raise value
    return value


def target_bounds(doc):
    selection = doc.selection()
    if selection is not None and selection.width() > 0 and selection.height() > 0:
        return selection.x(), selection.y(), selection.width(), selection.height()
    return 0, 0, doc.width(), doc.height()


def check_color_mode(doc):
    if doc.colorModel() != "RGBA" or doc.colorDepth() != "U8":
        raise ApiError("Convert the image to 8-bit RGBA first (Image > Convert Image Color Space).")


def export_source(node, bounds):
    x, y, width, height = bounds
    if width <= 0 or height <= 0:
        raise ApiError("The selection does not overlap the canvas.")
    try:
        return pixels_to_png(node.pixelData(x, y, width, height), width, height)
    except ValueError as error:
        raise ApiError(str(error)) from None


def insert_result(doc, data, bounds):
    x, y, width, height = bounds
    try:
        raw = png_to_pixels(data, width, height)
    except ValueError as error:
        raise ApiError(str(error)) from None
    node = doc.createNode("Pollinations result", "paintlayer")
    doc.rootNode().addChildNode(node, None)
    if not node.setPixelData(QByteArray(raw), x, y, width, height):
        raise ApiError("Could not write the generated pixels onto the new layer.")
    doc.setActiveNode(node)
    doc.refreshProjection()
    doc.waitForDone()


def generation_dialog(parent, models, editing):
    if editing:
        models = [m for m in models if "image" in m.get("input_modalities", [])]
    if not models:
        raise ApiError("No available models support image editing.")
    dialog = QDialog(parent)
    dialog.setWindowTitle("Edit with Pollinations" if editing else "Generate with Pollinations")
    dialog.resize(480, 320)
    layout = QVBoxLayout(dialog)
    layout.addWidget(QLabel("Model"))
    picker = QComboBox()
    for model in models:
        title = model.get("title") or model["name"]
        text = f"{title} ({model['name']})" + (" · Community" if model.get("community") else "")
        picker.addItem(text, model)
    layout.addWidget(picker)
    if editing:
        note = QLabel("The selection, or the whole active layer if nothing is selected, is sent for "
                       "editing. The result becomes a new layer; the source layer is not changed.")
        note.setWordWrap(True)
        layout.addWidget(note)
    layout.addWidget(QLabel("Prompt"))
    prompt = QPlainTextEdit()
    layout.addWidget(prompt)
    resolution_label = QLabel("Resolution")
    resolution = QComboBox()
    layout.addWidget(resolution_label)
    layout.addWidget(resolution)

    def refresh_resolutions():
        options = picker.currentData().get("resolutions", [])
        resolution.clear()
        resolution.addItem("Model default", None)
        for option in options:
            resolution.addItem(option, option)
        resolution_label.setVisible(bool(options))
        resolution.setVisible(bool(options))

    picker.currentIndexChanged.connect(refresh_resolutions)
    refresh_resolutions()
    buttons = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
    buttons.accepted.connect(dialog.accept)
    buttons.rejected.connect(dialog.reject)
    layout.addWidget(buttons)
    while dialog.exec_() == QDialog.Accepted:
        text = prompt.toPlainText().strip()
        if text:
            return picker.currentData(), text, resolution.currentData()
        prompt.setFocus()
    raise Cancelled("Cancelled.")


class PollinationsExtension(Extension):
    def __init__(self, parent):
        super().__init__(parent)

    def setup(self):
        pass

    def createActions(self, window):
        actions = [
            ("pollinations_connect", "Pollinations: Connect Account…", self.connect_account),
            ("pollinations_disconnect", "Pollinations: Disconnect Account", self.disconnect_account),
            ("pollinations_generate", "Pollinations: Generate Image…", self.generate_image),
            ("pollinations_edit", "Pollinations: Edit Layer or Selection…", self.edit_layer),
        ]
        for identifier, text, handler in actions:
            action = window.createAction(identifier, text, "tools/scripts")
            action.triggered.connect(lambda _checked=False, h=handler, w=window: h(w))

    def connect_account(self, window):
        parent = window.qwindow()
        store = TokenStore()
        try:
            app_key = os.environ.get(APP_KEY_ENV, "")
            code = background(parent, "Starting connection…", lambda _cancel: begin_authorization(app_key))
            webbrowser.open(code["approval_url"])
            label = f"Approve in your browser. Code: {code['user_code']}\n{code['approval_url']}"
            token = background(parent, label, lambda cancel: poll_authorization(code, cancel), cancellable=True)
            store.save(token)
            QMessageBox.information(parent, "Pollinations", "Connected. Authorization is saved privately for future sessions.")
        except Cancelled:
            pass
        except (ApiError, OSError) as error:
            QMessageBox.critical(parent, "Pollinations", str(error))

    def disconnect_account(self, window):
        TokenStore().clear()
        QMessageBox.information(window.qwindow(), "Pollinations",
                                 "Disconnected on this computer. To revoke it everywhere too, use the account's Keys page.")

    def generate_image(self, window):
        self._run(window, editing=False)

    def edit_layer(self, window):
        self._run(window, editing=True)

    def _run(self, window, editing):
        parent = window.qwindow()
        store = TokenStore()
        token = store.load()
        try:
            if not token:
                raise ApiError("Use Tools > Scripts > Pollinations: Connect Account first.")
            doc = Krita.instance().activeDocument()
            if doc is None:
                raise ApiError("Open a document first.")
            check_color_mode(doc)
            bounds = target_bounds(doc)
            source = None
            if editing:
                node = doc.activeNode()
                if node is None or node.type() != "paintlayer":
                    raise ApiError("Select a paint layer to edit.")
                source = export_source(node, bounds)
            models = background(parent, "Loading available image models…", lambda _cancel: load_models(token))
            model, prompt, resolution = generation_dialog(parent, models, editing)
            label = "Generating… This can take several minutes. Keep Krita open until it completes."
            data = background(parent, label, lambda _cancel: generate(token, model, prompt, resolution, source))
            insert_result(doc, data, bounds)
        except Cancelled:
            pass
        except (ApiError, OSError) as error:
            if isinstance(error, AuthError):
                store.clear()
            QMessageBox.critical(parent, "Pollinations", str(error))


Krita.instance().addExtension(PollinationsExtension(Krita.instance()))
