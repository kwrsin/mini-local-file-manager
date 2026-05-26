#!/usr/bin/env node
/**
 * Mini Local File Manager – server.js  v2.0
 *
 * Usage:
 *   node server.js [port]
 *   PORT=4000 node server.js
 *
 * Auth (optional, set via env):
 *   FM_USER=admin  FM_PASS_HASH=<bcrypt-or-sha256-hex>  node server.js
 *   Simple sha256 hash:  echo -n "mypassword" | sha256sum
 */
'use strict';

const http   = require('http');
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

// ── Config ────────────────────────────────────────────────────
const PORT     = parseInt(process.argv[2] || process.env.PORT || 3000, 10);
const HOST     = process.env.HOST || '0.0.0.0';
const PUBLIC   = path.join(__dirname, 'public');
const APP_NAME = 'mini-local-file-manager';

// Auth config (optional)
const AUTH_USER = process.env.FM_USER || '';
const AUTH_HASH = process.env.FM_PASS_HASH || '';  // sha256 hex of password
const USE_AUTH  = !!(AUTH_USER && AUTH_HASH);

// Session store (simple in-memory)
const sessions = new Map(); // token -> { user, expires }
const SESSION_TTL = 8 * 60 * 60 * 1000; // 8 hours

// ── MIME types ────────────────────────────────────────────────
const MIME = {
  '.html':'.html', '.css':'text/css; charset=utf-8',
  '.js':  'application/javascript; charset=utf-8',
  '.json':'application/json',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg':'image/jpeg',
  '.gif': 'image/gif',
  '.webp':'image/webp',
  '.pdf': 'application/pdf',
  '.woff2':'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const MIME_BY_EXT = {
  html:'text/html; charset=utf-8', htm:'text/html; charset=utf-8',
  css:'text/css; charset=utf-8', js:'application/javascript; charset=utf-8',
  json:'application/json', xml:'application/xml',
  png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg',
  gif:'image/gif', webp:'image/webp', svg:'image/svg+xml',
  pdf:'application/pdf', ico:'image/x-icon',
  txt:'text/plain; charset=utf-8', md:'text/plain; charset=utf-8',
};

const TEXT_EXTS = new Set([
  'md','txt','html','htm','css','js','mjs','cjs','ts','tsx','jsx',
  'json','xml','yaml','yml','csv','log','ini','cfg','toml',
  'sh','bash','zsh','fish','bat','cmd','ps1',
  'py','rb','java','c','cpp','cc','h','hpp','cs','go','rs','php','swift',
  'sql','graphql','vue','svelte','astro','env','gitignore','dockerfile',
]);

function isTextFile(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  return TEXT_EXTS.has(ext) ||
    ['makefile','dockerfile','readme','license','changelog'].includes(filename.toLowerCase());
}

// ── Auth helpers ──────────────────────────────────────────────
function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}
function newToken() {
  return crypto.randomBytes(32).toString('hex');
}
function checkToken(req) {
  if (!USE_AUTH) return true;
  const cookie = parseCookies(req);
  const token  = cookie['fm_session'];
  if (!token) return false;
  const sess = sessions.get(token);
  if (!sess) return false;
  if (Date.now() > sess.expires) { sessions.delete(token); return false; }
  sess.expires = Date.now() + SESSION_TTL; // renew
  return true;
}
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(c => {
    const [k,...v] = c.trim().split('=');
    if (k) out[k.trim()] = decodeURIComponent(v.join('='));
  });
  return out;
}

// ── HTTP Server ───────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const parsed   = url.parse(req.url, true);
  const pathname = decodeURIComponent(parsed.pathname);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Auth endpoints
  if (pathname === '/api/login' && req.method === 'POST') {
    return handleLogin(req, res);
  }
  if (pathname === '/api/logout' && req.method === 'POST') {
    return handleLogout(req, res);
  }
  if (pathname === '/api/auth-status' && req.method === 'GET') {
    return sendJSON(res, 200, { useAuth: USE_AUTH, ok: checkToken(req) });
  }

  // API – require auth if enabled
  if (pathname.startsWith('/api/')) {
    if (!checkToken(req)) {
      if (USE_AUTH) return sendJSON(res, 401, { error: 'Unauthorized' });
    }
    return handleAPI(req, res, pathname, parsed.query);
  }

  // Serve static files
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(PUBLIC, filePath.replace(/\.\./g, ''));
  try {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile()) return send404(res);
    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime === '.html'
      ? 'text/html; charset=utf-8' : mime });
    fs.createReadStream(filePath).pipe(res);
  } catch(e) { send404(res); }
});

