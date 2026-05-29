#!/usr/bin/env node
/**
 * Mini Local File Manager – server.js  v2.3
 *
 * Usage:
 *   node server.js [port] [-conf=./conf.json]
 *   PORT=4000 node server.js
 *   FM_USER=admin FM_PASS_HASH=<sha256> node server.js
 *
 * conf.json (supports // line comments):
 *   {
 *     "port": 3003,            // optional; overridden by CLI port or PORT env
 *     "access": [
 *       { "deny":  "/*" },                                   // implicit default; can be omitted
 *       { "allow": "/users/userA/documents/*" },
 *       { "allow": "/users/userA/downloads/*" },
 *       { "deny":  "/users/userA/documents/secrets/*" }
 *     ]
 *   }
 *
 * Rule semantics (first-match wins):
 *   "/*"        → all paths under / (i.e. everything) - recursive
 *   "/foo/*"    → /foo and everything under it - recursive
 *   "/foo/**"   → same as /foo/*
 *   "/foo"      → exact match of /foo only
 *   If no rule matches a path → DENY (default-deny when conf is active)
 */
'use strict';

const http   = require('http');
const { execFile, exec } = require('child_process');
const fs     = require('fs');
const fsp    = fs.promises;
const path   = require('path');
const os     = require('os');
const url    = require('url');
const crypto = require('crypto');

// ── Optional deps ─────────────────────────────────────────────
let WebSocketServer = null;
try { WebSocketServer = require('ws').WebSocketServer; } catch(e) {}
let chokidar = null;
try { chokidar = require('chokidar'); } catch(e) {}
let mdns = null;
try { mdns = require('mdns'); } catch(e) {}

// ══════════════════════════════════════════════════════════════
//  ARGUMENT PARSING
//  node server.js [port] [-conf=PATH]
// ══════════════════════════════════════════════════════════════
const _args     = process.argv.slice(2);
let   _portArg  = null;
let   _confArg  = null;

for (const arg of _args) {
  if (/^-conf=/.test(arg)) {
    _confArg = arg.slice('-conf='.length).trim();
  } else if (/^\d+$/.test(arg)) {
    _portArg = arg;
  }
}

// ══════════════════════════════════════════════════════════════
//  CONF.JSON LOADER
//  Supports // line comments (JSON5-like subset)
// ══════════════════════════════════════════════════════════════

/**
 * Strip // line comments from a JSON string so JSON.parse can handle it.
 * Skips // inside string literals.
 */
