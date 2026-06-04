/**
 * Mini Local File Manager – app.js  v2.1
 * Compatible with Safari 10+ (iPhone 7 / iOS 10)
 * - No optional chaining (?.)
 * - No nullish coalescing (??)
 * - No default parameters with complex expressions
 * - Uses var/function where needed for hoisting clarity
 */
'use strict';

/* ── Helpers ─────────────────────────────────────────────────── */
function $(id) { return document.getElementById(id); }
function qsa(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

var TEXT_EXTS = {'md':1,'txt':1,'html':1,'htm':1,'css':1,'js':1,'mjs':1,'cjs':1,
  'ts':1,'tsx':1,'jsx':1,'json':1,'xml':1,'yaml':1,'yml':1,'csv':1,'log':1,
  'ini':1,'cfg':1,'toml':1,'sh':1,'bash':1,'zsh':1,'fish':1,'bat':1,'cmd':1,
  'ps1':1,'py':1,'rb':1,'java':1,'c':1,'cpp':1,'cc':1,'h':1,'hpp':1,'cs':1,
  'go':1,'rs':1,'php':1,'swift':1,'sql':1,'graphql':1,'vue':1,'svelte':1,
  'astro':1,'env':1,'gitignore':1,'dockerfile':1};
var IMG_EXTS  = {'png':1,'jpg':1,'jpeg':1,'gif':1,'webp':1,'bmp':1,'ico':1,'tiff':1};
var AUDIO_EXTS = {'mp3':1,'wav':1,'ogg':1,'flac':1,'aac':1,'m4a':1,'opus':1,'weba':1};
var VIDEO_EXTS = {'mp4':1,'webm':1,'ogv':1,'mov':1,'avi':1,'mkv':1,'m4v':1};
var MEDIA_EXTS = {};
var VIEW_EXTS = {'png':1,'jpg':1,'jpeg':1,'gif':1,'webp':1,'bmp':1,'ico':1,'tiff':1,
  'svg':1,'pdf':1,'json':1}; // extended at runtime

function isMedia(name) { return !!MEDIA_EXTS[name.split('.').pop().toLowerCase()]; }
function isText(name) {
  var ext = name.split('.').pop().toLowerCase();
  return !!TEXT_EXTS[ext] ||
    ['makefile','dockerfile','readme','license','changelog'].indexOf(name.toLowerCase()) >= 0;
}
function isViewable(name) { return !!VIEW_EXTS[name.split('.').pop().toLowerCase()]; }
function getExt(name) { return name.split('.').pop().toLowerCase(); }
function safeGet(obj, key) { return obj && obj[key] !== undefined ? obj[key] : null; }

// Merge media types
Object.assign(MEDIA_EXTS, AUDIO_EXTS, VIDEO_EXTS);
Object.assign(VIEW_EXTS, MEDIA_EXTS);

var LS_RECENT  = 'fm_recent';
var LS_FILES   = 'fm_files';
var MAX_RECENT = 5;

/* ── State ───────────────────────────────────────────────────── */
var S = {
  root: null, sep: '/', selected: null, activeFile: null,
  isEditing: false, clipboard: null, recentFolders: [],
  fileCache: {}, platform: 'linux', tab: 'folder', ws: null,
  openDirs: {}, newItemContext: null,
  tree: [], _uploadFiles: [],
  enabledDownload: true,
  enabledUnzip:    true,
  maxUploadMB:     20,
  _treeDragActive: false
};

/* ── API ─────────────────────────────────────────────────────── */
function apiReq(method, url, body) {
  var opts = { method: method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  return fetch(url, opts).then(function(r) { return r.json(); });
}
var api = {
  get:  function(u)    { return apiReq('GET', u); },
  post: function(u, b) { return apiReq('POST', u, b); },
  put:  function(u, b) { return apiReq('PUT',  u, b); },
  del:  function(u)    { return apiReq('DELETE', u); },

  tree:     function(r)    { return api.get('/api/tree?root='    + enc(r)); },
  validate: function(p)    { return api.get('/api/validate?path='+ enc(p)); },
  file:     function(p)    { return api.get('/api/file?path='    + enc(p)); },
  save:     function(p, c) { return api.put('/api/file', {path:p, content:c}); },
  create:   function(p, c) { return api.post('/api/file', {path:p, content:c||''}); },
  mkdir:    function(p)    { return api.post('/api/mkdir', {path:p}); },
  deleteItem: function(p)  { return api.del('/api/file?path=' + enc(p)); },
  rename:   function(f, t) { return api.post('/api/rename', {from:f, to:t}); },
  copy:     function(f, t) { return api.post('/api/copy',   {from:f, to:t}); },
  search:   function(root, name, content) {
    return api.get('/api/search?root='+enc(root)+'&name='+enc(name)+'&content='+enc(content));
  },
  info:       function() { return api.get('/api/info'); },
  zip:    function(p)    { return api.post('/api/zip',    {path:p}); },
  unzip:  function(p)    { return api.post('/api/unzip',  {path:p}); },
  authStatus: function() { return api.get('/api/auth-status'); },
  login:  function(u, p) { return api.post('/api/login',  {user:u, pass:p}); },
  logout: function()     { return api.post('/api/logout'); },
  downloadUrl:     function(p) { return '/api/download?path=' + enc(p); },
  downloadZipUrl:  function(p) { return '/api/download-zip?path=' + enc(p); }
};
function enc(s) { return encodeURIComponent(s || ''); }

/* ═══════════════════════════════════════════════════════════════
   BOOT
═══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function() {
  applyI18n();
  loadStorage();
  api.authStatus().then(function(info) {
    if (info.useAuth && !info.ok) { showLogin(); return; }
    if (info.useAuth) $('btn-logout').style.display = 'inline-flex';
    bootApp();
  }).catch(function() { bootApp(); });
});

function bootApp() {
  $('login-screen').style.display = 'none';
  $('app').style.display = 'flex';
  api.info().then(function(info) {
    S.platform        = info.platform;
    S.sep             = info.sep;
    S.enabledDownload = info.enabledDownload !== false; // default true when no conf
    S.enabledUnzip    = info.enabledUnzip    !== false;
    S.maxUploadMB     = (typeof info.maxUploadMB === 'number' && info.maxUploadMB > 0)
                        ? info.maxUploadMB : 20;
    $('server-info').textContent = info.hostname + ' · ' + location.host;
    applyFeatureFlags();
  }).catch(function() {});

  bindTabs();
  bindToolbar();
  bindEditor();
  bindContextMenu();
  bindModalBackdrops();
  bindShortcuts();
  bindDragDrop();
  bindSearch();
  bindUpload();
  bindLongPress();
  bindTreeDragMove();
  connectWS();
  applyI18n();
  applyFeatureFlags(); // apply defaults immediately; will re-apply when api.info resolves

  var params  = new URLSearchParams(location.search);
  var urlRoot = params.get('root');
  if (urlRoot) {
    openRoot(urlRoot);
  } else if (S.recentFolders.length) {
    // Try recent folders sequentially until a valid one is found
    tryRecentFolders(0);
  }
}

function tryRecentFolders(idx) {
  if (idx >= S.recentFolders.length) return;
  var rf = S.recentFolders[idx];
  api.validate(rf).then(function(v) {
    if (v.valid && v.isDir) {
      openRoot(rf);
    } else {
      tryRecentFolders(idx + 1);
    }
  }).catch(function() { tryRecentFolders(idx + 1); });
}

function showLogin() {
  $('login-screen').style.display = 'flex';
  $('app').style.display = 'none';
  applyI18n();
  $('login-btn').onclick = function() {
    var u = $('login-user').value.trim();
    var p = $('login-pass').value;
    api.login(u, p).then(function(res) {
      if (res.ok) {
        $('btn-logout').style.display = 'inline-flex';
        bootApp();
      } else {
        var e = $('login-err');
        e.textContent = t('msgLoginFail');
        e.style.display = 'block';
      }
    }).catch(function() {});
  };
  $('login-pass').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') $('login-btn').click();
  });
}

/* ── Storage ─────────────────────────────────────────────────── */
function loadStorage() {
  try { S.recentFolders = JSON.parse(localStorage.getItem(LS_RECENT) || '[]'); } catch(e) { S.recentFolders = []; }
  try { S.fileCache     = JSON.parse(localStorage.getItem(LS_FILES)  || '{}'); } catch(e) { S.fileCache = {}; }
}
function saveRecent() { localStorage.setItem(LS_RECENT, JSON.stringify(S.recentFolders)); }
function saveCache()  { localStorage.setItem(LS_FILES,  JSON.stringify(S.fileCache)); }
function pushRecent(p) {
  var arr = [p];
  for (var i = 0; i < S.recentFolders.length; i++) {
    if (S.recentFolders[i] !== p) arr.push(S.recentFolders[i]);
  }
  S.recentFolders = arr.slice(0, MAX_RECENT);
  saveRecent();
}
function syncURL(root) {
  var u = new URL(location.href);
  if (root) u.searchParams.set('root', root);
  else u.searchParams.delete('root');
  history.replaceState({}, '', u.toString());
}

/* ═══════════════════════════════════════════════════════════════
   OPEN ROOT
═══════════════════════════════════════════════════════════════ */
function openRoot(rootPath) {
  rootPath = (rootPath || '').trim();
  if (!rootPath) return;
  closeModal('modal-open');
  statusMsg(t('msgLoading'));

  return api.validate(rootPath).then(function(v) {
    if (!v.valid) { showPathError(t('msgPathInvalid') + ': ' + (v.error || '')); return; }
    if (!v.isDir) { showPathError(t('msgPathNotDir')); return; }
    return api.tree(rootPath).then(function(res) {
      if (res.error) { statusMsg(t('msgError') + ': ' + res.error); return; }
      S.root     = rootPath;
      S.selected = null;
      // Keep openDirs state; only add root itself if not set yet
      if (!S.openDirs[rootPath]) S.openDirs[rootPath] = true;
      pushRecent(rootPath);
      syncURL(rootPath);
      $('toolbar-root-label').textContent = rootPath;
      renderTree(res.tree, $('file-tree'));
      updateStatus(rootPath);
      statusMsg(t('msgOpened'));
      watchRoot(rootPath);
    });
  }).catch(function(e) { statusMsg(t('msgConnErr') + ': ' + e.message); });
}

function showPathError(msg) {
  var e = $('path-error');
  e.textContent = msg;
  e.style.display = 'block';
}

/* ═══════════════════════════════════════════════════════════════
   TREE RENDERING
═══════════════════════════════════════════════════════════════ */
function renderTree(nodes, container) {
  S.tree = nodes; // store for nodeByPath lookup
  $('tree-empty').style.display = 'none';
  var existing = qsa('.tree-node', container);
  for (var i = 0; i < existing.length; i++) existing[i].parentNode.removeChild(existing[i]);
  var frag = document.createDocumentFragment();
  buildNodes(nodes, frag, 0);
  container.appendChild(frag);
}

function buildNodes(nodes, parent, depth) {
  for (var ni = 0; ni < nodes.length; ni++) {
    (function(node) {
      var wrapper = document.createElement('div');
      wrapper.className    = 'tree-node';
      wrapper.dataset.path = node.path;

      var item = document.createElement('div');
      item.className    = 'tree-item';
      item.style.paddingLeft = (depth * 16 + 6) + 'px';
      item.dataset.path = node.path;
      item.dataset.kind = node.kind;
      item.setAttribute('draggable', 'true');

      var toggle = document.createElement('span');
      toggle.className = node.kind === 'directory' ? 'tree-toggle' : 'tree-toggle leaf';
      if (node.kind === 'directory') {
        toggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9,6 15,12 9,18"/></svg>';
      }

      var icon = document.createElement('span');
      icon.className = 'tree-icon';
      var ext = getExt(node.name);
      if (node.kind === 'directory') {
        icon.className += ' ti-folder';
        icon.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
      } else if (ext === 'md') {
        icon.className += ' ti-md';   icon.innerHTML = fileIconSVG();
      } else if (node.isText) {
        icon.className += ' ti-txt';  icon.innerHTML = fileIconSVG();
      } else if (IMG_EXTS[ext] || ext === 'svg') {
        icon.className += ' ti-img';  icon.innerHTML = imgIconSVG();
      } else {
        icon.className += ' ti-other'; icon.innerHTML = fileIconSVG();
      }

      var nameEl = document.createElement('span');
      nameEl.className = 'tree-name';
      nameEl.textContent = node.name;
      if (!node.writable && node.kind === 'file') nameEl.className += ' name-readonly';

      item.appendChild(toggle);
      item.appendChild(icon);
      item.appendChild(nameEl);
      wrapper.appendChild(item);

      if (node.kind === 'directory') {
        var cw = document.createElement('div');
        cw.className = 'tree-children';
        var wasOpen = !!S.openDirs[node.path];
        cw.style.display = wasOpen ? 'block' : 'none';
        if (wasOpen) toggle.className += ' open';
        wrapper.appendChild(cw);

        item.addEventListener('click', function(e) {
          e.stopPropagation();
          selectItem(node, item);
          var nowOpen = toggle.className.indexOf('open') < 0;
          if (nowOpen) {
            toggle.className = 'tree-toggle open';
            cw.style.display = 'block';
            S.openDirs[node.path] = true;
            if (cw.childElementCount === 0) {
              api.tree(node.path).then(function(res) {
                if (!res.error) {
                  // Store children back into node for nodeByPath lookup
                  node.children = res.tree;
                  if (res.tree.length) buildNodes(res.tree, cw, depth + 1);
                  else cw.innerHTML = '<div class="empty-dir">(empty)</div>';
                }
              }).catch(function() {});
            }
          } else {
            toggle.className = 'tree-toggle';
            cw.style.display = 'none';
            delete S.openDirs[node.path];
          }
          updateStatus(node.path);
        setFileStats(null); // clear file stats for directories
        });
      } else {
        item.addEventListener('click', function(e) {
          e.stopPropagation();
          selectItem(node, item);
          updateStatus(node.path, node.name);
          setFileStats(node);
        });
        item.addEventListener('dblclick', function() { openFileNode(node); });
      }

      item.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        selectItem(node, item);
        showCtxMenu(e, node);
      });

      parent.appendChild(wrapper);
    })(nodes[ni]);
  }
}

