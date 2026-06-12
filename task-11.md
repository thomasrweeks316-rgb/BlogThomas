# task-11.md — Blog System Design

> A complete plan for the AI agent to follow, written the **Superpowers** way:
> brainstorm → plan (this file) → build with TDD → test → ship.
> Keep this file in your project root and update it as the design changes.
>
> **v2 (2026-06-10):** tightened every contract so different implementations
> can be graded the same way — exact status codes (Appendix A), API schemas
> (Appendix B), validation rules (Appendix C), security must-dos (Appendix D),
> and a new **Task 9: Polish the UI** with its checklist (Appendix E).

---

## 1. Overview
Build a small but complete personal **blog**. A signed-in user can write posts;
visitors can read posts, leave comments, and react (like / dislike). Finally,
put it online with Cloudflare so friends can visit.

## 2. Goals / Non-Goals
**Goals**
- A working blog that runs on one machine and can be shared publicly.
- Clean, readable code a beginner can follow.
- Safe sign-up / log-in (passwords are never stored as plain text, CSRF on every POST).
- **Looks good enough to share** — a clean, modern UI in light *and* dark themes (Appendix E).

**Non-Goals (keep it simple)**
- No payments, no admin dashboard, no multiple blogs per server.
- No fancy frontend framework required (plain HTML/CSS/JS is fine).
- No rate limiting / email verification (note them in the README as future work).

## 3. Requirements
### Functional  *(the parenthetical details are the grading contract)*
- **Accounts:** sign up, log in (**by username**, not email), log out.
  Usernames are unique **case-insensitively** ("Alice" = "alice").
- **Posts:** create, edit, delete (author only; everyone else gets **403**);
  each post has a title (≤ 200 chars) + body (≤ 20,000 chars).
- **Home page:** list posts **newest first** (tie-break by id — timestamps are
  second-granular!); each shows title, ~150-char word-truncated preview ending
  in `...`, author, date.
- **Post page:** full post + its comments (oldest first) + reaction counts.
- **Comments:** a logged-in user can add one via the JSON API (≤ 2,000 chars,
  text only); everyone can read them.
- **Reactions:** like / dislike a post — **one row per user per post**;
  clicking your current reaction **removes it** (toggle); clicking the other
  kind **switches**. Counts update without a page reload.
- **Search:** **case-insensitive substring** match on title OR body;
  `%`/`_`/`\` in the query are literals (escape them in LIKE!); empty query
  shows a prompt — never all posts; results newest first.
- **Theme:** light / dark toggle on every page; choice stored in
  **localStorage**; first visit follows the system preference.

### Non-Functional
- Passwords hashed (e.g. Werkzeug `generate_password_hash`) — never plain text.
- Every state-changing request carries a **CSRF token** (Appendix D).
- Pages work on a phone screen (360 px wide, no horizontal scroll).
- Loads fast enough for a live class demo.
- Every feature has at least one automated test; **Appendix A is the source
  of truth for expected status codes.**

## 4. Tech Stack
| Layer | Choice | Why |
|-------|--------|-----|
| Backend | **Python + Flask** | Simple, one language, great for beginners |
| Database | **SQLite** | Built in, just one file, no server to run |
| Templates | **Jinja2** (HTML) | Renders pages with your data |
| Frontend | HTML + CSS + a little JS | Theme toggle, small interactions |
| Tests | **pytest** | Fast, runs without a real server |
| Deploy | **Cloudflare Tunnel** | Free public URL for your local app |

*Optional later:* port to **Cloudflare Workers + D1** for free always-on
hosting (no computer needed) — see `projects/blog-workers` for a finished
example, and `skills/deploy-cloudflare-workers/` for the deploy runbook.

## 5. Architecture / Module Division
```
blog/
  app.py            # create the app, register routes, security headers
  db.py             # open SQLite (foreign_keys ON!), create tables
  models.py         # read/write users, posts, comments, reactions
  csrf.py           # session-token CSRF protection for every POST
  auth/             # sign up, log in, log out, sessions, hashing, validation
  posts/            # create / edit / delete / list / detail
  comments/         # add comments (JSON API)
  reactions/        # like / dislike (JSON API, one per user)
  search/           # find posts by text
  templates/        # base, index, post, login, signup, edit, search, _post_list
  static/           # style.css, theme.js, post.js
  tests/            # conftest + one file per feature (auth, posts, comments,
                    #   reactions, search, theme, csrf, app)
  task-11.md        # this design file