function stripLineComments(src) {
  let result = '';
  let i = 0;
  while (i < src.length) {
    // Inside a string
    if (src[i] === '"') {
      result += src[i++];
      while (i < src.length) {
        if (src[i] === '\\') { result += src[i++]; result += src[i++]; continue; }
        result += src[i];
        if (src[i++] === '"') break;
      }
      continue;
    }
    // Line comment
    if (src[i] === '/' && src[i+1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    result += src[i++];
  }
  return result;
}

/**
 * Parse conf.json.
 * Fatal errors  → print warning and process.exit(1)
 * Per-rule errors → print warning and skip the rule
 * Returns: { port: number|null, rules: AccessRule[] }
 */
function loadConf(confPath) {
  const abs = path.resolve(confPath);

  // ── Read file ─────────────────────────────────────────────
  let raw;
  try {
    raw = fs.readFileSync(abs, 'utf8');
  } catch (e) {
    console.error(`\n[ERROR] Cannot read conf file: ${abs}`);
    console.error(`        ${e.message}`);
    console.error('        Exiting.\n');
    process.exit(1);
  }

  // ── Strip comments and parse JSON ─────────────────────────
  let conf;
  try {
    conf = JSON.parse(stripLineComments(raw));
  } catch (e) {
    console.error(`\n[ERROR] conf.json parse error: ${abs}`);
    console.error(`        ${e.message}`);
    console.error('        Exiting.\n');
    process.exit(1);
  }

  // ── conf.json must be an object ───────────────────────────
  if (!conf || typeof conf !== 'object' || Array.isArray(conf)) {
    console.error(`\n[ERROR] conf.json root must be an object: ${abs}`);
    console.error('        Exiting.\n');
    process.exit(1);
  }

  // ── "access" key: optional — if absent, access control is disabled ─
  if (!('access' in conf)) {
    // No access array → disable access control (all paths allowed)
    console.log('  [conf] No "access" key found — access control disabled.');
    return { port: parseConfPort(conf), rules: null };
  }

  if (!Array.isArray(conf.access)) {
    console.error(`\n[ERROR] conf.json "access" must be an array: ${abs}`);
    console.error('        Exiting.\n');
    process.exit(1);
  }

  if (conf.access.length === 0) {
    console.warn('[WARN]  conf.json "access" array is empty — all paths will be denied.');
  }

  // ── Validate and resolve each rule ───────────────────────
  const rules = [];
  for (let i = 0; i < conf.access.length; i++) {
    const entry = conf.access[i];
    if (!entry || typeof entry !== 'object') {
      console.warn(`[WARN]  conf access[${i}]: not an object — skipping.`);
      continue;
    }

    let type, rawPattern;
    if (typeof entry.allow === 'string') {
      type = 'allow'; rawPattern = entry.allow.trim();
    } else if (typeof entry.deny === 'string') {
      type = 'deny';  rawPattern = entry.deny.trim();
    } else {
      console.warn(`[WARN]  conf access[${i}]: must have "allow" or "deny" string — skipping.`);
      continue;
    }

    if (!rawPattern) {
      console.warn(`[WARN]  conf access[${i}]: empty pattern — skipping.`);
      continue;
    }

    // Resolve the pattern to an absolute path pattern
    const resolvedPattern = buildResolvedPattern(rawPattern);

    // Extract the base (without wildcard) for ancestor checks
    const resolvedBase = (() => { let b = resolvedPattern.split(path.sep+'*')[0].split('/*')[0]; return b || '/'; })();

    // Check the base path exists — skip root wildcard (/* or /**)
    const isRootWildcard = (rawPattern.trim() === '/*' || rawPattern.trim() === '/**');
    if (!isRootWildcard) {
      try {
        fs.accessSync(resolvedBase, fs.constants.R_OK);
      } catch (e) {
        console.warn(`[WARN]  conf access[${i}]: path not found: "${rawPattern}" — skipping.`);
        continue;
      }
    }

    rules.push({ type, pattern: resolvedPattern, base: resolvedBase, rawPattern });
    console.log(`  [conf] ${type.toUpperCase().padEnd(5)} ${resolvedPattern}`);
  }

  return { port: parseConfPort(conf), rules };
}

/** Parse optional port from conf object */
function parseConfPort(conf) {
  if (conf && typeof conf.port === 'number' && Number.isInteger(conf.port) &&
      conf.port > 0 && conf.port <= 65535) {
    return conf.port;
  }
  return null;
}

/**
 * Compute the base path of a pattern (strip wildcard suffix).
 */
function patternBase(rawPattern) {
  const p = rawPattern.replace(/\\/g, '/').trim();
  if (p.endsWith('/**')) return p.slice(0, -3) || '/';
  if (p.endsWith('/*'))  return p.slice(0, -2) || '/';
  return p;
}

/**
 * Build a resolved (absolute) pattern string from a raw conf pattern.
 *   e.g. "/users/foo/*"  → "/users/foo/*"  (already absolute)
 *        "relative/path/*" → "/cwd/relative/path/*"
 */
function buildResolvedPattern(rawPattern) {
  const p = rawPattern.replace(/\\/g, '/').trim();
  // Detect wildcard suffix
  let wc = '';
  let base = p;
  if (p.endsWith('/**')) { wc = '/**'; base = p.slice(0, -3); }
  else if (p.endsWith('/*')) { wc = '/*'; base = p.slice(0, -2); }

  // Resolve base to absolute
  const resolvedBase = (base === '' || base === '/' || base === '\\')
    ? (process.platform === 'win32' ? '' : '/')
    : path.resolve(base);

  if (!wc) return resolvedBase;
  return resolvedBase.replace(/[/\\]+$/, '') + path.sep + '*';
}

/**
 * Glob matcher – matches targetPath against a resolved pattern.
 *   /base/*  or /base/**  → /base itself and all descendants (recursive)
 *   /base                 → exact match only
 *   /*  (base='/')        → everything
 */
function matchesPattern(targetPath, resolvedPattern) {
  const t = path.resolve(targetPath).replace(/\\/g, '/');
  const p = resolvedPattern.replace(/\\/g, '/');

  if (p.endsWith('/*') || p.endsWith('/**')) {
    const base = p.replace(/\/\*+$/, '');   // strip /* or /**
    if (base === '' || base === '.') return true;  // root wildcard → match all
    return t === base || t.startsWith(base + '/');
  }
  return t === p;
}

/**
 * Find the best-matching rule for a given path using LONGEST-BASE-MATCH.
 *
 * Why longest-match instead of first-match:
 *   The conf.json example places deny/* first, then allow rules.
 *   With pure first-match, deny/* would block everything.
 *   Longest-match ensures the most specific rule always wins, which is
 *   the only interpretation that makes the spec example work correctly.
 *
 * @returns {{ allowed: boolean, rule?: object, reason: string }}
 */
function findBestRule(targetPath) {
  if (!USE_ACCESS_CONTROL) return { allowed: true, reason: 'no access control' };

  const t = path.resolve(targetPath);
  let best = null;   // { rule, baseLen }

  for (const rule of ACCESS_RULES) {
    if (!matchesPattern(t, rule.pattern)) continue;
    const blen = rule.base.length;
    if (best === null || blen > best.baseLen) {
      best = { rule, baseLen: blen };
    }
  }

  if (best) {
    return {
      allowed: best.rule.type === 'allow',
      rule: best.rule,
      reason: best.rule.type.toUpperCase() + ' ' + best.rule.rawPattern,
    };
  }
  return { allowed: false, reason: 'default deny (no rule matched)' };
}

/** Check access for a file or directory. */
function checkAccess(targetPath) {
  return findBestRule(targetPath);
}

/**
 * Check access for a directory path.
 *
 * In addition to normal rule matching, also allow directories that are
 * strict ancestors of an allow rule's base — so the user can navigate
 * into them to reach the allowed subtree.
 *
 * Ancestor promotion is suppressed if the best matching rule is a deny
 * rule whose base is equal to or deeper than this directory.
 */
function checkDirAccess(dirPath) {
  if (!USE_ACCESS_CONTROL) return { allowed: true, reason: 'no access control' };

  const result = findBestRule(dirPath);
  if (result.allowed) return result;

  // Not allowed by rules — check ancestor promotion
  const resolved = path.resolve(dirPath).replace(/\\/g, '/');
  for (const rule of ACCESS_RULES) {
    if (rule.type === 'allow') {
      const rb = rule.base.replace(/\\/g, '/');
      if (rb.startsWith(resolved + '/')) {
        return { allowed: true, ancestor: true, reason: 'ancestor of: ' + rule.rawPattern };
      }
    }
  }
  return result;
}

// ── State variables ───────────────────────────────────────────
let USE_ACCESS_CONTROL = false;
let ACCESS_RULES = [];  // [{ type, pattern, base, wildcard, rawPattern }]
let CONF_PORT    = null;

// ── Initialize conf ───────────────────────────────────────────
if (_confArg) {
  console.log(`\n[conf] Loading: ${path.resolve(_confArg)}`);
  const { port, rules } = loadConf(_confArg);
  CONF_PORT = port;
  if (rules === null) {
    // access key absent → access control disabled
    USE_ACCESS_CONTROL = false;
    ACCESS_RULES = [];
  } else {
    USE_ACCESS_CONTROL = true;
    ACCESS_RULES = rules;
    console.log(`[conf] ${ACCESS_RULES.length} rule(s) loaded. Default: DENY`);
  }
  if (CONF_PORT) console.log(`[conf] port from conf: ${CONF_PORT}`);
  console.log('');
}

// ── Port resolution (priority: CLI arg > PORT env > conf.json > 3000) ─
const PORT = parseInt(_portArg || process.env.PORT || CONF_PORT || 3000, 10);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC   = path.join(__dirname, 'public');
const APP_NAME = 'mini-local-file-manager';

// Auth config
const AUTH_USER  = process.env.FM_USER || '';
const AUTH_HASH  = process.env.FM_PASS_HASH || '';
const USE_AUTH   = !!(AUTH_USER && AUTH_HASH);
const sessions   = new Map();
const SESSION_TTL = 8 * 60 * 60 * 1000;

// ── MIME types ────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.jpg':  'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.pdf':  'application/pdf',
  '.woff2':'font/woff2', '.woff':'font/woff', '.ttf':'font/ttf',
  '.txt':  'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

const MIME_BY_EXT = {
  html:'text/html; charset=utf-8', htm:'text/html; charset=utf-8',
  css:'text/css; charset=utf-8',   js:'application/javascript; charset=utf-8',
  json:'application/json',          xml:'application/xml',
  png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg',
  gif:'image/gif', webp:'image/webp', svg:'image/svg+xml',
  pdf:'application/pdf',  ico:'image/x-icon',
  txt:'text/plain; charset=utf-8', md:'text/plain; charset=utf-8',
};

const TEXT_EXTS = new Set([
  'md','txt','html','htm','css','js','mjs','cjs','ts','tsx','jsx',
  'json','xml','yaml','yml','csv','log','ini','cfg','toml',
  'sh','bash','zsh','fish','bat','cmd','ps1',
  'py','rb','java','c','cpp','cc','h','hpp','cs','go','rs','php','swift',
  'sql','graphql','vue','svelte','astro','env','gitignore','dockerfile',
]);
function isTextFile(name) {
  const ext = name.split('.').pop().toLowerCase();
  return TEXT_EXTS.has(ext) ||
    ['makefile','dockerfile','readme','license','changelog'].includes(name.toLowerCase());
}

// ── Auth helpers ──────────────────────────────────────────────
function sha256(s)  { return crypto.createHash('sha256').update(s).digest('hex'); }
function newToken() { return crypto.randomBytes(32).toString('hex'); }

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(c => {
    const [k, ...v] = c.trim().split('=');
    if (k) out[k.trim()] = decodeURIComponent(v.join('='));
  });
  return out;
}
function checkToken(req) {
  if (!USE_AUTH) return true;
  const tok  = parseCookies(req)['fm_session'];
  if (!tok) return false;
  const sess = sessions.get(tok);
  if (!sess || Date.now() > sess.expires) { sessions.delete(tok); return false; }
  sess.expires = Date.now() + SESSION_TTL;
  return true;
}

// ── Login rate limiter ────────────────────────────────────────
const loginAttempts = new Map();
const MAX_LOGIN_TRIES = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

function getClientIP(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
    .split(',')[0].trim();
}

// ══════════════════════════════════════════════════════════════
//  HTTP SERVER
// ══════════════════════════════════════════════════════════════
const server = http.createServer(async (req, res) => {
  const parsed   = url.parse(req.url, true);
  const pathname = decodeURIComponent(parsed.pathname);

  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Auth endpoints (no access-control check on these)
  if (pathname === '/api/login'       && req.method === 'POST') return handleLogin(req, res);
  if (pathname === '/api/logout'      && req.method === 'POST') return handleLogout(req, res);
  if (pathname === '/api/auth-status' && req.method === 'GET')
    return sendJSON(res, 200, { useAuth: USE_AUTH, ok: checkToken(req) });

  // All other API
  if (pathname.startsWith('/api/')) {
    if (USE_AUTH && !checkToken(req)) return sendJSON(res, 401, { error: 'Unauthorized' });
    return handleAPI(req, res, pathname, parsed.query);
  }

  // Static files
  let fp = pathname === '/' ? '/index.html' : pathname;
  fp = path.join(PUBLIC, fp.replace(/\.\./g, ''));
  try {
    const st = await fsp.stat(fp);
    if (!st.isFile()) return send404(res);
    const ext  = path.extname(fp).toLowerCase();
    const bn   = path.basename(fp);
    let mime   = MIME[ext] || 'application/octet-stream';
    if (bn === 'manifest.json') mime = 'application/manifest+json';
    const isSW = bn === 'sw.js';
    res.writeHead(200, {
      'Content-Type':          mime,
      'X-Content-Type-Options':'nosniff',
      'X-Frame-Options':       'SAMEORIGIN',
      'Referrer-Policy':       'same-origin',
      'Cache-Control':         isSW ? 'no-cache, no-store, must-revalidate'
                             : ext === '.html' ? 'no-cache'
                             : 'public, max-age=3600',
      ...(isSW ? { 'Service-Worker-Allowed': '/' } : {}),
    });
    fs.createReadStream(fp).pipe(res);
  } catch(e) { send404(res); }
});

function send404(res)  { res.writeHead(404); res.end('404 Not Found'); }
function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}
function sendDenied(res) {
  sendJSON(res, 403, { error: 'Access denied by access control policy.' });
}
async function readBody(req) {
  return new Promise((resolve, reject) => {
    const c = [];
    req.on('data', d => c.push(d));
    req.on('end',  () => resolve(Buffer.concat(c).toString('utf8')));
    req.on('error', reject);
  });
}
async function readBodyBuffer(req) {
  return new Promise((resolve, reject) => {
    const c = [];
    req.on('data', d => c.push(d));
    req.on('end',  () => resolve(Buffer.concat(c)));
    req.on('error', reject);
  });
}