async function handleLogin(req, res) {
  try {
    const body = JSON.parse(await readBody(req));
    if (!USE_AUTH) return sendJSON(res, 200, { ok: true, noauth: true });
    const valid = body.user === AUTH_USER && sha256(body.pass) === AUTH_HASH;
    if (!valid) return sendJSON(res, 401, { error: 'Invalid credentials' });
    const token = newToken();
    sessions.set(token, { user: AUTH_USER, expires: Date.now() + SESSION_TTL });
    res.setHeader('Set-Cookie', `fm_session=${token}; Path=/; HttpOnly; SameSite=Strict`);
    sendJSON(res, 200, { ok: true });
  } catch(e) { sendJSON(res, 500, { error: e.message }); }
}
function handleLogout(req, res) {
  const cookie = parseCookies(req);
  if (cookie['fm_session']) sessions.delete(cookie['fm_session']);
  res.setHeader('Set-Cookie', 'fm_session=; Path=/; Max-Age=0');
  sendJSON(res, 200, { ok: true });
}

function send404(res) { res.writeHead(404); res.end('404 Not Found'); }
function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}
async function readBody(req) {
  return new Promise((resolve, reject) => {
    const c = []; req.on('data', d => c.push(d));
    req.on('end', () => resolve(Buffer.concat(c).toString('utf8')));
    req.on('error', reject);
  });
}