```

## 6. Database Schema
```
users
  id            INTEGER PK
  username      TEXT NOT NULL COLLATE NOCASE UNIQUE   -- case-insensitive!
  email         TEXT UNIQUE NOT NULL                  -- store lowercased
  password_hash TEXT NOT NULL
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP

posts
  id         INTEGER PK
  author_id  INTEGER NOT NULL REFERENCES users(id)
  title      TEXT NOT NULL
  body       TEXT NOT NULL
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  updated_at TEXT                                     -- set on edit

comments
  id         INTEGER PK
  post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE
  user_id    INTEGER NOT NULL REFERENCES users(id)
  body       TEXT NOT NULL
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP

reactions
  id       INTEGER PK
  post_id  INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE
  user_id  INTEGER NOT NULL REFERENCES users(id)
  kind     TEXT NOT NULL CHECK (kind IN ('like','dislike'))
  UNIQUE(post_id, user_id)        -- one reaction per user per post
```
⚠️ **Two traps the schema alone won't save you from:**
1. SQLite ignores `REFERENCES` unless every connection runs
   `PRAGMA foreign_keys = ON`. Do it in `get_db()` — otherwise deleting a
   post silently leaves orphan comments.
2. `CURRENT_TIMESTAMP` has **second** granularity. Two posts created in the
   same second tie — always `ORDER BY created_at DESC, id DESC`.

Sessions are handled by Flask's signed cookie (no table needed). Set
`HttpOnly` + `SameSite=Lax` always, `Secure` when serving over HTTPS.

## 7. Routes (Pages + API)
**Pages**
```
GET  /                 home: list posts
GET  /post/<id>        one post + comments + reactions
GET  /signup           sign-up form
POST /signup           create account
GET  /login            log-in form (keep ?next= in the form action!)
POST /login            start a session, redirect to safe ?next= or /
POST /logout           end the session
GET  /new              new-post form          (login required)
POST /new              save a new post        (login required)
GET  /edit/<id>        edit-post form         (author only)
POST /edit/<id>        save edits             (author only)
POST /delete/<id>      delete a post          (author only)
GET  /search?q=...     search results
```
**JSON API**
```
POST /api/post/<id>/comment   add a comment   (login required)
POST /api/post/<id>/react     like/dislike    (login required)
```
**→ Expected status code for every route and failure case: Appendix A.**
**→ Request/response JSON for the API: Appendix B.**

## 8. Task Breakdown (build in this order — one test first, then the code)
1. **Setup + DB + base page** — app starts, `GET /` returns 200, tables exist.
2. **Auth** — sign up, log in, log out; passwords hashed; CSRF on all POSTs;
   protected route redirects guests to `/login?next=...`.
3. **Posts CRUD** — author can create/edit/delete; others get 403; validation
   per Appendix C.
4. **Home list + post page** — newest first (id tie-break); preview truncated;
   post page shows the full body and an "edited" marker after edits.
5. **Comments** — JSON API per Appendix B; comments render on the post page.
6. **Reactions** — toggle semantics; one per user (DB-enforced); counts update
   in the page without reload.
7. **Search** — case-insensitive substring; wildcards escaped; empty query →
   prompt message.
8. **Light/Dark theme** — toggle on every page, remembered in localStorage,
   follows system preference on first visit.
9. **Polish the UI** — apply the Appendix E checklist. Styling must not
   change any id/class/route the tests and JS rely on; all tests still pass.
   Verify with screenshots in **both** themes at desktop and 360 px widths.
10. **Deploy** — Cloudflare tunnel gives a public URL that loads the home
    page. Read the safety box in §11 first.

## 9. Testing Plan
- Use **pytest** with Flask's test client (no real server needed); a fresh
  temp-file database per test (conftest fixture).
- For each task: **red** (write a failing test) → **green** (make it pass) →
  **refactor**.
- **Appendix A is the contract**: assert those exact status codes.
- Must-test edge cases: empty/over-length title, wrong password, duplicate
  username (different case!), comment while logged out, same-reaction toggle,
  search for `%`, POST without CSRF token (→ 400), `?next=//evil.com`
  (→ redirect to `/`, never off-site).
