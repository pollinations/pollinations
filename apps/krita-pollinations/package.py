"""Build pollinations-krita.zip for Krita's Tools > Scripts > Import Python Plugin…"""
from pathlib import Path
import zipfile

source = Path(__file__).resolve().parent
destination = source / "pollinations-krita.zip"
with zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED) as archive:
    archive.write(source / "pollinations_krita.desktop", "pollinations_krita.desktop")
    for path in sorted((source / "pollinations_krita").rglob("*.py")):
        archive.write(path, str(path.relative_to(source)))
print(f"Wrote {destination}")