/**
 * Parse multipart/form-data body.
 * Returns array of { filename, contentType, data:Buffer }
 */
function parseMultipart(buf, boundary) {
  const boundaryBuf = Buffer.from('--' + boundary);
  const nl = Buffer.from('\r\n');
  const files = [];
  let pos = 0;

  while (pos < buf.length) {
    const bStart = buf.indexOf(boundaryBuf, pos);
    if (bStart === -1) break;
    pos = bStart + boundaryBuf.length;
    if (buf[pos] === 0x2D && buf[pos+1] === 0x2D) break; // --boundary--

    // Skip \r\n after boundary
    if (buf[pos] === 0x0D) pos += 2;

    // Parse headers until double \r\n
    const headerEnd = buf.indexOf(Buffer.from('\r\n\r\n'), pos);
    if (headerEnd === -1) break;
    const headerStr = buf.slice(pos, headerEnd).toString('utf8');
    pos = headerEnd + 4;

    // Extract filename from Content-Disposition
    const cdMatch = headerStr.match(/Content-Disposition:[^\r\n]*filename="([^"]+)"/i);
    const ctMatch = headerStr.match(/Content-Type:\s*([^\r\n]+)/i);
    if (!cdMatch) continue;
    const filename    = cdMatch[1];
    const contentType = ctMatch ? ctMatch[1].trim() : 'application/octet-stream';

    // Data runs until next boundary
    const nextBoundary = buf.indexOf(boundaryBuf, pos);
    const dataEnd = nextBoundary === -1 ? buf.length : nextBoundary - 2; // strip trailing \r\n
    const data = buf.slice(pos, dataEnd);
    files.push({ filename, contentType, data });
    pos = nextBoundary;
  }
  return files;
}