- Disable CSRF via test config for ordinary tests; keep one dedicated test
  file where it stays ON.

## 10. Definition of Done + Workflow
- A task is done when its tests pass **and** it's committed:
  `git add .` → `git commit -m "feat: add comments"` → `git push`.
  (Set up the GitHub remote when you start Task 1, not at the end.)
- Keep functions small, names clear, and comment any tricky part.
- Follow the Superpowers loop: **brainstorm → plan (this file) → build with
  review → test**.

## 11. Deploy (make it public)
```
cloudflared tunnel --url http://localhost:5001
```
Share the public URL it prints. Done!

> **⚠️ Safety box — read before tunneling:**
> - **Never** run `flask --debug` behind a public tunnel (the Werkzeug
>   debugger is remote code execution for anyone who finds the URL).
> - Set a real secret first: `export SECRET_KEY=$(python3 -c 'import
>   secrets; print(secrets.token_hex(32))')` — and `COOKIE_SECURE=1` so the
>   session cookie only travels over HTTPS.
> - macOS note: port **5000 is taken by AirPlay Receiver** — use 5001.

*Free always-on alternative (no computer needed):* port to Cloudflare
Workers + D1 — worked example in `projects/blog-workers`, runbook in
`skills/deploy-cloudflare-workers/SKILL.md`.

---

## Appendix A — Status-code contract (the grading table)

| Route | Success | Failure cases |
|---|---|---|
| `GET /` | 200 | — |
| `GET /post/<id>` | 200 | 404 unknown id |
| `GET /signup`, `GET /login` | 200 | — |
| `POST /signup` | 302 → `/login` | 400 invalid input **or** duplicate username/email (re-render with messages) |
| `POST /login` | 302 → safe `?next=` or `/` | 400 wrong username **or** password (same message for both) |
| `POST /logout` | 302 → `/` | — |
| `GET /new` | 200 | 302 → `/login?next=/new` when guest |
| `POST /new` | 302 → `/post/<id>` | 400 validation; 302 → login when guest |
| `GET/POST /edit/<id>` | 200 / 302 → detail | 302 guest; **403 non-author**; 404 unknown |
| `POST /delete/<id>` | 302 → `/` | 302 guest; 403 non-author; 404 unknown |
| `GET /search` | 200 (always, even empty q) | — |
| `POST /api/post/<id>/comment` | **201** | 400 empty/too long/not text; **401 guest (JSON)**; 404 no such post |
| `POST /api/post/<id>/react` | 200 | 400 bad kind; 401 guest; 404 no such post |
| any POST/PUT/PATCH/DELETE without a valid CSRF token | — | **400** (JSON body for `/api/*`, HTML otherwise). CSRF is checked **before** login, so a token-less guest API call is 400, not 401. |

## Appendix B — JSON API contract

Error shape everywhere: `{"ok": false, "error": "<human readable>"}`.

