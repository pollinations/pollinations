"""Install into Krita's pykrita folder (Settings > Manage Resources > Open Resource Folder)."""
import argparse
from pathlib import Path
import shutil

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("directory", type=Path, help="Krita's resource folder's pykrita subfolder")
args = parser.parse_args()
source = Path(__file__).resolve().parent
destination = args.directory.expanduser().resolve()
destination.mkdir(parents=True, exist_ok=True)
shutil.copyfile(source / "pollinations_krita.desktop", destination / "pollinations_krita.desktop")
shutil.copytree(source / "pollinations_krita", destination / "pollinations_krita",
                 ignore=shutil.ignore_patterns("__pycache__"), dirs_exist_ok=True)
print(f"Installed to {destination}. Restart Krita, then enable it in "
      "Settings > Configure Krita > Python Plugin Manager and restart again.")
