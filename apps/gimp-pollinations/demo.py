"""
Reproducible end-to-end demo without GIMP — uses the same pollinations_api.py.

Requires Pollinations account. First run:
  python apps/gimp-pollinations/demo.py --prompt "a watercolor cat" --model turbo

It will do a BYOP device flow (or use POLLINATIONS_API_KEY env), list models,
generate an image and save to demo_output.png.
"""

import argparse
import os
import sys
import webbrowser
from pathlib import Path

import pollinations_api as api


def main():
    parser = argparse.ArgumentParser(description="Pollinations GIMP demo (no GIMP needed)")
    parser.add_argument("--prompt", default="a watercolor cat", help="Prompt")
    parser.add_argument("--model", default="turbo", help="Model id")
    parser.add_argument("--width", type=int, default=512)
    parser.add_argument("--height", type=int, default=512)
    args = parser.parse_args()

    # Use env key if present, otherwise do BYOP
    private_key = os.environ.get("POLLINATIONS_API_KEY") or os.environ.get("POLLINATIONS_PRIVATE_KEY")
    if not private_key:
        print("No POLLINATIONS_API_KEY found — starting BYOP device flow...")
        print(f"App key: {api.APP_KEY_PLACEHOLDER} (replace with your publishable key for attribution)")
        dc = api.request_device_code(api.APP_KEY_PLACEHOLDER)
        print(f"Go to {dc.verification_uri} and enter code: {dc.user_code}")
        try:
            webbrowser.open(dc.verification_uri_complete)
        except Exception:
            pass
        print("Polling for approval (5s interval, 5 min timeout)…")
        private_key = api.poll_for_token(dc.device_code, interval=dc.interval, timeout=dc.expires_in)
        print("Got private key — authorized.")

    print("Listing models…")
    models = api.list_image_models(private_key)
    print(f"Available models: {len(models)} — e.g. {', '.join(m.id for m in models[:3])}")
    # Check if requested model exists
    if not any(m.id == args.model for m in models):
        print(f"Model {args.model!r} not in list, using {models[0].id if models else args.model!r}")
        if models:
            args.model = models[0].id

    print(f"Generating '{args.prompt}' with {args.model} {args.width}x{args.height}…")
    png = api.generate_image(private_key, args.model, args.prompt, args.width, args.height)
    out = Path("demo_output.png")
    out.write_bytes(png)
    print(f"Wrote {out.resolve()} ({len(png)} bytes) — open it to verify.")


if __name__ == "__main__":
    main()