// ── Login / Logout ────────────────────────────────────────────
async function handleLogin(req, res) {
  try {
    const ip  = getClientIP(req);
    const now = Date.now();
    const att = loginAttempts.get(ip) || { count: 0, firstAt: now };
    if (now - att.firstAt > LOGIN_WINDOW_MS) { att.count = 0; att.firstAt = now; }
    if (att.count >= MAX_LOGIN_TRIES) {
      const wait = Math.ceil((LOGIN_WINDOW_MS - (now - att.firstAt)) / 60000);
      return sendJSON(res, 429, { error: `Too many attempts. Try again in ${wait} min.` });
    }
    const body  = JSON.parse(await readBody(req));
    if (!USE_AUTH) return sendJSON(res, 200, { ok: true });
    const valid = body.user === AUTH_USER && sha256(body.pass) === AUTH_HASH;
    if (!valid) {
      att.count++; loginAttempts.set(ip, att);
      return sendJSON(res, 401, { error: 'Invalid credentials' });
    }
    loginAttempts.delete(ip);
    const tok = newToken();
    sessions.set(tok, { user: AUTH_USER, expires: Date.now() + SESSION_TTL });
    res.setHeader('Set-Cookie', `fm_session=${tok}; Path=/; HttpOnly; SameSite=Strict`);
    sendJSON(res, 200, { ok: true });
  } catch(e) { sendJSON(res, 500, { error: e.message }); }
}
function handleLogout(req, res) {
  const tok = parseCookies(req)['fm_session'];
  if (tok) sessions.delete(tok);
  res.setHeader('Set-Cookie', 'fm_session=; Path=/; Max-Age=0');
  sendJSON(res, 200, { ok: true });
}

