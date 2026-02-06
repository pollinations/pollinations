"""Debug script to find the utils module conflict in Modal runtime."""
import sys
import os

os.chdir("/root/comfy/ComfyUI")
sys.path.insert(0, "/root/comfy/ComfyUI")

print("=== sys.path ===")
for i, p in enumerate(sys.path):
    print(f"  [{i}] {p}")

print("\n=== Scanning for utils.py and utils/ ===")
for p in sys.path:
    if not os.path.isdir(p):
        continue
    uf = os.path.join(p, "utils.py")
    ud = os.path.join(p, "utils")
    if os.path.isfile(uf):
        print(f"  FOUND utils.py FILE at: {uf}")
    if os.path.isdir(ud):
        has_init = os.path.isfile(os.path.join(ud, "__init__.py"))
        print(f"  FOUND utils/ DIR  at: {ud} (has __init__: {has_init})")

print("\n=== Also check /root/ for utils.py ===")
for f in os.listdir("/root/"):
    if "utils" in f.lower():
        print(f"  /root/{f}")

print("\n=== Also check /pkg/ ===")
if os.path.isdir("/pkg/"):
    for f in os.listdir("/pkg/"):
        if "utils" in f.lower():
            print(f"  /pkg/{f}")

print("\n=== Try import utils ===")
try:
    import utils
    print(f"  utils.__file__ = {getattr(utils, '__file__', 'N/A')}")
    print(f"  utils.__path__ = {getattr(utils, '__path__', 'N/A')}")
    print(f"  utils.__spec__ = {getattr(utils, '__spec__', 'N/A')}")
except Exception as e:
    print(f"  ERROR: {e}")

print("\n=== Try import server ===")
try:
    import server
    print(f"  server imported OK from {server.__file__}")
except Exception as e:
    print(f"  ERROR: {e}")
