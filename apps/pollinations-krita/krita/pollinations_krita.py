# pollinations_krita.py — Native Krita plugin for Pollinations AI
#
# Creates a Docker panel with a web view that loads the krita.pollinations.ai
# web app. The panel also exposes Python slots for exporting the active Krita
# canvas to the web app for img2img editing and importing the result back.
#
# Installation:
#   Linux:  ~/.local/share/krita/pykrita/pollinations_krita/
#   macOS:  ~/Library/Application Support/Krita/pykrita/pollinations_krita/
#   Windows: %APPDATA%\krita\pykrita\pollinations_krita\
#
# Copy pollinations_krita.py and pollinations_krita.desktop into that folder,
# then restart Krita. Enable via Settings → Configure Krita → Python Plugin
# Manager.

from krita import *
from PyQt5.QtCore import QUrl
from PyQt5.QtWebEngineWidgets import QWebEngineView
from PyQt5.QtWidgets import (
    QLabel,
    QHBoxLayout,
    QVBoxLayout,
    QPushButton,
    QWidget,
)
from PyQt5.QtGui import QIcon
import os


class PollinationsDocker(DockWidget):
    """Docker panel hosting the Pollinations Krita web app + Python bridge."""

    APP_URL = "https://krita.pollinations.ai"

    def __init__(self):
        super().__init__("Pollinations AI", "pollinations_docker")
        self.setWindowTitle("Pollinations AI")
        self.setAllowedAreas(Qt.RightDockWidgetArea | Qt.LeftDockWidgetArea)

        # Root widget
        root = QWidget()
        layout = QVBoxLayout(root)

        # Toolbar
        toolbar = QHBoxLayout()
        self.exportBtn = QPushButton("Export Canvas →")
        self.importBtn = QPushButton("← Import Result")
        self.refreshBtn = QPushButton("Refresh")
        toolbar.addWidget(self.exportBtn)
        toolbar.addWidget(self.importBtn)
        toolbar.addStretch()
        toolbar.addWidget(self.refreshBtn)
        layout.addLayout(toolbar)

        # Web view
        self.webView = QWebEngineView()
        self.webView.setUrl(QUrl(self.APP_URL))
        layout.addWidget(self.webView)

        self.setWidget(root)

        # State
        self._exported_image_path = None

        # Wire buttons
        self.exportBtn.clicked.connect(self.export_canvas)
        self.importBtn.clicked.connect(self.import_result)
        self.refreshBtn.clicked.connect(self.refresh_app)

    # ── Actions ────────────────────────────────────────────────────────────────

    def export_canvas(self):
        """Export the active Krita layer to a temp PNG and send to the web app."""
        doc = Krita.instance().activeDocument()
        if not doc:
            self._show_message("No active document.")
            return

        node = doc.activeNode()
        if not node:
            self._show_message("No active layer.")
            return

        try:
            import tempfile
            import requests

            # Render the node to a temporary PNG
            tempdir = tempfile.gettempdir()
            filename = os.path.join(tempdir, "krita-export.png")

            # Merge visible nodes and save
            from krita import QImage, QSize

            size = node.size()
            img = QImage(size, QImage.Format_ARGB32_Premultiplied)
            node.render(img, node.bounds())

            from PyQt5.QtGui import QImageWriter
            if not QImageWriter.write(img, filename):
                self._show_message("Failed to export image.")
                return

            self._exported_image_path = filename

            # Upload to media.pollinations.ai and pass to web app
            api_key = Krita.instance().window().openDialog(
                None, "", "Enter your Pollen API key"
            )

            # Build a URL the web app can read
            upload_url = "https://media.pollinations.ai/upload"
            headers = {}
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"

            with open(filename, "rb") as f:
                files = {"file": ("krita-export.png", f, "image/png")}
                resp = requests.post(upload_url, headers=headers, files=files)
                if resp.status_code == 200:
                    result_url = resp.json().get("url", "")
                    self._show_message(f"Uploaded! Image ready for editing.")
                    # Pass to web app via URL fragment
                    self.webView.setUrl(QUrl(
                        f"{self.APP_URL}#editImage={result_url}"
                    ))
                else:
                    self._show_message(f"Upload failed: {resp.status_code}")
        except Exception as e:
            self._show_message(f"Error: {str(e)}")

    def import_result(self):
        """Import the last generated result from the web app into Krita."""
        doc = Krita.instance().activeDocument()
        if not doc:
            self._show_message("No active document.")
            return

        # The web app should have set the result URL in localStorage or
        # we can fetch it from the app's published state
        self._show_message("Import will open the web app. Click Download there, then use File → Import.")
        self.webView.setUrl(QUrl(self.APP_URL))

    def refresh_app(self):
        """Reload the web app."""
        self.webView.reload()
        self._show_message("Refreshed.")

    def _show_message(self, msg):
        """Show a temporary notification in Krita."""
        Krita.instance().showMessage(msg, 3000)


# ── Registration ─────────────────────────────────────────────────────────────

Krita.instance().addExtension(PollinationsDocker(), "PollinationsDocker")

# Also register as a Scripting Docker so it appears in the Docker menu
docker = PollinationsDocker()
docker.setWindowTitle("Pollinations AI")

# Register with Krita's Docker manager
docker_manager = Krita.instance().dockerManager
if docker_manager:
    docker_manager.addDocker(docker, "pollinations_docker", "Tools")