// ══════════════════════════════════════════════════════════════
//  API HANDLER
// ══════════════════════════════════════════════════════════════
async function handleAPI(req, res, pathname, query) {
  const m = req.method;

  // ── GET /api/tree ────────────────────────────────────────
  if (m === 'GET' && pathname === '/api/tree') {
    const root = query.root;
    if (!root) return sendJSON(res, 400, { error: 'root required' });
    const ac = checkDirAccess(root);
    if (!ac.allowed) return sendDenied(res);
    try {
      await fsp.access(root, fs.constants.R_OK);
      const st = await fsp.stat(root);
      if (!st.isDirectory()) return sendJSON(res, 400, { error: 'Not a directory' });
      sendJSON(res, 200, { tree: await buildTree(root), root });
    } catch(e) { sendJSON(res, 404, { error: `Path not found: ${e.message}` }); }
    return;
  }

  // ── GET /api/validate ────────────────────────────────────
  if (m === 'GET' && pathname === '/api/validate') {
    const p = query.path;
    if (!p || typeof p !== 'string') return sendJSON(res, 200, { valid: false, error: 'path required' });
    try {
      const resolved = path.resolve(p);
      const ac = checkDirAccess(resolved);
      if (!ac.allowed) return sendJSON(res, 200, { valid: false, error: 'Access denied by policy' });
      await fsp.access(resolved, fs.constants.R_OK);
      const st = await fsp.stat(resolved);
      sendJSON(res, 200, { valid: true, isDir: st.isDirectory() });
    } catch(e) { sendJSON(res, 200, { valid: false, error: e.message }); }
    return;
  }

  // ── GET /api/file ────────────────────────────────────────
  if (m === 'GET' && pathname === '/api/file') {
    const fp = query.path;
    if (!fp) return sendJSON(res, 400, { error: 'path required' });
    const ac = checkAccess(fp);
    if (!ac.allowed) return sendDenied(res);
    try {
      await fsp.access(fp, fs.constants.R_OK);
      if (!isTextFile(path.basename(fp))) return sendJSON(res, 400, { error: 'binary' });
      const content = await fsp.readFile(fp, 'utf8');
      let writable = false;
      try { await fsp.access(fp, fs.constants.W_OK); writable = true; } catch(e) {}
      sendJSON(res, 200, { content, path: fp, writable });
    } catch(e) { sendJSON(res, 500, { error: e.message }); }
    return;
  }

  // ── GET /api/raw ─────────────────────────────────────────
  if (m === 'GET' && pathname === '/api/raw') {
    const fp = query.path;
    if (!fp) return send404(res);
    const ac = checkAccess(fp);
    if (!ac.allowed) return send404(res); // 404 to avoid info leakage
    try {
      await fsp.access(fp, fs.constants.R_OK);
      const ext  = fp.split('.').pop().toLowerCase();
      const mime = MIME_BY_EXT[ext] || 'application/octet-stream';
      const st   = await fsp.stat(fp);
      res.writeHead(200, {
        'Content-Type':        mime,
        'Content-Length':      st.size,
        'Content-Disposition': `inline; filename="${encodeURIComponent(path.basename(fp))}"`,
      });
      fs.createReadStream(fp).pipe(res);
    } catch(e) { send404(res); }
    return;
  }

  // ── POST /api/file ───────────────────────────────────────
  if (m === 'POST' && pathname === '/api/file') {
    try {
      const body = JSON.parse(await readBody(req));
      if (!checkAccess(body.path).allowed) return sendDenied(res);
      const dir = path.dirname(body.path);
      await fsp.mkdir(dir, { recursive: true });
      try { await fsp.access(dir, fs.constants.W_OK); }
      catch(e) { return sendJSON(res, 403, { error: 'Permission denied' }); }
      await fsp.writeFile(body.path, body.content || '', 'utf8');
      sendJSON(res, 200, { ok: true });
    } catch(e) { sendJSON(res, 500, { error: e.message }); }
    return;
  }

  // ── PUT /api/file ────────────────────────────────────────
  if (m === 'PUT' && pathname === '/api/file') {
    try {
      const body = JSON.parse(await readBody(req));
      if (!checkAccess(body.path).allowed) return sendDenied(res);
      try { await fsp.access(body.path, fs.constants.W_OK); }
      catch(e) { return sendJSON(res, 403, { error: 'Permission denied (read-only)' }); }
      await fsp.writeFile(body.path, body.content, 'utf8');
      sendJSON(res, 200, { ok: true });
    } catch(e) { sendJSON(res, 500, { error: e.message }); }
    return;
  }

  // ── DELETE /api/file ─────────────────────────────────────
  if (m === 'DELETE' && pathname === '/api/file') {
    try {
      const fp = query.path;
      if (!checkAccess(fp).allowed) return sendDenied(res);
      const st = await fsp.stat(fp);
      try { await fsp.access(path.dirname(fp), fs.constants.W_OK); }
      catch(e) { return sendJSON(res, 403, { error: 'Permission denied' }); }
      if (st.isDirectory()) await fsp.rm(fp, { recursive: true, force: true });
      else await fsp.unlink(fp);
      sendJSON(res, 200, { ok: true });
    } catch(e) { sendJSON(res, 500, { error: e.message }); }
    return;
  }

  // ── POST /api/rename ─────────────────────────────────────
  if (m === 'POST' && pathname === '/api/rename') {
    try {
      const body = JSON.parse(await readBody(req));
      if (!checkAccess(body.from).allowed) return sendDenied(res);
      if (!checkAccess(body.to).allowed)   return sendDenied(res);
      try { await fsp.access(path.dirname(body.from), fs.constants.W_OK); }
      catch(e) { return sendJSON(res, 403, { error: 'Permission denied' }); }
      await fsp.rename(body.from, body.to);
      sendJSON(res, 200, { ok: true });
    } catch(e) { sendJSON(res, 500, { error: e.message }); }
    return;
  }

  // ── POST /api/copy ───────────────────────────────────────
  if (m === 'POST' && pathname === '/api/copy') {
    try {
      const body = JSON.parse(await readBody(req));
      if (!checkAccess(body.from).allowed) return sendDenied(res);
      if (!checkAccess(body.to).allowed)   return sendDenied(res);
      await copyRecursive(body.from, body.to);
      sendJSON(res, 200, { ok: true });
    } catch(e) { sendJSON(res, 500, { error: e.message }); }
    return;
  }

  // ── POST /api/mkdir ──────────────────────────────────────
  if (m === 'POST' && pathname === '/api/mkdir') {
    try {
      const body = JSON.parse(await readBody(req));
      if (!checkAccess(body.path).allowed) return sendDenied(res);
      try { await fsp.access(path.dirname(body.path), fs.constants.W_OK); }
      catch(e) { return sendJSON(res, 403, { error: 'Permission denied' }); }
      await fsp.mkdir(body.path, { recursive: true });
      sendJSON(res, 200, { ok: true });
    } catch(e) { sendJSON(res, 500, { error: e.message }); }
    return;
  }


  // ── POST /api/zip { path } ──────────────────────────────
  // Compress a folder into <folder>.zip in the same parent directory
  if (m === 'POST' && pathname === '/api/zip') {
    try {
      const body = JSON.parse(await readBody(req));
      const srcPath = body.path;
      if (!checkAccess(srcPath).allowed) return sendDenied(res);
      const st = await fsp.stat(srcPath);
      if (!st.isDirectory()) return sendJSON(res, 400, { error: 'zip target must be a directory' });
      const parent  = path.dirname(srcPath);
      const name    = path.basename(srcPath);
      const zipDest = path.join(parent, name + '.zip');
      await zipDirectory(srcPath, zipDest);
      sendJSON(res, 200, { ok: true, dest: zipDest });
    } catch(e) { sendJSON(res, 500, { error: e.message }); }
    return;
  }

  // ── POST /api/unzip { path } ────────────────────────────
  // Extract a .zip file into a folder with the same name (sans .zip) in the same directory
  if (m === 'POST' && pathname === '/api/unzip') {
    try {
      const body = JSON.parse(await readBody(req));
      const zipPath = body.path;
      if (!checkAccess(zipPath).allowed) return sendDenied(res);
      if (!zipPath.toLowerCase().endsWith('.zip'))
        return sendJSON(res, 400, { error: 'file must be a .zip archive' });
      const parent  = path.dirname(zipPath);
      const name    = path.basename(zipPath, '.zip');
      const destDir = path.join(parent, name);
      await fsp.mkdir(destDir, { recursive: true });
      await unzipArchive(zipPath, destDir);
      sendJSON(res, 200, { ok: true, dest: destDir });
    } catch(e) { sendJSON(res, 500, { error: e.message }); }
    return;
  }


  // ── POST /api/upload?dest=<dir>  (multipart OR raw binary) ──
  // Accepts a single file upload. Content-Type determines handling:
  //   multipart/form-data  → parse boundary, extract file
  //   application/octet-stream + X-Filename header → raw binary
  //   application/json → text file (legacy)
  if (m === 'POST' && pathname === '/api/upload') {
    try {
      const dest = query.dest;
      if (!dest) return sendJSON(res, 400, { error: 'dest required' });
      const ac = checkDirAccess(dest);
      if (!ac.allowed) return sendDenied(res);
      // Write permission on dest dir
      try { await fsp.access(dest, fs.constants.W_OK); }
      catch(e) { return sendJSON(res, 403, { error: 'Permission denied on destination' }); }

      const ct = (req.headers['content-type'] || '');
      const filename = decodeURIComponent(req.headers['x-filename'] || '');

      if (ct.includes('multipart/form-data')) {
        // Parse multipart
        const boundary = ct.split('boundary=')[1];
        if (!boundary) return sendJSON(res, 400, { error: 'Missing boundary' });
        const rawBuf = await readBodyBuffer(req);
        const files  = parseMultipart(rawBuf, boundary);
        if (!files.length) return sendJSON(res, 400, { error: 'No file in multipart body' });
        const results = [];
        for (const file of files) {
          const fp = path.join(dest, path.basename(file.filename));
          const fpAc = checkAccess(fp);
          if (!fpAc.allowed) { results.push({ name: file.filename, error: 'denied' }); continue; }
          await fsp.writeFile(fp, file.data);
          results.push({ name: file.filename, ok: true, path: fp });
        }
        return sendJSON(res, 200, { results });
      }

      if (filename) {
        // Raw binary via X-Filename header
        const fp  = path.join(dest, path.basename(filename));
        const fpAc = checkAccess(fp);
        if (!fpAc.allowed) return sendDenied(res);
        const buf = await readBodyBuffer(req);
        await fsp.writeFile(fp, buf);
        return sendJSON(res, 200, { ok: true, path: fp, name: filename });
      }

      return sendJSON(res, 400, { error: 'No filename provided' });
    } catch(e) { sendJSON(res, 500, { error: e.message }); }
    return;
  }

  // ── GET /api/download?path=... ─────────────────────────
  // Download a single file (forces Content-Disposition: attachment)
  if (m === 'GET' && pathname === '/api/download') {
    const fp = query.path;
    if (!fp) return send404(res);
    const ac = checkAccess(fp);
    if (!ac.allowed) return send404(res);
    try {
      await fsp.access(fp, fs.constants.R_OK);
      const st   = await fsp.stat(fp);
      if (!st.isFile()) return send404(res);
      const ext  = fp.split('.').pop().toLowerCase();
      const mime = MIME_BY_EXT[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type':        mime,
        'Content-Length':      st.size,
        'Content-Disposition': 'attachment; filename="' + encodeURIComponent(path.basename(fp)) + '"',
        'Cache-Control':       'no-store',
      });
      fs.createReadStream(fp).pipe(res);
    } catch(e) { send404(res); }
    return;
  }

  // ── GET /api/download-zip?path=... ─────────────────────
  // Zip a directory on the fly and stream it as a download
  if (m === 'GET' && pathname === '/api/download-zip') {
    const dirPath = query.path;
    if (!dirPath) return send404(res);
    const ac = checkAccess(dirPath);
    if (!ac.allowed) return send404(res);
    try {
      await fsp.access(dirPath, fs.constants.R_OK);
      const st = await fsp.stat(dirPath);
      if (!st.isDirectory()) return send404(res);
      const zipName = path.basename(dirPath) + '.zip';
      const tmpZip  = path.join(os.tmpdir(), 'fmdl_' + Date.now() + '_' + zipName);
      await zipDirectory(dirPath, tmpZip);
      const zipSt = await fsp.stat(tmpZip);
      res.writeHead(200, {
        'Content-Type':        'application/zip',
        'Content-Length':      zipSt.size,
        'Content-Disposition': 'attachment; filename="' + encodeURIComponent(zipName) + '"',
        'Cache-Control':       'no-store',
      });
      const stream = fs.createReadStream(tmpZip);
      stream.pipe(res);
      stream.on('end', () => fsp.unlink(tmpZip).catch(() => {}));
    } catch(e) { sendJSON(res, 500, { error: e.message }); }
    return;
  }

  // ── GET /api/search ──────────────────────────────────────
  if (m === 'GET' && pathname === '/api/search') {
    const { root, name, content } = query;
    if (!root) return sendJSON(res, 400, { error: 'root required' });
    if (!checkDirAccess(root).allowed) return sendDenied(res);
    try {
      sendJSON(res, 200, { results: await searchFiles(root, name || '', content || '') });
    } catch(e) { sendJSON(res, 500, { error: e.message }); }
    return;
  }

  // ── GET /api/info ────────────────────────────────────────
  if (m === 'GET' && pathname === '/api/info') {
    sendJSON(res, 200, {
      platform: os.platform(), hostname: os.hostname(),
      homedir: os.homedir(), sep: path.sep,
      useAuth: USE_AUTH, useAccessControl: USE_ACCESS_CONTROL,
    });
    return;
  }

  sendJSON(res, 404, { error: 'not found' });
}