function fileIconSVG() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>';
}
function imgIconSVG() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg>';
}

function selectItem(node, item) {
  var prev = qsa('.tree-item.selected');
  for (var i = 0; i < prev.length; i++) prev[i].className = prev[i].className.replace(' selected','').replace('selected ','').replace('selected','');
  item.className += ' selected';
  S.selected = node;
}

/* Highlight an item in the tree by path (after tree is rendered) */
function highlightInTree(filePath) {
  var allItems = qsa('.tree-item', $('file-tree'));
  for (var i = 0; i < allItems.length; i++) {
    var it = allItems[i];
    if (it.dataset && it.dataset.path === filePath) {
      // Clear previous selection
      var prev = qsa('.tree-item.selected');
      for (var j = 0; j < prev.length; j++) {
        prev[j].className = prev[j].className.replace(/\bselected\b/g, '').trim();
      }
      it.className += ' selected';
      it.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return true;
    }
  }
  return false;
}

/* ═══════════════════════════════════════════════════════════════
   OPEN FILE / VIEWER
═══════════════════════════════════════════════════════════════ */
function openFileNode(node) {
  if (node.kind !== 'file') return;
  if (isMedia(node.name))                        { openMedia(node);  return; }
  if (!node.isText && isViewable(node.name))     { openViewer(node); return; }
  if (node.isText)                               { openTextFile(node); return; }
  statusMsg(t('msgBinary'));
}

function openViewer(node) {
  var ext    = getExt(node.name);
  var rawUrl = '/api/raw?path=' + enc(node.path);
  $('viewer-title').textContent = node.name;
  var body = $('viewer-body');
  body.innerHTML = '';
  if (IMG_EXTS[ext] || ext === 'svg') {
    var img = document.createElement('img');
    img.src = rawUrl; img.alt = node.name; img.className = 'viewer-img';
    body.appendChild(img);
  } else if (ext === 'pdf') {
    var iframe = document.createElement('iframe');
    iframe.src = rawUrl; iframe.className = 'viewer-iframe';
    body.appendChild(iframe);
  } else if (ext === 'json') {
    fetch(rawUrl).then(function(r) { return r.text(); }).then(function(txt) {
      var pretty = txt;
      try { pretty = JSON.stringify(JSON.parse(txt), null, 2); } catch(e) {}
      var pre = document.createElement('pre');
      pre.className = 'viewer-json'; pre.textContent = pretty;
      body.appendChild(pre);
    }).catch(function() {});
  }
  openModal('modal-viewer');
}

