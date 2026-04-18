#!/usr/bin/env python3
"""
Upload a `translate_book.py` JSON export to the admin `translations/import`
endpoint so production gets the pre-translated cache rows.

Usage:
  ADMIN_JWT=eyJ...  python scripts/seed_translations.py \\
      --file translations_1342_zh.json \\
      --api-url https://api.book-reader.railway.app/api

The admin JWT comes from signing in to the admin panel and copying the
Bearer token from a network request (or generating one via the auth
service). Keep it short-lived.
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Seed a translate_book JSON export into production.",
    )
    parser.add_argument(
        "--file", type=Path, required=True,
        help="Path to the JSON file produced by translate_book.py --output",
    )
    parser.add_argument(
        "--api-url", default=os.environ.get("BACKEND_URL"),
        help="Prod API base URL, e.g. https://api.book-reader.railway.app/api "
             "(or set BACKEND_URL env var)",
    )
    parser.add_argument(
        "--token", default=os.environ.get("ADMIN_JWT"),
        help="Admin Bearer JWT (or set ADMIN_JWT env var)",
    )
    parser.add_argument(
        "--chunk", type=int, default=50,
        help="Upload in chunks of N entries per request (default 50). "
             "Keeps request bodies under proxy limits for big books.",
    )
    return parser.parse_args(argv)


def main() -> int:
    args = _parse_args()
    if not args.api_url:
        print("ERROR: set --api-url or BACKEND_URL env var", file=sys.stderr)
        return 2
    if not args.token:
        print("ERROR: set --token or ADMIN_JWT env var", file=sys.stderr)
        return 2
    if not args.file.exists():
        print(f"ERROR: file not found: {args.file}", file=sys.stderr)
        return 2

    entries = json.loads(args.file.read_text())
    if not isinstance(entries, list) or not entries:
        print("ERROR: file is empty or not a JSON array", file=sys.stderr)
        return 2

    url = args.api_url.rstrip("/") + "/admin/translations/import"
    print(f"Uploading {len(entries)} entries to {url} in chunks of {args.chunk}")

    total_imported = 0
    for start in range(0, len(entries), args.chunk):
        chunk = entries[start:start + args.chunk]
        body = json.dumps({"entries": chunk}).encode()
        req = urllib.request.Request(
            url,
            data=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {args.token}",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                payload = json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            detail = e.read().decode()
            print(f"HTTP {e.code}: {detail}", file=sys.stderr)
            return 1
        except urllib.error.URLError as e:
            print(f"Network error: {e}", file=sys.stderr)
            return 1
        imported = payload.get("imported", 0)
        total_imported += imported
        print(
            f"  [{start + 1}-{start + len(chunk)}/{len(entries)}] "
            f"imported={imported}",
        )

    print(f"\nDone — {total_imported} rows imported into production.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