// ── Build tree (access-filtered) ──────────────────────────────
async function buildTree(dirPath) {
  const SKIP = new Set(['node_modules','.git','.svn','__pycache__','.DS_Store','Thumbs.db']);
  let entries;
  try { entries = await fsp.readdir(dirPath, { withFileTypes: true }); }
  catch(e) { return []; }

  const nodes = [];
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.gitignore') continue;
    if (SKIP.has(e.name)) continue;
    const fp = path.join(dirPath, e.name);
    // Access check
    const ac = e.isDirectory() ? checkDirAccess(fp) : checkAccess(fp);
    if (!ac.allowed) continue;

    let writable = false;
    try { await fsp.access(fp, fs.constants.W_OK); writable = true; } catch(ex) {}
    nodes.push({
      name: e.name, path: fp,
      kind: e.isDirectory() ? 'directory' : 'file',
      isText: e.isFile() ? isTextFile(e.name) : false,
      writable,
      ext: e.isFile() ? e.name.split('.').pop().toLowerCase() : '',
    });
  }
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return nodes;
}

// ── Recursive copy ────────────────────────────────────────────
async function copyRecursive(src, dest) {
  const st = await fsp.stat(src);
  if (st.isDirectory()) {
    await fsp.mkdir(dest, { recursive: true });
    for (const e of await fsp.readdir(src))
      await copyRecursive(path.join(src, e), path.join(dest, e));
  } else {
    await fsp.copyFile(src, dest);
  }
}