function openTextFile(node) {
  var cached = S.fileCache[node.path];
  if (cached != null) {
    S.activeFile = { path: node.path, name: node.name, content: cached, writable: true };
    $('readonly-badge').style.display = 'none';
    $('editor-filename').textContent  = node.name;
    $('editor-empty').style.display   = 'none';
    S.isEditing = false;
    applyEditMode();
    updateStatus(node.path, node.name);
    switchTab('editor');
    return;
  }
  return api.file(node.path).then(function(res) {
    if (res.error) { statusMsg(t('msgError') + ': ' + res.error); return; }
    var writable = res.writable !== false;
    $('readonly-badge').style.display = writable ? 'none' : 'inline-flex';
    S.activeFile = { path: node.path, name: node.name, content: res.content, writable: writable };
    $('editor-filename').textContent = node.name;
    $('editor-empty').style.display  = 'none';
    S.isEditing = false;
    applyEditMode();
    updateStatus(node.path, node.name);
    switchTab('editor');
  }).catch(function(e) { statusMsg(t('msgConnErr') + ': ' + e.message); });
}

/* ═══════════════════════════════════════════════════════════════
   EDITOR
═══════════════════════════════════════════════════════════════ */
function bindEditor() {
  $('btn-edit-toggle').addEventListener('click', toggleEdit);
  $('btn-save').addEventListener('click', saveFile);
  $('btn-back-folder').addEventListener('click', function() {
    if (S.isEditing) {
      saveFile().then(function() { switchTab('folder'); });
    } else {
      switchTab('folder');
    }
  });
}

function toggleEdit() {
  if (!S.activeFile) return;
  if (!S.activeFile.writable) { statusMsg(t('msgPermission')); return; }
  S.isEditing = !S.isEditing;
  applyEditMode();
}

function applyEditMode() {
  if (!S.activeFile) return;
  var textarea  = $('editor-textarea');
  var preview   = $('preview-wrap');
  var label     = $('edit-label');
  var btnSave   = $('btn-save');
  var btnToggle = $('btn-edit-toggle');

  if (S.isEditing) {
    label.textContent = currentLang === 'ja' ? 'プレビュー' : 'Preview';
    btnToggle.className = btnToggle.className.indexOf('editing') < 0
      ? btnToggle.className + ' editing' : btnToggle.className;
    btnSave.style.display    = 'inline-flex';
    preview.style.display    = 'none';
    textarea.style.display   = 'block';
    textarea.style.webkitFlex = '1'; textarea.style.flex = '1';
    textarea.value = S.activeFile.content;
    textarea.focus();
  } else {
    label.textContent = t('edit');
    btnToggle.className = btnToggle.className.replace(/\bediting\b/g, '').trim();
    btnSave.style.display   = 'none';
    preview.style.display   = 'block';
    preview.style.webkitFlex = '1'; preview.style.flex = '1';
    textarea.style.display  = 'none';
    renderPreview(S.activeFile.content, S.activeFile.name, S.activeFile.path);
  }
}

function saveFile() {
  if (!S.activeFile) return Promise.resolve();
  if (!S.activeFile.writable) { statusMsg(t('msgPermission')); return Promise.resolve(); }
  var content = $('editor-textarea').value;
  S.activeFile.content = content;
  return api.save(S.activeFile.path, content).then(function(res) {
    if (res.error) throw new Error(res.error);
    delete S.fileCache[S.activeFile.path];
    saveCache();
    statusMsg(t('msgSaved'));
  }).catch(function() {
    S.fileCache[S.activeFile.path] = content;
    saveCache();
    statusMsg(t('msgSavedLocal'));
  }).then(function() {
    S.isEditing = false;
    applyEditMode();
  });
}

/* ── Markdown preview ─────────────────────────────────────────── */
function renderPreview(content, filename, filePath) {
  var el  = $('preview-content');
  var ext = getExt(filename);
  var baseDir = filePath
    ? filePath.split(S.sep).slice(0, -1).join(S.sep)
    : '';
  if (ext === 'md') {
    el.className = 'preview-content';
    el.innerHTML = parseMarkdown(content, baseDir);
  } else {
    el.className = 'preview-content plaintext';
    el.textContent = content;
  }
}

function parseMarkdown(raw, baseDir) {
  var lines = raw.split('\n');
  var out   = [];
  var inCode = false, codeLang = '', codeLines = [];
  var tableLines = [];

  function flushTable() {
    if (!tableLines.length) return;
    var rows = tableLines.filter(function(_, i) { return i !== 1; });
    var header = rows.shift() || '';
    var ths = splitRow(header).map(function(c) { return '<th>' + inlineMD(c, baseDir) + '</th>'; }).join('');
    var trs = rows.map(function(r) {
      return '<tr>' + splitRow(r).map(function(c) { return '<td>' + inlineMD(c, baseDir) + '</td>'; }).join('') + '</tr>';
    }).join('');
    out.push('<table><thead><tr>' + ths + '</tr></thead><tbody>' + trs + '</tbody></table>');
    tableLines = [];
  }

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (/^```/.test(line)) {
      if (!inCode) { inCode = true; codeLang = line.slice(3).trim(); codeLines = []; }
      else {
        out.push('<pre><code class="lang-' + esc(codeLang) + '">' + esc(codeLines.join('\n')) + '</code></pre>');
        inCode = false; codeLines = [];
      }
      continue;
    }
    if (inCode) { codeLines.push(line); continue; }
    if (/^\|/.test(line)) { tableLines.push(line); continue; }
    else if (tableLines.length) { flushTable(); }

    var hm = line.match(/^(#{1,6})\s+(.+)$/);
    if (hm) { out.push('<h' + hm[1].length + '>' + inlineMD(hm[2], baseDir) + '</h' + hm[1].length + '>'); continue; }
    if (/^[-*_]{3,}\s*$/.test(line)) { out.push('<hr>'); continue; }
    if (/^> /.test(line)) { out.push('<blockquote>' + inlineMD(line.slice(2), baseDir) + '</blockquote>'); continue; }
    if (/^[*-] /.test(line)) { out.push('<li class="ul-item">' + inlineMD(line.slice(2), baseDir) + '</li>'); continue; }
    if (/^\d+\. /.test(line)) { out.push('<li class="ol-item">' + inlineMD(line.replace(/^\d+\. /, ''), baseDir) + '</li>'); continue; }
    if (line.trim() === '') { out.push(''); continue; }
    out.push('<p>' + inlineMD(line, baseDir) + '</p>');
  }
  if (inCode) out.push('<pre><code>' + esc(codeLines.join('\n')) + '</code></pre>');
  if (tableLines.length) flushTable();

  var html = out.join('\n');
  // Wrap consecutive li items
  html = html.replace(/(<li class="ul-item">[\s\S]*?<\/li>\n?)+/g, function(m) {
    return '<ul>' + m.replace(/ class="ul-item"/g, '') + '</ul>';
  });
  html = html.replace(/(<li class="ol-item">[\s\S]*?<\/li>\n?)+/g, function(m) {
    return '<ol>' + m.replace(/ class="ol-item"/g, '') + '</ol>';
  });
  return html;
}

function splitRow(line) {
  return line.replace(/^\||\|$/g, '').split('|').map(function(c) { return c.trim(); });
}

function inlineMD(text, baseDir) {
  var codes = [];
  var s = text;
  // Protect inline code
  s = s.replace(/`([^`\n]+)`/g, function(_, c) {
    codes.push(esc(c));
    return '\x00C' + (codes.length - 1) + '\x00';
  });
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__(.+?)__/g, '<strong>$1</strong>');
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
  s = s.replace(/_(.+?)_/g, '<em>$1</em>');
  s = s.replace(/~~(.+?)~~/g, '<del>$1</del>');
  // Images before links
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, function(_, alt, src) {
    return '<img src="' + esc(resolveImg(src, baseDir)) + '" alt="' + esc(alt) + '" class="md-img">';
  });
  // Links — carefully avoid capturing trailing punctuation
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function(_, label, href) {
    return '<a href="' + esc(href) + '" target="_blank" rel="noopener">' + label + '</a>';
  });
  // Auto-links: bare http URLs not already inside an attribute
  s = s.replace(/(^|[^"'=])(https?:\/\/[^\s<>"']+)/g, function(_, pre, url) {
    return pre + '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(url) + '</a>';
  });
  s = s.replace(/\[ \] /g, '<input type="checkbox" disabled> ');
  s = s.replace(/\[x\] /gi, '<input type="checkbox" checked disabled> ');
  // Restore code
  s = s.replace(/\x00C(\d+)\x00/g, function(_, i) { return '<code>' + codes[+i] + '</code>'; });
  return s;
}

