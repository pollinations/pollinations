"""Clean local invoice archive files that are already marked not_invoice.

Default is a dry run:
    python3 -m ingest.invoices.cleanup_archive

Safer cleanup:
    python3 -m ingest.invoices.cleanup_archive --quarantine

Irreversible cleanup:
    python3 -m ingest.invoices.cleanup_archive --delete --yes
"""
import argparse
import hashlib
import os
import shutil

from ingest import creds as _creds, tb as _tb
from ingest.run import dedupe_invoices


def _sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _archive_pdfs(archive_dir):
    for root, dirs, names in os.walk(archive_dir):
        dirs[:] = [d for d in dirs if d not in {"inbox", "not-invoices"}]
        for name in names:
            if name.lower().endswith(".pdf"):
                yield os.path.join(root, name)


def _latest_invoice_rows(client):
    rows = client.sql(
        "SELECT sha256, status, provider, invoice_number, file_ref, source, "
        "ingested_at FROM invoices"
    )
    return {row["sha256"]: row for row in dedupe_invoices(rows)}


def _candidates(archive_dir, latest_by_sha):
    rows = []
    for path in _archive_pdfs(archive_dir):
        sha = _sha256(path)
        row = latest_by_sha.get(sha)
        if row and row.get("status") == "not_invoice":
            rows.append((path, sha, row))
    return rows


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Quarantine or delete local PDFs whose latest invoice row is not_invoice."
    )
    parser.add_argument("--quarantine", action="store_true",
                        help="Move files to <archive_dir>/not-invoices/.")
    parser.add_argument("--delete", action="store_true",
                        help="Delete files instead of printing a dry run.")
    parser.add_argument("--yes", action="store_true",
                        help="Required with --delete.")
    args = parser.parse_args(argv)

    if args.quarantine and args.delete:
        raise SystemExit("choose either --quarantine or --delete, not both")
    if args.delete and not args.yes:
        raise SystemExit("--delete requires --yes")

    config = _creds.load_config()
    secrets = _creds.load_creds()
    archive_dir = config["archive_dir"]
    client = _tb.TB(config["tb_ops_api"], secrets["TINYBIRD_OPS_INGEST_TOKEN"])
    candidates = _candidates(archive_dir, _latest_invoice_rows(client))

    if not candidates:
        print("No not_invoice PDFs found in archive.")
        return {"count": 0}

    quarantine_dir = os.path.join(archive_dir, "not-invoices")
    if args.quarantine:
        os.makedirs(quarantine_dir, exist_ok=True)

    for path, sha, row in candidates:
        rel = os.path.relpath(path, archive_dir)
        reason = row.get("invoice_number") or row.get("provider") or "not_invoice"
        if args.delete:
            os.remove(path)
            print(f"deleted {sha[:12]} {rel}  # {reason}")
        elif args.quarantine:
            target = os.path.join(quarantine_dir, rel.replace(os.sep, "__"))
            shutil.move(path, target)
            print(f"moved {sha[:12]} {rel} -> not-invoices/{os.path.basename(target)}  # {reason}")
        else:
            print(f"would remove {sha[:12]} {rel}  # {reason}")

    action = "deleted" if args.delete else "moved" if args.quarantine else "dry_run"
    print(f"{action}: {len(candidates)} not_invoice PDFs")
    return {"count": len(candidates), "action": action}


if __name__ == "__main__":
    main()