// ── File search (access-filtered) ────────────────────────────
async function searchFiles(root, nameKw, contentKw, results, depth) {
  results = results || [];
  depth   = depth   || 0;
  if (depth > 8 || results.length >= 200) return results;
  const SKIP = new Set(['node_modules','.git','__pycache__','.DS_Store']);
  let entries;
  try { entries = await fsp.readdir(root, { withFileTypes: true }); } catch(e) { return results; }

  for (const e of entries) {
    if (results.length >= 200) break;
    if (e.name.startsWith('.')) continue;
    if (SKIP.has(e.name)) continue;
    const fp = path.join(root, e.name);
    const nameMatch = !nameKw || e.name.toLowerCase().includes(nameKw.toLowerCase());

    if (e.isDirectory()) {
      if (!checkDirAccess(fp).allowed) continue;
      if (nameMatch && !contentKw)
        results.push({ name: e.name, path: fp, kind: 'directory', isText: false, ext: '' });
      await searchFiles(fp, nameKw, contentKw, results, depth + 1);
    } else {
      if (!checkAccess(fp).allowed) continue;
      let contentMatch = false;
      if (nameMatch && contentKw && isTextFile(e.name)) {
        try {
          const txt = await fsp.readFile(fp, 'utf8');
          contentMatch = txt.toLowerCase().includes(contentKw.toLowerCase());
        } catch(ex) {}
      }
      if (nameMatch && (!contentKw || contentMatch)) {
        results.push({
          name: e.name, path: fp, kind: 'file',
          isText: isTextFile(e.name), ext: e.name.split('.').pop().toLowerCase(),
        });
      }
    }
  }
  return results;
}