// ── API handler ───────────────────────────────────────────────
async function handleAPI(req, res, pathname, query) {
  const method = req.method;

  // GET /api/tree?root=...
  if (method === 'GET' && pathname === '/api/tree') {
    const root = query.root;
    if (!root) return sendJSON(res, 400, { error: 'root required' });
    try {
      await fsp.access(root, fs.constants.R_OK);
      const stat = await fsp.stat(root);
      if (!stat.isDirectory()) return sendJSON(res, 400, { error: 'Not a directory' });
      const tree = await buildTree(root);
      sendJSON(res, 200, { tree, root });
    } catch(e) { sendJSON(res, 404, { error: `Path not found or not accessible: ${e.message}` }); }
    return;
  }

  // GET /api/validate?path=...
  if (method === 'GET' && pathname === '/api/validate') {
    try {
      const p = query.path;
      await fsp.access(p, fs.constants.R_OK);
      const stat = await fsp.stat(p);
      sendJSON(res, 200, { valid: true, isDir: stat.isDirectory() });
    } catch(e) { sendJSON(res, 200, { valid: false, error: e.message }); }
    return;
  }

  // GET /api/file?path=...
  if (method === 'GET' && pathname === '/api/file') {
    const fp = query.path;
    if (!fp) return sendJSON(res, 400, { error: 'path required' });
    try {
      await fsp.access(fp, fs.constants.R_OK);
      if (!isTextFile(path.basename(fp))) return sendJSON(res, 400, { error: 'binary' });
      const content = await fsp.readFile(fp, 'utf8');
      // Check write permission
      let writable = false;
      try { await fsp.access(fp, fs.constants.W_OK); writable = true; } catch(e) {}
      sendJSON(res, 200, { content, path: fp, writable });
    } catch(e) { sendJSON(res, 500, { error: e.message }); }
    return;
  }

  // GET /api/raw?path=...  – serve any file as its real MIME type
  if (method === 'GET' && pathname === '/api/raw') {
    const fp = query.path;
    if (!fp) return sendJSON(res, 400, { error: 'path required' });
    try {
      await fsp.access(fp, fs.constants.R_OK);
      const ext  = fp.split('.').pop().toLowerCase();
      const mime = MIME_BY_EXT[ext] || 'application/octet-stream';
      const stat = await fsp.stat(fp);
      res.writeHead(200, { 'Content-Type': mime, 'Content-Length': stat.size,
        'Content-Disposition': `inline; filename="${encodeURIComponent(path.basename(fp))}"` });
      fs.createReadStream(fp).pipe(res);
    } catch(e) { send404(res); }
    return;
  }

  // POST /api/file  { path, content }
  if (method === 'POST' && pathname === '/api/file') {
    try {
      const body = JSON.parse(await readBody(req));
      await fsp.mkdir(path.dirname(body.path), { recursive: true });
      // Check permission (new file – check parent dir)
      try { await fsp.access(path.dirname(body.path), fs.constants.W_OK); }
      catch(e) { return sendJSON(res, 403, { error: 'Permission denied' }); }
      await fsp.writeFile(body.path, body.content || '', 'utf8');
      sendJSON(res, 200, { ok: true });
    } catch(e) { sendJSON(res, 500, { error: e.message }); }
    return;
  }

  // PUT /api/file  { path, content }
  if (method === 'PUT' && pathname === '/api/file') {
    try {
      const body = JSON.parse(await readBody(req));
      try { await fsp.access(body.path, fs.constants.W_OK); }
      catch(e) { return sendJSON(res, 403, { error: 'Permission denied (read-only file)' }); }
      await fsp.writeFile(body.path, body.content, 'utf8');
      sendJSON(res, 200, { ok: true });
    } catch(e) { sendJSON(res, 500, { error: e.message }); }
    return;
  }

  // DELETE /api/file?path=...
  if (method === 'DELETE' && pathname === '/api/file') {
    try {
      const fp   = query.path;
      const stat = await fsp.stat(fp);
      // Check parent dir write permission
      try { await fsp.access(path.dirname(fp), fs.constants.W_OK); }
      catch(e) { return sendJSON(res, 403, { error: 'Permission denied' }); }
      if (stat.isDirectory()) await fsp.rm(fp, { recursive: true, force: true });
      else await fsp.unlink(fp);
      sendJSON(res, 200, { ok: true });
    } catch(e) { sendJSON(res, 500, { error: e.message }); }
    return;
  }

  // POST /api/rename  { from, to }
  if (method === 'POST' && pathname === '/api/rename') {
    try {
      const body = JSON.parse(await readBody(req));
      try { await fsp.access(path.dirname(body.from), fs.constants.W_OK); }
      catch(e) { return sendJSON(res, 403, { error: 'Permission denied' }); }
      await fsp.rename(body.from, body.to);
      sendJSON(res, 200, { ok: true });
    } catch(e) { sendJSON(res, 500, { error: e.message }); }
    return;
  }

  // POST /api/copy  { from, to }
  if (method === 'POST' && pathname === '/api/copy') {
    try {
      const body = JSON.parse(await readBody(req));
      await copyRecursive(body.from, body.to);
      sendJSON(res, 200, { ok: true });
    } catch(e) { sendJSON(res, 500, { error: e.message }); }
    return;
  }

  // POST /api/mkdir  { path }
  if (method === 'POST' && pathname === '/api/mkdir') {
    try {
      const body = JSON.parse(await readBody(req));
      try { await fsp.access(path.dirname(body.path), fs.constants.W_OK); }
      catch(e) { return sendJSON(res, 403, { error: 'Permission denied' }); }
      await fsp.mkdir(body.path, { recursive: true });
      sendJSON(res, 200, { ok: true });
    } catch(e) { sendJSON(res, 500, { error: e.message }); }
    return;
  }

  // GET /api/search?root=...&name=...&content=...
  if (method === 'GET' && pathname === '/api/search') {
    try {
      const { root, name, content } = query;
      if (!root) return sendJSON(res, 400, { error: 'root required' });
      const results = await searchFiles(root, name || '', content || '');
      sendJSON(res, 200, { results });
    } catch(e) { sendJSON(res, 500, { error: e.message }); }
    return;
  }

  // GET /api/info
  if (method === 'GET' && pathname === '/api/info') {
    sendJSON(res, 200, {
      platform: os.platform(), hostname: os.hostname(),
      homedir: os.homedir(), sep: path.sep, useAuth: USE_AUTH,
    });
    return;
  }

  sendJSON(res, 404, { error: 'not found' });
}