**`POST /api/post/<id>/comment`** — header `X-CSRF-Token` required.
```jsonc
// request
{ "body": "Nice post!" }
// 201 response
{ "ok": true, "comment": { "id": 1, "post_id": 1, "body": "Nice post!",
                           "created_at": "2026-06-10 18:26:05", "author": "alice" } }
```
Errors: 400 `"Comment cannot be empty."` / `"Comment must be text."` /
`"Comment must be at most 2000 characters."`, 401 `"Please log in first."`,
404 `"Post not found."`

**`POST /api/post/<id>/react`**
```jsonc
// request
{ "kind": "like" }            // or "dislike"
// 200 response — reaction is the user's resulting state, null = removed
{ "ok": true, "reaction": "like", "counts": { "like": 3, "dislike": 1 } }
```
Errors: 400 `"Reaction must be 'like' or 'dislike'."`, 401, 404 as above.

## Appendix C — Validation rules

| Field | Rule | Error message |
|---|---|---|
| username | `^[A-Za-z0-9_]{3,30}$`; unique (case-insensitive) | "Username must be 3-30 letters, digits, or underscores." / "That username is already taken." |
| email | `^[^@\s]+@[^@\s]+\.[^@\s]+$`; lowercased; unique | "Please enter a valid email address." / "That email is already registered." |
| password | ≥ 8 chars | "Password must be at least 8 characters." |
| title | non-empty after trim; ≤ 200 | "Title cannot be empty." / "Title must be at most 200 characters." |
| body | non-empty after trim; ≤ 20,000 | "Body cannot be empty." / "Body must be at most 20000 characters." |
| comment | text only; non-empty after trim; ≤ 2,000 | see Appendix B |
| search q | trimmed; first 100 chars used | — |

Validate on the server (the client `required`/`maxlength` attributes are
convenience, not security). Catch the DB's UNIQUE violation as a backstop —
two signups can race past the friendly checks.

## Appendix D — Security must-dos

1. `PRAGMA foreign_keys = ON` on **every** SQLite connection.
2. Hash passwords (Werkzeug). Never log or return the hash.
3. **CSRF**: random token in the session; hidden `csrf_token` field in every
   form, `X-CSRF-Token` header on every API call; compare timing-safely;
   reject with 400.
4. `SECRET_KEY` from the environment in anything public; `"dev"` fallback is
   for localhost only. Cookie flags: `HttpOnly`, `SameSite=Lax`, `Secure`
   over HTTPS.
5. XSS: rely on Jinja autoescape (no `|safe` on user content); in JS use
   `textContent`, never `innerHTML`.
6. Open redirect: only follow `?next=` if it starts with `/`, doesn't start
   with `//`, and contains no `\` (browsers treat `/\evil.com` as
   `//evil.com`).
7. Response headers on every page: `Content-Security-Policy: default-src
   'self'` (means **no inline event handlers** — wire confirms in JS),
   `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`.
8. Parameterized SQL only; escape `%`/`_`/`\` inside LIKE patterns.

## Appendix E — UI polish checklist (Task 9)

A reader should *want* to stay. Concretely:

- [ ] Readable column: content max-width ≈ 720 px, generous whitespace.
- [ ] Sticky, slightly translucent header (backdrop blur) with the nav.
- [ ] Post cards: rounded corners (≥ 10 px), subtle shadow, gentle lift on
      hover.
- [ ] One accent color used consistently: links, primary buttons, active
      reaction, focus rings.
- [ ] Reactions as pill buttons; the active one clearly highlighted.
- [ ] Visible `:focus-visible` rings on **all** interactive elements
      (keyboard users exist).
- [ ] Both themes look intentional: AA-ish contrast, smooth ~0.2 s color
      transitions, `prefers-reduced-motion` respected.
- [ ] Forms: clear labels, accent focus ring, errors in the danger color,
      hints in muted color.
- [ ] Styled empty states ("No posts yet" should not look like a bug).
- [ ] 360 px wide phone: nothing overflows, tap targets comfortable.
- [ ] **Constraint:** visual changes only — same ids/classes/markup, all
      existing tests still green.
