"""Install into the plug-ins directory shown in GIMP Preferences > Folders."""
import argparse
from pathlib import Path
import shutil

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("directory", type=Path, help="GIMP's user plug-ins directory")
args = parser.parse_args()
destination = args.directory.expanduser().resolve() / "pollinations-gimp"
destination.mkdir(parents=True, exist_ok=True)
for name in ("pollinations-gimp.py", "pollinations_api.py", "token_store.py"):
    target = destination / name
    shutil.copyfile(Path(__file__).resolve().parent / name, target)
    target.chmod(0o755 if name == "pollinations-gimp.py" else 0o644)
print(f"Installed to {destination}. Restart GIMP to load Filters > Pollinations.")
