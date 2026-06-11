---
name: deploy-cloudflare-workers
description: Deploy any project to Cloudflare Workers + D1 on the free plan — one-time account setup, per-project setup (wrangler.jsonc, D1, secrets), day-to-day redeploys, and live verification. Use when asked to deploy a project to Cloudflare or Workers, put an app online for free, add a D1 database, or troubleshoot a wrangler deploy. Worked example: projects/blog-workers.
---

# Deploy a project to Cloudflare Workers + D1 (free plan)

One Cloudflare account hosts many projects. Each project is one **Worker**,
identified by the `"name"` in its `wrangler.jsonc`, and lives at
`https://<name>.<subdomain>.workers.dev`. The account-wide free budget:
100k requests/day (shared by all Workers), 100 Workers, 10 D1 databases
(500 MB each), 5M D1 row reads + 100k row writes/day (shared).

Everything below was executed and verified end-to-end on 2026-06-10 with
`projects/blog-workers` — copy that project as a template when starting a
new one. Always use the project-pinned wrangler via `npx wrangler` (never
install it globally).

## 0. What a project needs before it can deploy

- **`wrangler.jsonc`** with: `name` (unique in the account — becomes the
  URL prefix), `main` (the entry module), `compatibility_date`, optionally
  `assets: {"directory": "./public"}` for static files, and — if it uses a
  database — a `d1_databases` binding:

  ```jsonc
  "d1_databases": [
    { "binding": "DB", "database_name": "<db-name>", "database_id": "FILLED_IN_STEP_2" }
  ]
  ```

- **`package.json`** with `wrangler` as a devDependency.
- An entry module exporting a fetch handler (a Hono app works as-is).
- If it has a database: a `schema.sql` of idempotent
  `CREATE TABLE IF NOT EXISTS ...` statements (D1 speaks the SQLite dialect).
- Code must read secrets from env **at request time** with a dev fallback
  (e.g. `c.env.SECRET_KEY || "dev"`) — secrets can only be uploaded *after*
  the first deploy, so startup must not require them.

## 1. One-time per account

1. **Login** (browser OAuth — the only step needing a human click):

   ```bash
   npx wrangler login --browser=false   # prints a URL; open it, click Allow
   npx wrangler whoami                  # MUST show the intended account email
   ```

   Run login in the background, grep the URL from its output, and `open` it.
   The link expires after a few minutes — regenerate if it times out.

2. **Register the account's workers.dev subdomain** (all projects share it).
   Interactive `wrangler deploy` offers to do this, but prompts auto-answer
   "no" in non-TTY shells — register via API instead. The OAuth bearer token
   lives in `~/Library/Preferences/.wrangler/config/default.toml`:

   ```bash
   TOKEN=$(grep -m1 'oauth_token' "$HOME/Library/Preferences/.wrangler/config/default.toml" | sed 's/.*= *"//;s/"//')
   ACC=$(npx wrangler whoami 2>&1 | grep -o '[0-9a-f]\{32\}' | head -1)
   curl -s -X PUT "https://api.cloudflare.com/client/v4/accounts/$ACC/workers/subdomain" \
     -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
     --data '{"subdomain":"CHOOSE_A_NAME"}'
   ```

   Never print the token itself.

## 2. First deploy of a project

```bash
cd <project-dir>
npm install
```

If the project uses a database:

```bash
npx wrangler d1 create <db-name>        # prints a database_id
# paste the database_id into wrangler.jsonc (keep the binding name the code uses)
npx wrangler d1 execute <db-name> --remote --file=schema.sql -y
```

Deploy, then upload secrets (this order is mandatory):

```bash
npx wrangler deploy                     # prints https://<name>.<subdomain>.workers.dev
openssl rand -hex 32 | npx wrangler secret put SECRET_KEY   # repeat per secret
```

A hostname served for the first time can take ~1–2 minutes of DNS
propagation — `curl` returns code 000 until then. Wait 30s and retry
instead of debugging.

## 3. Day-to-day redeploy

```bash
npx wrangler deploy                     # bundles and goes live in seconds
```

If `schema.sql` changed, also run the `d1 execute ... --remote` line above.
(For destructive schema changes, write explicit `ALTER`/migration SQL —
`CREATE TABLE IF NOT EXISTS` won't modify existing tables.)

## 4. Verify the live site

Minimum for any project: home page returns 200 with real content, and one
**write path** works end-to-end. Check security headers if the app sets them.

```bash
B=https://<name>.<subdomain>.workers.dev
curl -s -o /dev/null -w "home: %{http_code}\n" $B/
curl -s -D - -o /dev/null $B/ | grep -i "content-security-policy\|x-frame-options"
```

For form apps with CSRF (like the blog), carry the token: fetch the page,
extract the `csrf_token` field into `$T`, then POST with
`-d "csrf_token=$T&..."` (forms) or `-H "X-CSRF-Token: $T"` (JSON APIs).
A complete worked checklist — signup 302 → login 302 → create 302 →
comment 201 → missing token 400 → unknown id 404 — is in
`projects/blog-workers/README.md` and its git history.

Tail production logs while testing: `npx wrangler tail <name>`.

## Gotchas learned the hard way

- **Non-TTY prompts auto-answer "no"** — any wrangler step that would
  prompt (subdomain registration, config rewriting, confirmations) must be
  done explicitly: API calls, `-y` flags, editing `wrangler.jsonc` yourself.
- **`wrangler secret put` before the first deploy fails** — deploy first.
- **Free-plan CPU is ~10 ms/request** — keep per-request crypto and hot
  loops modest. (The blog's PBKDF2 at 100k iterations is the known heavy
  path; if CPU errors (1102) ever appear, lower the iteration count.)
- **Quotas are account-wide** — one busy Worker eats the shared 100k
  requests/day. Fine for course projects; revisit if something gets popular.
- **One name = one Worker** — deploying with an existing `name` *replaces*
  that Worker. Pick a fresh name for a new project.