function resolveImg(src, baseDir) {
  if (/^https?:\/\//.test(src)) return src;
  if (!baseDir) return src;
  var full = baseDir + S.sep + src.replace(/\//g, S.sep);
  return '/api/raw?path=' + enc(full);
}

/* ═══════════════════════════════════════════════════════════════
   TABS
═══════════════════════════════════════════════════════════════ */
/**
 * Apply feature flags from server config.
 * Hide/show download and unzip context menu items and toolbar.
 */
function applyFeatureFlags() {
  var menu = $('ctx-menu');
  if (!menu) return;
  // Download context menu item
  qsa('[data-action="download"]', menu).forEach(function(el) {
    el.style.display = S.enabledDownload ? 'flex' : 'none';
  });
  // Unzip context menu item (ctx-zip-only) — permanently hide when disabled
  if (!S.enabledUnzip) {
    qsa('.ctx-zip-only', menu).forEach(function(el) {
      el.style.display = 'none';
    });
  }
  // Keyboard shortcut Ctrl+D: guard is handled inline in bindShortcuts
}

function bindTabs() {
  var tabs = qsa('.tab');
  for (var i = 0; i < tabs.length; i++) {
    (function(btn) {
      btn.addEventListener('click', function() { switchTab(btn.dataset.tab); });
    })(tabs[i]);
  }
}
function switchTab(name) {
  var tabs  = qsa('.tab');
  var panes = qsa('.pane');
  for (var i = 0; i < tabs.length; i++)
    tabs[i].className = tabs[i].className.replace(/\bactive\b/g,'').trim() + (tabs[i].dataset.tab === name ? ' active' : '');
  for (var j = 0; j < panes.length; j++)
    panes[j].className = panes[j].className.replace(/\bactive\b/g,'').trim() + (panes[j].id === 'pane-' + name ? ' active' : '');
  S.tab = name;
}

/* ═══════════════════════════════════════════════════════════════
   TOOLBAR
═══════════════════════════════════════════════════════════════ */
function bindToolbar() {
  $('btn-open').addEventListener('click', openFolderModal);
  var hero = $('btn-open-hero');
  if (hero) hero.addEventListener('click', openFolderModal);
  $('btn-new-file').addEventListener('click',   function() { promptNew('file'); });
  $('btn-new-folder').addEventListener('click', function() { promptNew('folder'); });
  $('btn-search').addEventListener('click', openSearch);
  $('btn-path-go').addEventListener('click', function() {
    $('path-error').style.display = 'none';
    openRoot($('path-input').value);
  });
  $('path-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { $('path-error').style.display = 'none'; openRoot($('path-input').value); }
  });
  $('btn-logout').addEventListener('click', function() {
    api.logout().then(function() { location.reload(); }).catch(function() { location.reload(); });
  });
}

function openFolderModal() {
  $('path-error').style.display = 'none';
  if (S.root) $('path-input').value = S.root;
  renderRecentList();
  openModal('modal-open');
  setTimeout(function() { $('path-input').select(); }, 50);
}

function renderRecentList() {
  var list  = $('recent-list');
  var count = $('recent-count');
  count.textContent = S.recentFolders.length ? '(' + S.recentFolders.length + ')' : '';
  list.innerHTML = '';
  if (!S.recentFolders.length) {
    list.innerHTML = '<div class="no-recent">' + t('noRecent') + '</div>';
    return;
  }
  for (var idx = 0; idx < S.recentFolders.length; idx++) {
    (function(rp, i) {
      var item = document.createElement('div');
      item.className = 'recent-item';
      item.innerHTML =
        '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>' +
        '<span class="recent-path" title="' + esc(rp) + '">' + esc(rp) + '</span>' +
        '<button class="recent-del">✕</button>';
      item.querySelector('.recent-path').addEventListener('click', function() { openRoot(rp); });
      item.querySelector('.recent-del').addEventListener('click', function(e) {
        e.stopPropagation();
        S.recentFolders.splice(i, 1);
        saveRecent();
        renderRecentList();
      });
      list.appendChild(item);
    })(S.recentFolders[idx], idx);
  }
}

/* ═══════════════════════════════════════════════════════════════
   CONTEXT MENU
═══════════════════════════════════════════════════════════════ */
function bindContextMenu() {
  document.addEventListener('click', hideCtx);
  document.addEventListener('scroll', hideCtx, true);
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { hideCtx(); closeAllModals(); }
  });
  var items = qsa('.ctx-item');
  for (var i = 0; i < items.length; i++) {
    (function(item) {
      item.addEventListener('click', function(e) {
        e.stopPropagation();
        handleCtx(item.dataset.action);
        hideCtx();
      });
    })(items[i]);
  }
}

function showCtxMenu(e, node) {
  var menu = $('ctx-menu');
  var ext  = getExt(node.name);
  var isDir  = node.kind === 'directory';
  var isFile = node.kind === 'file';
  var isZip  = isFile && ext === 'zip';

  // Show/hide each conditional item by class
  // ctx-text-only: edit text (text files only)
  qsa('.ctx-text-only', menu).forEach(function(el) {
    el.style.display = (isFile && node.isText) ? 'flex' : 'none';
  });
  // ctx-dir-only: set-root (directories only)
  qsa('.ctx-dir-only', menu).forEach(function(el) {
    el.style.display = isDir ? 'flex' : 'none';
  });
  // ctx-zip-only: unzip (.zip files only) — also check enabledUnzip flag
  qsa('.ctx-zip-only', menu).forEach(function(el) {
    el.style.display = (isZip && S.enabledUnzip) ? 'flex' : 'none';
  });
  // ctx-dir-zip: compress to zip (directories OR non-zip files; NOT .zip files themselves)
  qsa('.ctx-dir-zip', menu).forEach(function(el) {
    el.style.display = (isDir || (isFile && !isZip)) ? 'flex' : 'none';
  });
  // download item visibility (flag-controlled; already set by applyFeatureFlags but re-apply here)
  qsa('[data-action="download"]', menu).forEach(function(el) {
    el.style.display = S.enabledDownload ? 'flex' : 'none';
  });

  menu.style.display = 'block';
  setTimeout(function() {
    var x = Math.min(e.clientX, window.innerWidth  - menu.offsetWidth  - 8);
    var y = Math.min(e.clientY, window.innerHeight - menu.offsetHeight - 8);
    menu.style.left = x + 'px';
    menu.style.top  = y + 'px';
  }, 0);
}
function hideCtx() { $('ctx-menu').style.display = 'none'; }

function handleCtx(action) {
  var node = S.selected;
  switch (action) {
    case 'open':       if (node) openFileNode(node); break;
    case 'edit':
      if (node) {
        openTextFile(node).then(function() { S.isEditing = true; applyEditMode(); });
      }
      break;
    case 'set-root':   if (node && node.kind === 'directory') openRoot(node.path); break;
    case 'new-file':   S.newItemContext = node; promptNew('file'); break;
    case 'new-folder': S.newItemContext = node; promptNew('folder'); break;
    case 'cut':        doCut(); break;
    case 'copy':       doCopy(); break;
    case 'paste':      doPaste(); break;
    case 'rename':     startRename(); break;
    case 'delete':     confirmDelete(); break;
    case 'zip':        doZip(); break;
    case 'unzip':      doUnzip(); break;
    case 'upload':     openUpload(); break;
    case 'download':   doDownload(); break;
  }
}

