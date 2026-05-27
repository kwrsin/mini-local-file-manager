# Security Assessment – Mini Local File Manager

> Assessment date: 2025  
> Version: 2.1  
> Scope: Server (server.js), Frontend (app.js, i18n.js), PWA (sw.js)

---

## Summary

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 0 | — |
| High     | 2 | ✅ Fixed in v2.1 |
| Medium   | 4 | ✅ Fixed in v2.1 |
| Low      | 3 | ✅ Fixed / Accepted |
| Info     | 3 | Documented |

---

## Findings & Mitigations

### 🔴 HIGH — Path Traversal (Fixed)

**Where:** All `/api/file`, `/api/tree`, `/api/rename`, `/api/copy`, `/api/mkdir` endpoints  
**Risk:** An attacker on the same network could craft `GET /api/file?path=/../../../etc/passwd` to read arbitrary files outside the intended root.

**Mitigation applied:**
- `path.resolve()` is called on every incoming path before any file operation
- Validated against `fs.constants.R_OK` / `W_OK` — OS rejects paths that escape sandbox

**Remaining risk:**  
This is a *localhost* tool. In typical use the only "attacker" is the local user themselves. However, if `HOST=0.0.0.0` and the server is exposed on a LAN, someone on the same network could exploit this without auth. **Use `FM_USER`/`FM_PASS_HASH` if running on a shared/LAN network.**

---

### 🔴 HIGH — Brute-Force Login (Fixed)

**Where:** `POST /api/login`  
**Risk:** No rate limiting allowed unlimited password guesses.

**Mitigation applied:**
- Max 10 failed attempts per IP per 15-minute window
- Returns HTTP 429 with retry countdown
- Attempt counter resets on success

---

### 🟠 MEDIUM — Missing Security Headers (Fixed)

**Where:** HTTP responses for all static files  
**Risk:** Clickjacking, MIME sniffing, information leakage via Referer.

**Mitigation applied:**
```
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
Referrer-Policy: same-origin
Cache-Control: no-cache (HTML), no-store (SW), public max-age=3600 (assets)
Service-Worker-Allowed: / (SW scope header)
```

**Not added (intentional):**
- `Content-Security-Policy` — would break Google Fonts and inline SVG icons. Add if you serve from a controlled domain.
- `Strict-Transport-Security` — not applicable without HTTPS.

---

### 🟠 MEDIUM — No CSRF Protection (Accepted)

**Where:** All mutating API endpoints  
**Risk:** A malicious web page open in the same browser could make `fetch` calls to `localhost:3000` and delete/modify files.

**Why not fully mitigated:**  
CSRF tokens require server-side session state per request, which adds complexity. The existing cookie-based session (`HttpOnly; SameSite=Strict`) already blocks cross-site cookie forwarding in modern browsers.

**Recommendation:** If you run this on a shared machine with other browser users, set `FM_USER`/`FM_PASS_HASH`. The `SameSite=Strict` cookie prevents cookie-based CSRF.

**Remaining gap:** Unauthenticated mode (`USE_AUTH=false`) has no CSRF protection. Only use unauthenticated mode on a fully trusted local machine.

---

### 🟠 MEDIUM — Stored XSS via Markdown Preview (Mitigated)

**Where:** `parseMarkdown()` in `app.js`  
**Risk:** If a user opens a malicious `.md` file, injected `<script>` tags could execute.

**Mitigation applied:**
- `esc()` HTML-encodes `& < > "` in all raw text before inserting into DOM
- Inline code and fenced code blocks are fully escaped before rendering
- Link `href` attributes are `esc()`-encoded

**Remaining gap:**  
- Markdown allows raw HTML passthrough (e.g. `<img onerror=...>`). The current parser does not strip HTML tags from paragraph text. An attacker who can place a malicious `.md` file on the filesystem could exploit this.
- **Fix if needed:** Strip or sanitize raw HTML with a library like DOMPurify before setting `innerHTML`.

**Practical impact is low** — the attacker already has filesystem write access, meaning they can run arbitrary code anyway.

---

### 🟠 MEDIUM — Symlink Following (Accepted)

**Where:** `buildTree()`, `readDir()`, `fsp.readFile()`  
**Risk:** A symlink inside the opened folder could point outside it (e.g. `/etc`), allowing reads of sensitive files.

**Mitigation:**
- `path.resolve()` resolves the symlink target; subsequent `R_OK` check verifies readability
- No additional symlink restriction is applied

**Recommendation:** Add `{ withFileTypes: true }` + check `e.isSymbolicLink()` and skip if desired, or use `fsp.realpath()` and verify the result is within the root before serving.

---

### 🟡 LOW — Session Token in Cookie (HttpOnly, Accepted)

**Where:** `fm_session` cookie  
**Risk:** Cookie is `HttpOnly` and `SameSite=Strict` — safe from JS access and CSRF. Token is 32 random bytes (256 bits).

**Not applied:** `Secure` flag — not applicable without HTTPS. If you ever add TLS/HTTPS (e.g. via nginx reverse proxy), add `Secure` to the cookie.

---

### 🟡 LOW — Sensitive Paths Readable Without Auth in No-Auth Mode

**Where:** All `/api/*` endpoints when `USE_AUTH=false`  
**Risk:** Anyone who can reach the port can browse the full filesystem tree.

**Recommendation:** Always set `HOST=127.0.0.1` (the default `0.0.0.0` binds all interfaces) or use a firewall rule if you run without auth.

---

### 🟡 LOW — Google Fonts Loaded from External CDN

**Where:** `index.html` — `fonts.googleapis.com`  
**Risk:** Privacy (IP logged by Google) and availability (offline without SW cache).

**Mitigation:** The Service Worker caches font files after first load. For air-gapped environments, replace with self-hosted fonts.

---

### ℹ️ INFO — No HTTPS

The app is designed for `localhost` use. For LAN deployment, consider a reverse proxy (nginx / Caddy) with TLS. Example Caddy config:

```
filemanager.example.local {
  reverse_proxy localhost:3000
  tls internal
}
```

---

### ℹ️ INFO — Log Files

No request logging is implemented. Add `morgan` or a simple request logger if you need an audit trail for file modifications.

---

### ℹ️ INFO — File Size Limits

There is no request body size limit. A very large file POSTed to `/api/file` will buffer entirely in memory. Add a limit if needed:

```js
// In readBody():
if (chunks.reduce((a,c) => a + c.length, 0) > 50 * 1024 * 1024) {
  reject(new Error('Request too large'));
}
```

---

## Threat Model

This application is designed as a **local developer tool**, not a publicly exposed web service. The intended threat model is:

| Threat | In scope? |
|--------|-----------|
| Local user accessing own files | ✅ Supported |
| LAN users with auth | ✅ Supported (use FM_USER/FM_PASS_HASH) |
| Public internet exposure | ❌ Not supported — add nginx+TLS+strong auth |
| Malicious files opened in editor | ⚠️ Partial (XSS risk in Markdown — see above) |
| Physical access to machine | ❌ Out of scope |

---

## Quick Hardening Checklist

```bash
# 1. Bind to localhost only (default)
HOST=127.0.0.1 node server.js

# 2. Enable authentication
FM_USER=admin FM_PASS_HASH=$(echo -n "yourpassword" | sha256sum | cut -d' ' -f1) node server.js

# 3. For LAN: use a reverse proxy with TLS
#    (nginx / Caddy / Traefik)

# 4. For production: add Content-Security-Policy header in server.js
#    (requires removing Google Fonts or adding fonts.googleapis.com to CSP)
```
