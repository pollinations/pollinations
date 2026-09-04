# Pollinations AI GIMP 3 Plug-in

A native GIMP 3.0+ Python plug-in that brings **Pollinations AI** image generation and image editing directly into GIMP, powered by individual user accounts via Bring Your Own Pollen (BYOP) device authorization.

---

## 🚀 Features

- **Bring Your Own Pollen (BYOP) Device Authorization (RFC 8628)**: Connect your Pollinations account seamlessly. The plug-in opens your default browser for quick approval—no API keys to copy and paste. Authorization persists securely across GIMP restarts.
- **Dynamic Model Catalog**: Loads live model capabilities and community models at runtime directly from `https://gen.pollinations.ai/image/models`. Model IDs are never hardcoded.
- **Text-to-Image Generation**: Generate new images from text prompts and automatically add them as new GIMP layers or new images.
- **Image Editing & Image-to-Image**: Send the active layer or current selection to image-capable models (e.g. `kontext`, `klein`, `gptimage-large`) for editing and style transfers.
- **Capabilities-Driven Controls**: Automatically presents options (such as image-to-image source picker or aspect ratios) based on what the selected model supports.
- **Non-Destructive**: Results are created on new layers; source layers and original image data are never overwritten.
- **Clear Error & Recovery Messages**: Provides actionable guidance for expired keys, low Pollen balance, network failures, and API errors.

---

## 💻 Installation Guidance

To install the plug-in, copy the plug-in folder so that the main executable script resides inside a directory of the exact same name:

### 🐧 Linux
Copy `apps/gimp-plugin` contents to `~/.config/GIMP/3.0/plug-ins/pollinations_gimp/`:

```bash
mkdir -p ~/.config/GIMP/3.0/plug-ins/pollinations_gimp
cp -r apps/gimp-plugin/* ~/.config/GIMP/3.0/plug-ins/pollinations_gimp/
chmod +x ~/.config/GIMP/3.0/plug-ins/pollinations_gimp/pollinations_gimp.py
```

### 🍎 macOS
Copy `apps/gimp-plugin` contents to `~/Library/Application Support/GIMP/3.0/plug-ins/pollinations_gimp/`:

```bash
mkdir -p "$HOME/Library/Application Support/GIMP/3.0/plug-ins/pollinations_gimp"
cp -r apps/gimp-plugin/* "$HOME/Library/Application Support/GIMP/3.0/plug-ins/pollinations_gimp/"
chmod +x "$HOME/Library/Application Support/GIMP/3.0/plug-ins/pollinations_gimp/pollinations_gimp.py"
```

### 🪟 Windows
Copy `apps/gimp-plugin` contents to `%APPDATA%\GIMP\3.0\plug-ins\pollinations_gimp\`:

```cmd
xcopy /E /I apps\gimp-plugin %APPDATA%\GIMP\3.0\plug-ins\pollinations_gimp
```

---

## 📖 How to Use inside GIMP 3

1. **Open GIMP 3.0+**.
2. Go to the top menu bar and select **Filters / Pollinations AI** or **Pollinations AI -> Pollinations AI Generator & Editor...**.
3. **Connect your Account**:
   - Click **Connect Account**.
   - Your default browser will open to `https://enter.pollinations.ai/device`.
   - Verify or enter the displayed 8-character code (e.g. `ABCD-1234`) and click **Approve**.
   - The plug-in detects your authorization automatically and displays your connected username.
4. **Generate an Image**:
   - Choose any model from the dropdown (e.g. `FLUX.1 Schnell`, `FLUX.2 Klein 4B`, `GPT Image 1.5`, or community models).
   - Enter your prompt, pick an aspect ratio or seed, and click **Generate Image**.
   - The generated image will be inserted as a new layer in GIMP.
5. **Edit an Image / Layer**:
   - Select an image editing model (e.g. `FLUX.1 Kontext Pro`).
   - Under **Input Source for Editing**, choose **Active Layer** or **Active Selection**.
   - Enter your edit prompt (e.g. *"Make the background sunset watercolor"*).
   - Click **Generate Image**. The edited result will appear on a new layer above your source layer.

---

## 🧪 Testing and Verification

Run the automated Python test suite locally using `pytest`:

```bash
PYTHONPATH=apps/gimp-plugin pytest apps/gimp-plugin/tests
```