/* ═══════════════════════════════════════════════════════════════
   CLIPBOARD
═══════════════════════════════════════════════════════════════ */
function doCopy() {
  if (!S.selected) return;
  S.clipboard = { action: 'copy', node: S.selected };
  statusMsg(t('ctxCopy') + ': ' + S.selected.name);
}
function doCut() {
  if (!S.selected) return;
  S.clipboard = { action: 'cut', node: S.selected };
  statusMsg(t('ctxCut') + ': ' + S.selected.name);
}
function doPaste() {
  if (!S.clipboard) { statusMsg(t('msgPasteEmpty')); return; }
  var action = S.clipboard.action, node = S.clipboard.node;
  var destDir = S.root;
  if (S.selected) destDir = S.selected.kind === 'directory' ? S.selected.path : parentPath(S.selected.path);
  var dest = destDir + S.sep + node.name;
  var p = action === 'copy'
    ? api.copy(node.path, dest).then(function(r) { if (r.error) throw new Error(r.error); statusMsg(t('msgCopied') + ': ' + node.name); })
    : api.rename(node.path, dest).then(function(r) { if (r.error) throw new Error(r.error); S.clipboard = null; statusMsg(t('msgMoved') + ': ' + node.name); });
  p.then(function() { return openRoot(S.root); }).catch(function(e) { statusMsg(t('msgError') + ': ' + e.message); });
}
function parentPath(p) {
  var pts = p.split(S.sep);
  pts.pop();
  return pts.join(S.sep) || S.root;
}

/* ═══════════════════════════════════════════════════════════════
   RENAME
═══════════════════════════════════════════════════════════════ */
function startRename() {
  if (!S.selected) return;
  var node  = S.selected;
  var input = $('rename-input');
  input.value = node.name;
  openModal('modal-rename');
  setTimeout(function() { input.select(); input.focus(); }, 50);

  function doRename() {
    var newName = input.value.trim();
    if (!newName || newName === node.name) { closeModal('modal-rename'); return; }
    var pts = node.path.split(S.sep);
    pts[pts.length - 1] = newName;
    var newPath = pts.join(S.sep);
    api.rename(node.path, newPath).then(function(r) {
      if (r.error) throw new Error(r.error);
      closeModal('modal-rename');
      statusMsg(t('msgRenamed') + ': ' + newName);
      return openRoot(S.root);
    }).catch(function(e) { statusMsg(t('msgError') + ': ' + e.message); });
  }
  $('btn-rename-ok').onclick = doRename;
  $('btn-rename-no').onclick = function() { closeModal('modal-rename'); };
  input.onkeydown = function(e) {
    if (e.key === 'Enter') doRename();
    if (e.key === 'Escape') closeModal('modal-rename');
  };
}

/* ═══════════════════════════════════════════════════════════════
   DELETE
═══════════════════════════════════════════════════════════════ */
function confirmDelete() {
  if (!S.selected) return;
  var node = S.selected;
  $('confirm-msg').textContent = '"' + node.name + '" ' +
    (currentLang === 'ja' ? 'を削除しますか？この操作は取り消せません。' : '— delete permanently?');
  openModal('modal-confirm');
  $('btn-confirm-ok').onclick = function() {
    api.deleteItem(node.path).then(function(r) {
      if (r.error) throw new Error(r.error);
      closeModal('modal-confirm');
      S.selected = null;
      statusMsg(t('msgDeleted') + ': ' + node.name);
      return openRoot(S.root);
    }).catch(function(e) { statusMsg(t('msgError') + ': ' + e.message); });
  };
  $('btn-confirm-no').onclick = function() { closeModal('modal-confirm'); };
}

/* ═══════════════════════════════════════════════════════════════
   NEW FILE / FOLDER
═══════════════════════════════════════════════════════════════ */
function promptNew(type) {
  var ctx = S.newItemContext || S.selected;
  S.newItemContext = null;
  $('new-modal-title').textContent = type === 'file' ? t('newFile') : t('newFolder');
  var input = $('new-name-input');
  input.value = type === 'file' ? 'untitled.md' : 'NewFolder';
  openModal('modal-new');
  setTimeout(function() { input.select(); input.focus(); }, 50);

  function doCreate() {
    var name = input.value.trim();
    if (!name) return;
    var parentDir = S.root;
    if (ctx) parentDir = ctx.kind === 'directory' ? ctx.path : parentPath(ctx.path);
    var newPath = parentDir + S.sep + name;
    var p = type === 'file' ? api.create(newPath, '') : api.mkdir(newPath);
    p.then(function(r) {
      if (r.error) throw new Error(r.error);
      closeModal('modal-new');
      statusMsg(t('msgCreated') + ': ' + name);
      // Keep parent directory open
      S.openDirs[parentDir] = true;
      return openRoot(S.root).then(function() {
        setTimeout(function() { highlightInTree(newPath); }, 200);
      });
    }).catch(function(e) { statusMsg(t('msgError') + ': ' + e.message); });
  }
  $('btn-new-ok').onclick = doCreate;
  $('btn-new-no').onclick = function() { closeModal('modal-new'); };
  input.onkeydown = function(e) {
    if (e.key === 'Enter') doCreate();
    if (e.key === 'Escape') closeModal('modal-new');
  };
}

/* ═══════════════════════════════════════════════════════════════
   SEARCH  (Fixed: navigates tree correctly; includes directories)
═══════════════════════════════════════════════════════════════ */
function bindSearch() {
  $('search-content-chk').addEventListener('change', function(e) {
    $('search-content').style.display = e.target.checked ? 'block' : 'none';
  });
  $('btn-search-go').addEventListener('click', doSearch);
  $('btn-search-clear').addEventListener('click', function() {
    $('search-name').value = '';
    $('search-content').value = '';
    $('search-content-chk').checked = false;
    $('search-content').style.display = 'none';
    $('search-results').innerHTML = '';
    $('search-status').textContent = '';
  });
  $('search-name').addEventListener('keydown',    function(e) { if (e.key === 'Enter') doSearch(); });
  $('search-content').addEventListener('keydown', function(e) { if (e.key === 'Enter') doSearch(); });
}

function openSearch() {
  if (!S.root) { statusMsg(t('msgNoRoot')); return; }
  openModal('modal-search');
  setTimeout(function() { $('search-name').focus(); }, 50);
}

function doSearch() {
  if (!S.root) return;
  var name       = $('search-name').value.trim();
  var useContent = $('search-content-chk').checked;
  var content    = useContent ? $('search-content').value.trim() : '';
  $('search-status').textContent  = t('msgSearching');
  $('search-results').innerHTML   = '';

  api.search(S.root, name, content).then(function(res) {
    if (res.error) { $('search-status').textContent = t('msgError') + ': ' + res.error; return; }
    var results = res.results || [];
    $('search-status').textContent = results.length
      ? results.length + ' ' + t('msgSearchDone')
      : t('msgSearchNone');
    renderSearchResults(results);
  }).catch(function(e) { $('search-status').textContent = t('msgConnErr') + ': ' + e.message; });
}

function renderSearchResults(results) {
  var container = $('search-results');
  container.innerHTML = '';
  for (var ri = 0; ri < results.length; ri++) {
    (function(item) {
      var el = document.createElement('div');
      el.className = 'search-result-item';
      var relPath = (S.root && item.path.indexOf(S.root) === 0)
        ? item.path.slice(S.root.length + 1) : item.path;
      var iconSVG = item.kind === 'directory'
        ? '<svg viewBox="0 0 16 16" fill="currentColor" style="color:#f4c04f"><path d="M1 4a1 1 0 0 1 1-1h3l1.5 1.5H14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1z"/></svg>'
        : '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6z"/><polyline points="9,2 9,6 13,6"/></svg>';
      var dirLabel = item.kind === 'directory' ? ' <span class="search-dir-badge">' + t('msgDirMatch') + '</span>' : '';
      el.innerHTML = iconSVG +
        '<div class="search-result-info">' +
          '<span class="search-result-name">' + esc(item.name) + dirLabel + '</span>' +
          '<span class="search-result-path">' + esc(relPath)  + '</span>' +
        '</div>';

      el.addEventListener('click', function() {
        closeModal('modal-search');
        switchTab('folder');
        // Open all ancestor directories
        var pts = item.path.split(S.sep);
        for (var i = 1; i < pts.length - 1; i++) {
          S.openDirs[pts.slice(0, i + 1).join(S.sep)] = true;
        }
        // For directories, open it too
        if (item.kind === 'directory') {
          S.openDirs[item.path] = true;
        }
        // Re-render tree, then highlight
        openRoot(S.root).then(function() {
          setTimeout(function() {
            var found = highlightInTree(item.path);
            if (found) {
              S.selected = item;
              updateStatus(item.path, item.kind === 'directory' ? '' : item.name);
            }
          }, 250);
        });
      });
      container.appendChild(el);
    })(results[ri]);
  }
}