// ── Zip helpers ───────────────────────────────────────────────
function zipDirectory(srcDir, destZip) {
  return new Promise((resolve, reject) => {
    const platform = os.platform();
    if (platform === 'win32') {
      // PowerShell Compress-Archive
      const cmd = `Compress-Archive -Path "${srcDir}" -DestinationPath "${destZip}" -Force`;
      exec(`powershell -Command "${cmd}"`, (err) => err ? reject(err) : resolve());
    } else {
      // Unix: zip -r dest.zip srcDir (run from parent to get clean relative paths)
      const parent = path.dirname(srcDir);
      const name   = path.basename(srcDir);
      execFile('zip', ['-r', destZip, name], { cwd: parent }, (err) => {
        if (err) reject(new Error('zip command failed: ' + err.message + ' (is zip installed?)'));
        else resolve();
      });
    }
  });
}

function unzipArchive(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    const platform = os.platform();
    if (platform === 'win32') {
      const cmd = `Expand-Archive -Path "${zipPath}" -DestinationPath "${destDir}" -Force`;
      exec(`powershell -Command "${cmd}"`, (err) => err ? reject(err) : resolve());
    } else {
      execFile('unzip', ['-o', zipPath, '-d', destDir], (err) => {
        if (err) reject(new Error('unzip command failed: ' + err.message + ' (is unzip installed?)'));
        else resolve();
      });
    }
  });
}

// ── WebSocket ─────────────────────────────────────────────────
if (WebSocketServer) {
  const wss      = new WebSocketServer({ server });
  const watchers = new Map();
  wss.on('connection', ws => {
    ws.on('message', raw => {
      try {
        const msg = JSON.parse(raw);
        if (msg.type === 'watch' && chokidar) {
          if (!checkDirAccess(msg.path).allowed) return;
          if (watchers.has(ws)) watchers.get(ws).close();
          const w = chokidar.watch(msg.path, {
            depth: 1, ignoreInitial: true,
            ignored: /(^|[/\\])\..|(node_modules)/,
          });
          const notify = (ev, p) => {
            if (ws.readyState === 1) ws.send(JSON.stringify({ type:'change', event:ev, path:p }));
          };
          w.on('add',p=>notify('add',p)).on('unlink',p=>notify('remove',p))
           .on('addDir',p=>notify('addDir',p)).on('unlinkDir',p=>notify('removeDir',p))
           .on('change',p=>notify('change',p));
          watchers.set(ws, w);
        }
        if (msg.type === 'unwatch') {
          if (watchers.has(ws)) { watchers.get(ws).close(); watchers.delete(ws); }
        }
      } catch(e) {}
    });
    ws.on('close', () => {
      if (watchers.has(ws)) { watchers.get(ws).close(); watchers.delete(ws); }
    });
  });
}

// ── mDNS ─────────────────────────────────────────────────────
function startMDNS() {
  if (!mdns) return;
  try {
    const ad = mdns.createAdvertisement(mdns.tcp('http'), PORT, { name: APP_NAME });
    ad.start();
    console.log(`  mDNS : http://${APP_NAME}.local:${PORT}`);
  } catch(e) { console.log(`  mDNS: unavailable (${e.message})`); }
}

// ── Start ─────────────────────────────────────────────────────
server.listen(PORT, HOST, () => {
  const ips = [];
  Object.values(os.networkInterfaces()).forEach(l =>
    l.forEach(i => { if (i.family === 'IPv4' && !i.internal) ips.push(i.address); }));

  console.log('┌──────────────────────────────────────────────────┐');
  console.log('│       Mini Local File Manager  v2.4              │');
  console.log('├──────────────────────────────────────────────────┤');
  console.log(`│  Local   : http://localhost:${PORT}                  │`);
  ips.forEach(ip => console.log(`│  Network : http://${ip}:${PORT}             │`));
  if (USE_AUTH)           console.log(`│  Auth    : enabled (user: ${AUTH_USER})               │`);
  if (USE_ACCESS_CONTROL) console.log(`│  Access  : ${ACCESS_RULES.length} rule(s) active, default DENY      │`);
  console.log('│  Ctrl+C  : stop                                  │');
  console.log('└──────────────────────────────────────────────────┘\n');
  startMDNS();
});

server.on('error', e => {
  if (e.code === 'EADDRINUSE')
    console.error(`\n⚠  Port ${PORT} in use. Try: node server.js ${PORT + 1}`);
  else console.error('Server error:', e.message);
  process.exit(1);
});