// ── Build tree ────────────────────────────────────────────────
async function buildTree(dirPath) {
  const SKIP = new Set(['node_modules','.git','.svn','__pycache__','.DS_Store','Thumbs.db']);
  const entries = await fsp.readdir(dirPath, { withFileTypes: true });
  const nodes = [];
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.gitignore') continue;
    if (SKIP.has(e.name)) continue;
    const fp = path.join(dirPath, e.name);
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
  nodes.sort((a,b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return nodes;
}

// ── Recursive copy ────────────────────────────────────────────
async function copyRecursive(src, dest) {
  const stat = await fsp.stat(src);
  if (stat.isDirectory()) {
    await fsp.mkdir(dest, { recursive: true });
    for (const e of await fsp.readdir(src))
      await copyRecursive(path.join(src,e), path.join(dest,e));
  } else {
    await fsp.copyFile(src, dest);
  }
}

// ── File search ───────────────────────────────────────────────
async function searchFiles(root, nameKw, contentKw, results=[], depth=0) {
  if (depth > 8) return results;
  const SKIP = new Set(['node_modules','.git','__pycache__']);
  let entries;
  try { entries = await fsp.readdir(root, { withFileTypes: true }); } catch(e) { return results; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    if (SKIP.has(e.name)) continue;
    const fp = path.join(root, e.name);
    if (e.isDirectory()) {
      await searchFiles(fp, nameKw, contentKw, results, depth+1);
    } else {
      const nameMatch = !nameKw || e.name.toLowerCase().includes(nameKw.toLowerCase());
      let contentMatch = false;
      if (nameMatch && contentKw && isTextFile(e.name)) {
        try {
          const txt = await fsp.readFile(fp, 'utf8');
          contentMatch = txt.toLowerCase().includes(contentKw.toLowerCase());
        } catch(ex) {}
      }
      if (nameMatch && (!contentKw || contentMatch)) {
        results.push({ name: e.name, path: fp, kind: 'file',
          isText: isTextFile(e.name), ext: e.name.split('.').pop().toLowerCase() });
      }
    }
    if (results.length >= 200) break;
  }
  return results;
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
          if (watchers.has(ws)) watchers.get(ws).close();
          const w = chokidar.watch(msg.path, {
            depth:1, ignoreInitial:true,
            ignored: /(^|[/\\])\..|(node_modules)/,
          });
          const notify = (ev, p) => {
            if (ws.readyState===1) ws.send(JSON.stringify({type:'change',event:ev,path:p}));
          };
          w.on('add',p=>notify('add',p)).on('unlink',p=>notify('remove',p))
           .on('addDir',p=>notify('addDir',p)).on('unlinkDir',p=>notify('removeDir',p))
           .on('change',p=>notify('change',p));
          watchers.set(ws, w);
        }
        if (msg.type==='unwatch') { if(watchers.has(ws)){watchers.get(ws).close();watchers.delete(ws);} }
      } catch(e){}
    });
    ws.on('close', () => { if(watchers.has(ws)){watchers.get(ws).close();watchers.delete(ws);} });
  });
}

// ── mDNS ─────────────────────────────────────────────────────
function startMDNS() {
  if (!mdns) return;
  try {
    const ad = mdns.createAdvertisement(mdns.tcp('http'), PORT, { name: APP_NAME });
    ad.start();
    console.log(`  mDNS : http://${APP_NAME}.local:${PORT}`);
  } catch(e) { console.log(`  mDNS : unavailable (${e.message})`); }
}

// ── Start ─────────────────────────────────────────────────────
server.listen(PORT, HOST, () => {
  const ips = [];
  Object.values(os.networkInterfaces()).forEach(l =>
    l.forEach(i => { if(i.family==='IPv4'&&!i.internal) ips.push(i.address); }));

  console.log('\n┌──────────────────────────────────────────────────┐');
  console.log('│       Mini Local File Manager  v2.0              │');
  console.log('├──────────────────────────────────────────────────┤');
  console.log(`│  Local   : http://localhost:${PORT}                  │`);
  ips.forEach(ip => console.log(`│  Network : http://${ip}:${PORT}             │`));
  if (USE_AUTH) console.log(`│  Auth    : enabled (user: ${AUTH_USER})               │`);
  console.log('│  Ctrl+C to stop                                  │');
  console.log('└──────────────────────────────────────────────────┘\n');
  startMDNS();
});

server.on('error', e => {
  if (e.code==='EADDRINUSE')
    console.error(`\n⚠  Port ${PORT} in use. Try: node server.js ${PORT+1}`);
  else console.error('Server error:', e.message);
  process.exit(1);
});