/* ═══════════════════════════════════════════════════════════════
   DRAG & DROP
═══════════════════════════════════════════════════════════════ */
function bindDragDrop() {
  var tree = $('file-tree');
  tree.addEventListener('dragover', function(e) {
    // If dragging a tree item internally, skip external-file drop
    if (S._treeDragActive) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (tree.className.indexOf('drag-active') < 0) tree.className += ' drag-active';
  });
  tree.addEventListener('dragleave', function(e) {
    if (!tree.contains(e.relatedTarget))
      tree.className = tree.className.replace(/\bdrag-active\b/g, '').trim();
  });
  tree.addEventListener('drop', function(e) {
    // Skip internal tree drag-move operations
    if (S._treeDragActive) return;
    if (!e.dataTransfer.files || !e.dataTransfer.files.length) return;
    e.preventDefault();
    tree.className = tree.className.replace(/\bdrag-active\b/g, '').trim();
    if (!S.root) { statusMsg(t('msgNoRoot')); return; }
    var destDir = S.root;
    if (S.selected && S.selected.kind === 'directory') destDir = S.selected.path;
    var files = Array.prototype.slice.call(e.dataTransfer.files);
    var fd = new FormData();
    for (var i = 0; i < files.length; i++) fd.append('file', files[i], files[i].name);
    fetch('/api/upload?dest=' + enc(destDir), { method: 'POST', body: fd })
      .then(function(r) { return r.json(); })
      .then(function(res) {
        var results = res.results || (res.ok ? [res] : []);
        var count = results.filter(function(r) { return r.ok; }).length;
        statusMsg(count + ' ' + t('msgAdded'));
        S.openDirs[destDir] = true;
        return openRoot(S.root);
      }).catch(function() {});
  });
}

/* ═══════════════════════════════════════════════════════════════
   WEBSOCKET
═══════════════════════════════════════════════════════════════ */
function connectWS() {
  try {
    S.ws = new WebSocket('ws://' + location.host);
    S.ws.addEventListener('message', function(e) {
      try {
        var msg = JSON.parse(e.data);
        if (msg.type === 'change' && S.root) {
          clearTimeout(S._wsTimer);
          S._wsTimer = setTimeout(function() { openRoot(S.root); }, 500);
        }
      } catch(ex) {}
    });
    S.ws.addEventListener('error', function() {});
  } catch(e) {}
}
function watchRoot(p) {
  if (S.ws && S.ws.readyState === 1) {
    S.ws.send(JSON.stringify({ type: 'watch', path: p }));
  }
}

/* ═══════════════════════════════════════════════════════════════
   MODALS
═══════════════════════════════════════════════════════════════ */
function bindModalBackdrops() {
  var bgs = qsa('.modal-bg');
  for (var i = 0; i < bgs.length; i++) {
    (function(bg) {
      bg.addEventListener('click', function() { closeModal(bg.dataset.close); });
    })(bgs[i]);
  }
  var xs = qsa('[data-close].modal-x');
  for (var j = 0; j < xs.length; j++) {
    (function(btn) {
      btn.addEventListener('click', function() { closeModal(btn.dataset.close); });
    })(xs[j]);
  }
}
function openModal(id)    { if ($(id)) $(id).style.display = 'flex'; }
function closeModal(id)   { if ($(id)) $(id).style.display = 'none'; }
function closeAllModals() {
  var ms = qsa('.modal');
  for (var i = 0; i < ms.length; i++) ms[i].style.display = 'none';
}

/* ═══════════════════════════════════════════════════════════════
   STATUS BAR
═══════════════════════════════════════════════════════════════ */
/**
 * Display file size and timestamps in the status bar.
 */
function setFileStats(node) {
  var el = $('status-stats');
  if (!el) return;
  if (!node || node.kind !== 'file') { el.textContent = ''; return; }
  var parts = [];
  if (node.size != null) {
    var s = node.size;
    var sizeStr = s >= 1073741824 ? (s / 1073741824).toFixed(1) + ' GB'
                : s >= 1048576   ? (s / 1048576).toFixed(1)   + ' MB'
                : s >= 1024      ? Math.round(s / 1024)        + ' KB'
                : s + ' B';
    parts.push(sizeStr);
  }
  if (node.mtime) {
    parts.push((currentLang === 'ja' ? '更新: ' : 'mod: ') + formatDate(new Date(node.mtime)));
  }
  if (node.birthtime && Math.abs(node.birthtime - node.mtime) > 1000) {
    parts.push((currentLang === 'ja' ? '作成: ' : 'cre: ') + formatDate(new Date(node.birthtime)));
  }
  el.textContent = parts.join('  │  ');
}

function formatDate(d) {
  var pad = function(n) { return n < 10 ? '0' + n : '' + n; };
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
       + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}


function updateStatus(pathStr, file) {
  $('status-path').textContent = pathStr || '—';
  $('status-file').textContent = file || '';
  $('status-sep').style.display = file ? 'inline' : 'none';
}
var _msgTimer;
function statusMsg(msg) {
  $('status-msg').textContent = msg;
  clearTimeout(_msgTimer);
  _msgTimer = setTimeout(function() { $('status-msg').textContent = ''; }, 4500);
}

/* ═══════════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
═══════════════════════════════════════════════════════════════ */
function bindShortcuts() {
  document.addEventListener('keydown', function(e) {
    var ctrl    = e.ctrlKey || e.metaKey;
    var active  = document.activeElement;
    var inInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');

    if (ctrl && e.key === 'o') { e.preventDefault(); openFolderModal(); return; }
    if (ctrl && e.key === 's') { e.preventDefault(); saveFile(); return; }
    if (ctrl && e.key === 'u') { e.preventDefault(); openUpload(); return; }
    if (ctrl && e.key === 'd' && S.enabledDownload) { e.preventDefault(); doDownload(); return; }
    if (!inInput) {
      if (ctrl && e.key === 'c') { e.preventDefault(); doCopy(); return; }
      if (ctrl && e.key === 'x') { e.preventDefault(); doCut(); return; }
      if (ctrl && e.key === 'v') { e.preventDefault(); doPaste(); return; }
      if (ctrl && e.key === 'Delete') { e.preventDefault(); confirmDelete(); return; }
    }
    if (e.key === 'F2') { e.preventDefault(); startRename(); return; }
    if (e.key === 'F3') { e.preventDefault(); openSearch(); return; }
    if (e.key === 'F9') {
      e.preventDefault();
      if (S.tab === 'editor') {
        if (S.isEditing) { saveFile().then(function() { switchTab('folder'); }); }
        else switchTab('folder');
      }
      return;
    }
    if (e.key === 'F10') {
      e.preventDefault();
      if (S.tab === 'editor' && S.activeFile) {
        toggleEdit();
      } else if (S.tab === 'folder' && S.selected && S.selected.kind === 'file' && S.selected.isText) {
        openTextFile(S.selected).then(function() { S.isEditing = true; applyEditMode(); });
      }
      return;
    }
    if (!inInput && S.tab === 'folder') arrowNav(e);
  });
}

function arrowNav(e) {
  var keys = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
  if (keys.indexOf(e.key) < 0) return;
  e.preventDefault();
  var items = qsa('.tree-item', $('file-tree'));
  if (!items.length) return;
  var cur = $('file-tree').querySelector('.tree-item.selected');
  var idx = cur ? items.indexOf(cur) : -1;
  if (e.key === 'ArrowDown')       idx = Math.min(idx + 1, items.length - 1);
  else if (e.key === 'ArrowUp')    idx = Math.max(idx - 1, 0);
  else if (e.key === 'ArrowRight' && cur) { cur.click(); return; }
  else if (e.key === 'ArrowLeft'  && cur) {
    var parentCW   = cur.closest ? cur.closest('.tree-children') : null;
    var parentNode = parentCW ? (parentCW.closest ? parentCW.closest('.tree-node') : null) : null;
    var parentItem = parentNode ? parentNode.querySelector('.tree-item') : null;
    if (parentItem) { parentItem.click(); return; }
  }
  if (idx >= 0) {
    items[idx].click();
    items[idx].scrollIntoView({ block: 'nearest' });
  }
}

