#!/usr/bin/env python3
"""Send a sample guardian invoice email (for design review).

Usage:
  cd backend
  python3 scripts/send_sample_invoice_email.py tai@taistu.com paid --force

DEV_MODE suppresses normal sends; pass --force to deliver anyway.

Each send uses a unique subject so Gmail does not collapse repeated samples in one thread.
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")

from invoice_send import send_sample_invoice_email  # noqa: E402


async def main() -> None:
    parser = argparse.ArgumentParser(description="Send sample invoice email via Resend")
    parser.add_argument("to", help="Recipient email address")
    parser.add_argument("kind", nargs="?", default="paid", choices=("due", "paid"))
    parser.add_argument(
        "--force",
        action="store_true",
        help="Send even when DEV_MODE=true (required for real delivery in dev)",
    )
    args = parser.parse_args()

    result = await send_sample_invoice_email(to=args.to, kind=args.kind, force=args.force)
    if result.get("suppressed"):
        print("DEV_MODE: email suppressed. Re-run with --force to deliver.")
        sys.exit(1)
    attach_note = "with PDF" if result.get("pdf_attached") else "HTML only (no sample PDF on disk)"
    print(f"Sent {args.kind} sample to {result['to']} ({attach_note}, id={result.get('email_id')})")


if __name__ == "__main__":
    asyncio.run(main())