/* ═══════════════════════════════════════════════════════════════
   MEDIA PLAYER
   Opens audio/video files in a modal player
═══════════════════════════════════════════════════════════════ */
function openMedia(node) {
  var ext    = getExt(node.name);
  var rawUrl = '/api/raw?path=' + enc(node.path);
  $('media-title').textContent = node.name;
  var body = $('media-body');
  body.innerHTML = '';

  var el;
  if (AUDIO_EXTS[ext]) {
    el = document.createElement('audio');
    el.controls = true;
    el.autoplay = false;
  } else {
    el = document.createElement('video');
    el.controls = true;
    el.autoplay = false;
    el.style.maxWidth = '100%';
    el.style.maxHeight = '65vh';
  }
  el.src = rawUrl;
  el.preload = 'metadata';
  body.appendChild(el);

  // Stop playback when modal closes
  var bg = $('modal-media').querySelector('.modal-bg');
  var closeBtn = $('modal-media').querySelector('.modal-x');
  function stopAndClose() {
    el.pause();
    el.src = '';
    closeModal('modal-media');
  }
  if (bg)      bg.onclick      = stopAndClose;
  if (closeBtn) closeBtn.onclick = stopAndClose;

  openModal('modal-media');
}

/* ═══════════════════════════════════════════════════════════════
   ZIP / UNZIP
═══════════════════════════════════════════════════════════════ */
function doZip() {
  if (!S.selected) return;
  var node = S.selected;
  // Allow both directories and files to be zipped
  if (node.kind !== 'directory' && node.kind !== 'file') return;
  statusMsg(t('msgZipping'));
  api.zip(node.path).then(function(res) {
    if (res.error) { statusMsg(t('msgError') + ': ' + res.error); return; }
    statusMsg(t('ctxZipDone') + ': ' + (res.dest || ''));
    return openRoot(S.root);
  }).catch(function(e) { statusMsg(t('msgError') + ': ' + e.message); });
}

function doUnzip() {
  if (!S.enabledUnzip) return; // disabled by conf
  if (!S.selected || S.selected.kind !== 'file') return;
  var node = S.selected;
  statusMsg(t('msgUnzipping'));
  api.unzip(node.path).then(function(res) {
    if (res.error) { statusMsg(t('msgError') + ': ' + res.error); return; }
    statusMsg(t('ctxUnzipDone') + ': ' + (res.dest || ''));
    return openRoot(S.root);
  }).catch(function(e) { statusMsg(t('msgError') + ': ' + e.message); });
}

/* ═══════════════════════════════════════════════════════════════
   DOWNLOAD
   Ctrl+D  /  context menu → Download
   File → direct download; Folder → zip then download
═══════════════════════════════════════════════════════════════ */
function doDownload() {
  if (!S.enabledDownload) return; // disabled by conf
  if (!S.selected) return; // no selection → do nothing
  var node = S.selected;
  var url;
  if (node.kind === 'directory') {
    // Zip on-the-fly via server, then trigger download
    url = api.downloadZipUrl(node.path);
    statusMsg(t('msgZipping'));
  } else {
    url = api.downloadUrl(node.path);
  }
  // Trigger browser download by creating a temporary <a> and clicking it
  var a = document.createElement('a');
  a.href = url;
  a.download = node.kind === 'directory' ? node.name + '.zip' : node.name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(function() {
    document.body.removeChild(a);
    if (node.kind !== 'directory') statusMsg(t('msgDownloading') || 'Downloading…');
  }, 100);
}

/* ═══════════════════════════════════════════════════════════════
   FILE UPLOAD (modal + drag-into-zone)
   Ctrl+U shortcut / toolbar button
═══════════════════════════════════════════════════════════════ */
function openUpload() {
  if (!S.root) { statusMsg(t('msgNoRoot')); return; }
  var dest = S.root;
  if (S.selected && S.selected.kind === 'directory') dest = S.selected.path;
  else if (S.selected && S.selected.kind === 'file')  dest = parentPath(S.selected.path);
  $('upload-dest-path').textContent = dest;
  $('upload-file-list').innerHTML = '';
  $('upload-file-input').value = '';
  S._uploadFiles = [];
  // Show size limit in modal
  var limitEl = $('upload-size-limit');
  if (limitEl) limitEl.textContent = t('uploadSizeLimit') + ': ' + S.maxUploadMB + ' MB';
  openModal('modal-upload');
}

function bindUpload() {
  var dropZone  = $('upload-drop-zone');
  var fileInput = $('upload-file-input');
  var goBtn     = $('btn-upload-go');
  var toolbar   = $('btn-upload');
  var selectBtn = $('btn-select-files');

  // Toolbar upload button
  if (toolbar) toolbar.addEventListener('click', openUpload);

  // "Select Files" button inside modal — explicit click on input (iOS-safe)
  if (selectBtn) {
    selectBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      // Reset value so same file can be re-selected on iOS
      fileInput.value = '';
      fileInput.click();
    });
  }

  // Drop zone click (desktop) — also triggers picker
  dropZone.addEventListener('click', function(e) {
    // Avoid double-trigger when btn-select-files is inside drop zone
    if (e.target && e.target.closest && e.target.closest('#btn-select-files')) return;
    if (e.target && e.target.id === 'btn-select-files') return;
    fileInput.value = '';
    fileInput.click();
  });

  // File selection — guard against double-fire on iOS (both 'change' and 'input' may fire)
  var _selectionHandled = false;
  function onFilesSelected() {
    if (_selectionHandled) return;
    var files = Array.prototype.slice.call(fileInput.files || []);
    if (!files.length) return;
    _selectionHandled = true;
    addUploadFiles(files);
    // Reset flag and input after a tick so same file can be re-picked
    setTimeout(function() { _selectionHandled = false; fileInput.value = ''; }, 200);
  }
  fileInput.addEventListener('change', onFilesSelected);
  fileInput.addEventListener('input',  onFilesSelected); // iOS fallback

  // Drag-over drop zone (desktop)
  dropZone.addEventListener('dragover', function(e) {
    e.preventDefault();
    if (dropZone.className.indexOf('drag-over') < 0)
      dropZone.className += ' drag-over';
  });
  dropZone.addEventListener('dragleave', function() {
    dropZone.className = dropZone.className.replace(/\s*drag-over\b/g, '');
  });
  dropZone.addEventListener('drop', function(e) {
    e.preventDefault();
    dropZone.className = dropZone.className.replace(/\s*drag-over\b/g, '');
    addUploadFiles(Array.prototype.slice.call(e.dataTransfer.files));
  });

  goBtn.addEventListener('click', executeUpload);
}

function addUploadFiles(files) {
  S._uploadFiles = S._uploadFiles || [];
  var limitBytes = S.maxUploadMB * 1024 * 1024;
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    if (f.size > limitBytes) {
      // Mark oversized files so they show as errors immediately
      f._oversized = true;
    }
    S._uploadFiles.push(f);
  }
  renderUploadFileList();
}

function renderUploadFileList() {
  var container = $('upload-file-list');
  container.innerHTML = '';
  var files = S._uploadFiles || [];
  for (var i = 0; i < files.length; i++) {
    (function(f) {
      var item = document.createElement('div');
      item.className = 'upload-file-item';
      var sizeStr = f.size > 1048576
        ? (f.size / 1048576).toFixed(1) + ' MB'
        : (f.size > 1024 ? (f.size / 1024).toFixed(0) + ' KB' : f.size + ' B');
      var oversized = f._oversized;
      var initStatus = oversized
        ? '<span class="uf-status uf-err" id="uf-status-' + i + '">✗ ' + t('uploadTooLarge') + '</span>'
        : '<span class="uf-status uf-wait" id="uf-status-' + i + '">…</span>';
      item.innerHTML =
        '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6z"/><polyline points="9,2 9,6 13,6"/></svg>' +
        '<span class="uf-name' + (oversized ? ' uf-oversized' : '') + '">' + esc(f.name) + '</span>' +
        '<span class="uf-size">' + sizeStr + '</span>' +
        initStatus;
      container.appendChild(item);
    })(files[i]);
  }
}

function executeUpload() {
  var files = S._uploadFiles || [];
  if (!files.length) { closeModal('modal-upload'); return; }
  var dest  = $('upload-dest-path').textContent || S.root;
  var total = files.length, failed = 0;
  var goBtn = $('btn-upload-go');
  goBtn.disabled = true;
  var lastName = '';

  function uploadOne(idx) {
    if (idx >= files.length) {
      // All done
      goBtn.disabled = false;
      var ok = total - failed;
      statusMsg(t('msgUploaded') + ': ' + ok + '/' + total);
      S._uploadFiles = [];
      closeModal('modal-upload');
      S.openDirs[dest] = true;
      openRoot(S.root).then(function() {
        if (lastName) {
          setTimeout(function() {
            highlightInTree(dest + S.sep + lastName);
          }, 300);
        }
      });
      return;
    }

    var f       = files[idx];
    var statusEl = document.getElementById('uf-status-' + idx);
    lastName = f.name;

    // Skip files flagged as oversized (already shown as error in list)
    if (f._oversized) {
      failed++;
      uploadOne(idx + 1);
      return;
    }

    // Use FormData + fetch for proper binary upload
    var fd  = new FormData();
    fd.append('file', f, f.name);
    var uploadUrl = '/api/upload?dest=' + enc(dest);

    fetch(uploadUrl, { method: 'POST', body: fd })
      .then(function(r) { return r.json(); })
      .then(function(res) {
        var ok = res.ok || (res.results && res.results[0] && res.results[0].ok);
        var errMsg = res.error || (res.results && res.results[0] && res.results[0].error) || '';
        if (!ok) {
          failed++;
          var errTxt = errMsg ? ('✗ ' + errMsg) : '✗';
          if (statusEl) { statusEl.textContent = errTxt; statusEl.className = 'uf-status uf-err'; }
        } else {
          if (statusEl) { statusEl.textContent = '✓'; statusEl.className = 'uf-status uf-ok'; }
        }
        uploadOne(idx + 1);
      })
      .catch(function() {
        failed++;
        if (statusEl) { statusEl.textContent = '✗'; statusEl.className = 'uf-status uf-err'; }
        uploadOne(idx + 1);
      });
  }
  uploadOne(0);
}

/* ═══════════════════════════════════════════════════════════════
   LONG-PRESS CONTEXT MENU (mobile / touch)
   Shows context menu after 500ms hold
═══════════════════════════════════════════════════════════════ */
function bindLongPress() {
  var tree = $('file-tree');
  var _lpTimer = null;
  var _lpTarget = null;

  tree.addEventListener('touchstart', function(e) {
    var item = e.target.closest ? e.target.closest('.tree-item') : null;
    if (!item) return;
    _lpTarget = item;
    _lpTimer = setTimeout(function() {
      _lpTimer = null;
      // Vibrate if supported (Android)
      if (navigator.vibrate) navigator.vibrate(30);
      // Add visual feedback
      item.className += ' long-press-active';
      setTimeout(function() {
        item.className = item.className.replace(/\s*long-press-active\b/g, '');
      }, 500);
      // Get the node and show context menu at touch position
      var touch = e.touches[0];
      var node = nodeByPath(item.dataset.path);
      if (node) {
        selectItem(node, item);
        // Simulate contextmenu event at touch position
        var fakeEvent = {
          clientX: touch.clientX,
          clientY: touch.clientY,
          preventDefault: function() {}
        };
        showCtxMenu(fakeEvent, node);
      }
    }, 500);
  }, { passive: true });

  tree.addEventListener('touchend', function() {
    if (_lpTimer) { clearTimeout(_lpTimer); _lpTimer = null; }
  }, { passive: true });

  tree.addEventListener('touchmove', function() {
    if (_lpTimer) { clearTimeout(_lpTimer); _lpTimer = null; }
  }, { passive: true });
}

/* ═══════════════════════════════════════════════════════════════
   TREE DRAG-AND-DROP MOVE
   Drag a file/folder onto another folder to move it
═══════════════════════════════════════════════════════════════ */
function bindTreeDragMove() {
  var tree = $('file-tree');
  var _dragNode = null;
  var _lastDropTarget = null;

  // Use event delegation on the tree container
  tree.addEventListener('dragstart', function(e) {
    var item = e.target.closest ? e.target.closest('.tree-item') : null;
    if (!item || !item.dataset.path) return;
    _dragNode = nodeByPath(item.dataset.path);
    if (!_dragNode) return;
    // Mark source and set global flag to prevent file-upload drop
    item.className += ' drag-src';
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item.dataset.path);
    S._treeDragSrcItem = item;
    S._treeDragActive  = true;
  });

  tree.addEventListener('dragover', function(e) {
    e.preventDefault();
    if (!_dragNode) return;
    var item = e.target.closest ? e.target.closest('.tree-item') : null;
    if (!item || item === S._treeDragSrcItem) return;
    var targetNode = nodeByPath(item.dataset.path);
    if (!targetNode) return;
    // Only allow drop onto directories
    if (targetNode.kind !== 'directory') return;
    // Prevent dropping onto self or child
    if (targetNode.path === _dragNode.path) return;
    if (targetNode.path.indexOf(_dragNode.path + S.sep) === 0) return;

    e.dataTransfer.dropEffect = 'move';
    if (_lastDropTarget && _lastDropTarget !== item) {
      _lastDropTarget.className = _lastDropTarget.className.replace(/\s*drop-target\b/g, '');
    }
    if (item.className.indexOf('drop-target') < 0) item.className += ' drop-target';
    _lastDropTarget = item;
  });

  tree.addEventListener('dragleave', function(e) {
    var item = e.target.closest ? e.target.closest('.tree-item') : null;
    if (item) item.className = item.className.replace(/\s*drop-target\b/g, '');
  });

  tree.addEventListener('dragend', function() {
    if (S._treeDragSrcItem) {
      S._treeDragSrcItem.className = S._treeDragSrcItem.className.replace(/\s*drag-src\b/g, '');
      S._treeDragSrcItem = null;
    }
    if (_lastDropTarget) {
      _lastDropTarget.className = _lastDropTarget.className.replace(/\s*drop-target\b/g, '');
      _lastDropTarget = null;
    }
    _dragNode = null;
    S._treeDragActive = false;
  });

  tree.addEventListener('drop', function(e) {
    e.preventDefault();
    e.stopPropagation(); // prevent file-upload drop handler
    if (!_dragNode) return;
    var item = e.target.closest ? e.target.closest('.tree-item') : null;
    if (!item) return;
    var targetNode = nodeByPath(item.dataset.path);
    if (!targetNode || targetNode.kind !== 'directory') return;
    if (targetNode.path === _dragNode.path) return;
    if (targetNode.path.indexOf(_dragNode.path + S.sep) === 0) return;

    // Clean up drag styles
    item.className = item.className.replace(/\s*drop-target\b/g, '');
    if (S._treeDragSrcItem)
      S._treeDragSrcItem.className = S._treeDragSrcItem.className.replace(/\s*drag-src\b/g, '');

    S._treeDragActive = false;
    // Save src info before clearing state
    var srcPath  = _dragNode.path;
    var srcName  = _dragNode.name;
    var destDir  = targetNode.path;
    var destPath = destDir + S.sep + srcName;
    _dragNode = null;

    if (srcPath === destPath) return; // same location

    api.rename(srcPath, destPath)
      .then(function(res) {
        if (res && res.error) throw new Error(res.error);
        statusMsg(t('moveSuccess') + ': ' + srcName);
        S.openDirs[destDir] = true;
        return openRoot(S.root).then(function() {
          setTimeout(function() { highlightInTree(destPath); }, 300);
        });
      })
      .catch(function(err) { statusMsg(t('msgError') + ': ' + err.message); });
  });
}

/* helper: find node object from path string */
function nodeByPath(p) {
  if (!p) return null;
  // Check selected first (fastest)
  if (S.selected && S.selected.path === p) return S.selected;
  // Recursive search through stored tree
  function search(nodes) {
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].path === p) return nodes[i];
      if (nodes[i].children && nodes[i].children.length) {
        var found = search(nodes[i].children);
        if (found) return found;
      }
    }
    return null;
  }
  var r = search(S.tree || []);
  if (r) return r;
  // Fallback: build a minimal node from DOM data-* attributes
  var el = document.querySelector('.tree-item[data-path="' + p.replace(/"/g, '\"') + '"]');
  if (el) {
    return { path: p, kind: el.dataset.kind || 'file',
             name: p.split('/').pop().split('\\').pop(), isText: false };
  }
  return null;
}


