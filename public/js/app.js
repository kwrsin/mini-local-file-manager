/**
 * Mini Local File Manager – app.js  v2.0
 */
'use strict';

/* ── Helpers ─────────────────────────────────────────────────── */
const $   = id  => document.getElementById(id);
const qsa = (s,r=document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

const TEXT_EXTS = new Set([
  'md','txt','html','htm','css','js','mjs','cjs','ts','tsx','jsx',
  'json','xml','yaml','yml','csv','log','ini','cfg','toml',
  'sh','bash','zsh','fish','bat','cmd','ps1',
  'py','rb','java','c','cpp','cc','h','hpp','cs','go','rs','php','swift',
  'sql','graphql','vue','svelte','astro','env','gitignore','dockerfile',
]);
const IMG_EXTS  = new Set(['png','jpg','jpeg','gif','webp','bmp','ico','tiff']);
const VIEW_EXTS = new Set([...IMG_EXTS,'svg','pdf','json']);
const isText    = n => TEXT_EXTS.has(n.split('.').pop().toLowerCase()) ||
  ['makefile','dockerfile','readme','license','changelog'].includes(n.toLowerCase());
const isViewable= n => VIEW_EXTS.has(n.split('.').pop().toLowerCase());
const getExt    = n => n.split('.').pop().toLowerCase();

const LS_RECENT  = 'fm_recent';
const LS_FILES   = 'fm_files';
const MAX_RECENT = 5;

const S = {
  root:null, sep:'/', selected:null, activeFile:null,
  isEditing:false, clipboard:null, recentFolders:[],
  fileCache:{}, platform:'linux', tab:'folder', ws:null,
  openDirs: new Set(), newItemContext: null,
};

const enc = s => encodeURIComponent(s||'');

const api = {
  async req(method,url,body){
    const o={method,headers:{}};
    if(body!==undefined){o.headers['Content-Type']='application/json';o.body=JSON.stringify(body);}
    return (await fetch(url,o)).json();
  },
  get:(u)=>api.req('GET',u),
  post:(u,b)=>api.req('POST',u,b),
  put:(u,b)=>api.req('PUT',u,b),
  del:(u)=>api.req('DELETE',u),
  tree:   r =>api.get(`/api/tree?root=${enc(r)}`),
  validate:p=>api.get(`/api/validate?path=${enc(p)}`),
  file:   p =>api.get(`/api/file?path=${enc(p)}`),
  save:  (p,c)=>api.put('/api/file',{path:p,content:c}),
  create:(p,c)=>api.post('/api/file',{path:p,content:c||''}),
  mkdir:  p =>api.post('/api/mkdir',{path:p}),
  delete: p =>api.del(`/api/file?path=${enc(p)}`),
  rename:(f,t)=>api.post('/api/rename',{from:f,to:t}),
  copy:  (f,t)=>api.post('/api/copy',{from:f,to:t}),
  search:(root,name,content)=>api.get(`/api/search?root=${enc(root)}&name=${enc(name)}&content=${enc(content)}`),
  info:  ()=>api.get('/api/info'),
  authStatus:()=>api.get('/api/auth-status'),
  login: (u,p)=>api.post('/api/login',{user:u,pass:p}),
  logout:()=>api.post('/api/logout'),
};

/* ── Boot ─────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async()=>{
  applyI18n();
  loadStorage();
  try{
    const info=await api.authStatus();
    if(info.useAuth&&!info.ok){showLogin();return;}
    if(info.useAuth) $('btn-logout').style.display='inline-flex';
    await bootApp();
  }catch(e){await bootApp();}
});

async function bootApp(){
  $('login-screen').style.display='none';
  $('app').style.display='flex';
  await fetchInfo();
  bindTabs(); bindToolbar(); bindEditor(); bindContextMenu();
  bindModalBackdrops(); bindShortcuts(); bindDragDrop();
  bindSearch(); bindLang(); connectWS();
  applyI18n();
  const params=new URLSearchParams(location.search);
  const urlRoot=params.get('root');
  if(urlRoot){await openRoot(urlRoot);}
  else if(S.recentFolders.length){
    for(const rf of S.recentFolders){
      try{const v=await api.validate(rf);if(v.valid&&v.isDir){await openRoot(rf);break;}}catch(e){}
    }
  }
}

function showLogin(){
  $('login-screen').style.display='flex';
  $('app').style.display='none';
  applyI18n();
  $('login-btn').onclick=async()=>{
    const u=$('login-user').value.trim(),p=$('login-pass').value;
    const res=await api.login(u,p);
    if(res.ok){$('btn-logout').style.display='inline-flex';await bootApp();}
    else{const e=$('login-err');e.textContent=t('msgLoginFail');e.style.display='block';}
  };
  $('login-pass').addEventListener('keydown',e=>{if(e.key==='Enter')$('login-btn').click();});
}

async function fetchInfo(){
  try{const i=await api.info();S.platform=i.platform;S.sep=i.sep;$('server-info').textContent=i.hostname+' · '+location.host;}catch(e){}
}

function loadStorage(){
  try{S.recentFolders=JSON.parse(localStorage.getItem(LS_RECENT)||'[]');}catch(e){S.recentFolders=[];}
  try{S.fileCache=JSON.parse(localStorage.getItem(LS_FILES)||'{}');}catch(e){S.fileCache={};}
}
function saveRecent(){localStorage.setItem(LS_RECENT,JSON.stringify(S.recentFolders));}
function saveCache() {localStorage.setItem(LS_FILES, JSON.stringify(S.fileCache));}
function pushRecent(p){S.recentFolders=[p,...S.recentFolders.filter(r=>r!==p)].slice(0,MAX_RECENT);saveRecent();}
function syncURL(root){const u=new URL(location.href);root?u.searchParams.set('root',root):u.searchParams.delete('root');history.replaceState({},'',u);}

/* ── Open root ────────────────────────────────────────────────── */
async function openRoot(rootPath){
  rootPath=(rootPath||'').trim();
  if(!rootPath)return;
  closeModal('modal-open');
  statusMsg(t('msgLoading'));
  try{
    const v=await api.validate(rootPath);
    if(!v.valid){showPathError(t('msgPathInvalid')+': '+(v.error||''));return;}
    if(!v.isDir){showPathError(t('msgPathNotDir'));return;}
    const res=await api.tree(rootPath);
    if(res.error){statusMsg(t('msgError')+': '+res.error);return;}
    S.root=rootPath; S.selected=null;
    if(!S.openDirs.has(rootPath)) S.openDirs=new Set([rootPath]);
    pushRecent(rootPath); syncURL(rootPath);
    $('toolbar-root-label').textContent=rootPath;
    renderTree(res.tree,$('file-tree'));
    updateStatus(rootPath);
    statusMsg(t('msgOpened'));
    watchRoot(rootPath);
  }catch(e){statusMsg(t('msgConnErr')+': '+e.message);}
}

function showPathError(msg){const e=$('path-error');e.textContent=msg;e.style.display='block';}

/* ── Tree ─────────────────────────────────────────────────────── */
function renderTree(nodes,container){
  $('tree-empty').style.display='none';
  qsa('.tree-node',container).forEach(n=>n.remove());
  const frag=document.createDocumentFragment();
  buildNodes(nodes,frag,0);
  container.appendChild(frag);
}

function buildNodes(nodes,parent,depth){
  nodes.forEach(node=>{
    const wrapper=document.createElement('div');
    wrapper.className='tree-node'; wrapper.dataset.path=node.path;

    const item=document.createElement('div');
    item.className='tree-item'; item.style.paddingLeft=`${depth*16+6}px`;
    item.dataset.path=node.path; item.dataset.kind=node.kind;

    const toggle=document.createElement('span');
    toggle.className=node.kind==='directory'?'tree-toggle':'tree-toggle leaf';
    if(node.kind==='directory')toggle.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9,6 15,12 9,18"/></svg>`;

    const icon=document.createElement('span');
    icon.className='tree-icon';
    if(node.kind==='directory'){
      icon.className+=' ti-folder';
      icon.innerHTML=`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`;
    }else{
      const ext=getExt(node.name);
      if(ext==='md'){icon.className+=' ti-md';icon.innerHTML=fileIconSVG();}
      else if(node.isText){icon.className+=' ti-txt';icon.innerHTML=fileIconSVG();}
      else if(IMG_EXTS.has(ext)||ext==='svg'){icon.className+=' ti-img';icon.innerHTML=imgIconSVG();}
      else{icon.className+=' ti-other';icon.innerHTML=fileIconSVG();}
    }

    const nameEl=document.createElement('span');
    nameEl.className='tree-name';
    nameEl.textContent=node.name;
    if(!node.writable&&node.kind==='file')nameEl.classList.add('name-readonly');

    item.append(toggle,icon,nameEl);
    wrapper.appendChild(item);

    if(node.kind==='directory'){
      const cw=document.createElement('div');
      cw.className='tree-children';
      const wasOpen=S.openDirs.has(node.path);
      cw.style.display=wasOpen?'block':'none';
      if(wasOpen)toggle.classList.add('open');
      wrapper.appendChild(cw);

      item.addEventListener('click',async e=>{
        e.stopPropagation(); selectItem(node,item);
        const isOpen=toggle.classList.toggle('open');
        cw.style.display=isOpen?'block':'none';
        if(isOpen){
          S.openDirs.add(node.path);
          if(cw.childElementCount===0){
            try{
              const res=await api.tree(node.path);
              if(!res.error){
                if(res.tree.length)buildNodes(res.tree,cw,depth+1);
                else cw.innerHTML=`<div class="empty-dir">(empty)</div>`;
              }
            }catch(e){}
          }
        }else{S.openDirs.delete(node.path);}
        updateStatus(node.path);
      });
    }else{
      item.addEventListener('click',e=>{e.stopPropagation();selectItem(node,item);updateStatus(node.path,node.name);});
      item.addEventListener('dblclick',()=>openFileNode(node));
    }

    item.addEventListener('contextmenu',e=>{e.preventDefault();selectItem(node,item);showCtxMenu(e,node);});
    parent.appendChild(wrapper);
  });
}

const fileIconSVG=()=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>`;
const imgIconSVG =()=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg>`;

function selectItem(node,item){qsa('.tree-item.selected').forEach(el=>el.classList.remove('selected'));item.classList.add('selected');S.selected=node;}

function highlightInTree(filePath){
  const item=document.querySelector(`.tree-item[data-path="${CSS.escape(filePath)}"]`);
  if(item){qsa('.tree-item.selected').forEach(el=>el.classList.remove('selected'));item.classList.add('selected');item.scrollIntoView({block:'nearest',behavior:'smooth'});}
}

/* ── Open file ────────────────────────────────────────────────── */
async function openFileNode(node){
  if(node.kind!=='file')return;
  if(!node.isText&&isViewable(node.name)){openViewer(node);return;}
  if(node.isText){await openTextFile(node);return;}
  statusMsg(t('msgBinary'));
}

function openViewer(node){
  const ext=getExt(node.name);
  const rawUrl=`/api/raw?path=${enc(node.path)}`;
  $('viewer-title').textContent=node.name;
  const body=$('viewer-body'); body.innerHTML='';
  if(IMG_EXTS.has(ext)||ext==='svg'){
    const img=document.createElement('img');
    img.src=rawUrl; img.alt=node.name; img.className='viewer-img';
    body.appendChild(img);
  }else if(ext==='pdf'){
    const iframe=document.createElement('iframe');
    iframe.src=rawUrl; iframe.className='viewer-iframe';
    body.appendChild(iframe);
  }else if(ext==='json'){
    fetch(rawUrl).then(r=>r.text()).then(txt=>{
      let pretty=txt;try{pretty=JSON.stringify(JSON.parse(txt),null,2);}catch(e){}
      const pre=document.createElement('pre');
      pre.className='viewer-json'; pre.textContent=pretty;
      body.appendChild(pre);
    });
  }
  openModal('modal-viewer');
}

async function openTextFile(node){
  let content=S.fileCache[node.path];
  let writable=true;
  if(content==null){
    try{
      const res=await api.file(node.path);
      if(res.error){statusMsg(t('msgError')+': '+res.error);return;}
      content=res.content; writable=res.writable!==false;
      $('readonly-badge').style.display=writable?'none':'inline-flex';
    }catch(e){statusMsg(t('msgConnErr')+': '+e.message);return;}
  }
  S.activeFile={path:node.path,name:node.name,content,writable};
  S.isEditing=false;
  $('editor-filename').textContent=node.name;
  $('editor-empty').style.display='none';
  applyEditMode();
  updateStatus(node.path,node.name);
  switchTab('editor');
}

/* ── Editor ───────────────────────────────────────────────────── */
function bindEditor(){
  $('btn-edit-toggle').addEventListener('click',toggleEdit);
  $('btn-save').addEventListener('click',saveFile);
  $('btn-back-folder').addEventListener('click',()=>{
    if(S.isEditing)saveFile().then(()=>switchTab('folder'));
    else switchTab('folder');
  });
}

function toggleEdit(){
  if(!S.activeFile)return;
  if(!S.activeFile.writable){statusMsg(t('msgPermission'));return;}
  S.isEditing=!S.isEditing; applyEditMode();
}

function applyEditMode(){
  if(!S.activeFile)return;
  const textarea=$('editor-textarea'),preview=$('preview-wrap');
  const label=$('edit-label'),btnSave=$('btn-save'),btnToggle=$('btn-edit-toggle');
  if(S.isEditing){
    label.textContent=currentLang==='ja'?'プレビュー':'Preview';
    btnToggle.classList.add('editing'); btnSave.style.display='inline-flex';
    preview.style.display='none'; textarea.style.display='flex'; textarea.style.flex='1';
    textarea.value=S.activeFile.content; textarea.focus();
  }else{
    label.textContent=t('edit');
    btnToggle.classList.remove('editing'); btnSave.style.display='none';
    preview.style.display='flex'; preview.style.flex='1'; textarea.style.display='none';
    renderPreview(S.activeFile.content,S.activeFile.name,S.activeFile.path);
  }
}

async function saveFile(){
  if(!S.activeFile||!S.activeFile.writable){if(S.activeFile)statusMsg(t('msgPermission'));return;}
  const content=$('editor-textarea').value;
  S.activeFile.content=content;
  try{
    const res=await api.save(S.activeFile.path,content);
    if(res.error)throw new Error(res.error);
    delete S.fileCache[S.activeFile.path]; saveCache();
    statusMsg(t('msgSaved'));
  }catch(e){
    S.fileCache[S.activeFile.path]=content; saveCache();
    statusMsg(t('msgSavedLocal'));
  }
  S.isEditing=false; applyEditMode();
}

/* ── Markdown preview ─────────────────────────────────────────── */
function renderPreview(content,filename,filePath){
  const el=$('preview-content'), ext=getExt(filename);
  const baseDir=filePath?filePath.split(S.sep).slice(0,-1).join(S.sep):'';
  if(ext==='md'){el.classList.remove('plaintext');el.innerHTML=parseMarkdown(content,baseDir);}
  else{el.classList.add('plaintext');el.textContent=content;}
}

function parseMarkdown(raw,baseDir){
  const lines=raw.split('\n');
  const out=[];
  let inCode=false,codeLang='',codeLines=[];
  let tableLines=[];

  const flushTable=()=>{
    if(!tableLines.length)return;
    const rows=tableLines.filter((_,i)=>i!==1);
    const header=rows.shift()||'';
    const ths=splitRow(header).map(c=>`<th>${inlineMD(c,baseDir)}</th>`).join('');
    const trs=rows.map(r=>`<tr>${splitRow(r).map(c=>`<td>${inlineMD(c,baseDir)}</td>`).join('')}</tr>`).join('');
    out.push(`<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`);
    tableLines=[];
  };

  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    if(/^```/.test(line)){
      if(!inCode){inCode=true;codeLang=line.slice(3).trim();codeLines=[];}
      else{out.push(`<pre><code class="lang-${esc(codeLang)}">${esc(codeLines.join('\n'))}</code></pre>`);inCode=false;codeLines=[];}
      continue;
    }
    if(inCode){codeLines.push(line);continue;}
    if(/^\|/.test(line)){tableLines.push(line);continue;}
    else if(tableLines.length){flushTable();}
    const hm=line.match(/^(#{1,6})\s+(.+)$/);
    if(hm){out.push(`<h${hm[1].length}>${inlineMD(hm[2],baseDir)}</h${hm[1].length}>`);continue;}
    if(/^[-*_]{3,}\s*$/.test(line)){out.push('<hr>');continue;}
    if(/^> /.test(line)){out.push(`<blockquote>${inlineMD(line.slice(2),baseDir)}</blockquote>`);continue;}
    if(/^[*-] /.test(line)){out.push(`<li class="ul-item">${inlineMD(line.slice(2),baseDir)}</li>`);continue;}
    if(/^\d+\. /.test(line)){out.push(`<li class="ol-item">${inlineMD(line.replace(/^\d+\. /,''),baseDir)}</li>`);continue;}
    if(line.trim()===''){out.push('');continue;}
    out.push(`<p>${inlineMD(line,baseDir)}</p>`);
  }
  if(inCode)out.push(`<pre><code>${esc(codeLines.join('\n'))}</code></pre>`);
  if(tableLines.length)flushTable();

  // Wrap consecutive li items
  let html=out.join('\n');
  html=html.replace(/(<li class="ul-item">.*?<\/li>(\n|$))+/gs,m=>`<ul>${m.replace(/ class="ul-item"/g,'')}</ul>`);
  html=html.replace(/(<li class="ol-item">.*?<\/li>(\n|$))+/gs,m=>`<ol>${m.replace(/ class="ol-item"/g,'')}</ol>`);
  return html;
}

const splitRow=line=>line.replace(/^\||\|$/g,'').split('|').map(c=>c.trim());

function inlineMD(text,baseDir){
  const codes=[]; let s=text;
  // Protect inline code
  s=s.replace(/`([^`\n]+)`/g,(_,c)=>{codes.push(esc(c));return`\x00C${codes.length-1}\x00`;});
  // Bold/italic/strike
  s=s.replace(/\*\*\*(.+?)\*\*\*/g,'<strong><em>$1</em></strong>');
  s=s.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
  s=s.replace(/__(.+?)__/g,'<strong>$1</strong>');
  s=s.replace(/\*(.+?)\*/g,'<em>$1</em>');
  s=s.replace(/_(.+?)_/g,'<em>$1</em>');
  s=s.replace(/~~(.+?)~~/g,'<del>$1</del>');
  // Images (before links to avoid conflict)
  s=s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g,(_,alt,src)=>{
    const res=resolveImg(src,baseDir);
    return`<img src="${esc(res)}" alt="${esc(alt)}" class="md-img">`;
  });
  // Links
  s=s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,(_,label,href)=>`<a href="${esc(href)}" target="_blank" rel="noopener">${label}</a>`);
  // Auto-links: only bare http URLs not inside an attribute
  s=s.replace(/(?<![="'])(https?:\/\/[^\s<>"']+)/g,url=>`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>`);
  // Checkboxes
  s=s.replace(/\[ \] /g,'<input type="checkbox" disabled> ');
  s=s.replace(/\[x\] /gi,'<input type="checkbox" checked disabled> ');
  // Restore code
  s=s.replace(/\x00C(\d+)\x00/g,(_,i)=>`<code>${codes[+i]}</code>`);
  return s;
}

function resolveImg(src,baseDir){
  if(/^https?:\/\//.test(src))return src;
  if(!baseDir)return src;
  const full=baseDir+S.sep+src.replace(/\//g,S.sep);
  return`/api/raw?path=${enc(full)}`;
}

/* ── Tabs ─────────────────────────────────────────────────────── */
function bindTabs(){qsa('.tab').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));}
function switchTab(name){
  qsa('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));
  qsa('.pane').forEach(p=>p.classList.toggle('active',p.id===`pane-${name}`));
  S.tab=name;
}

/* ── Toolbar ──────────────────────────────────────────────────── */
function bindToolbar(){
  $('btn-open').addEventListener('click',openFolderModal);
  $('btn-open-hero')&&$('btn-open-hero').addEventListener('click',openFolderModal);
  $('btn-new-file').addEventListener('click',()=>promptNew('file'));
  $('btn-new-folder').addEventListener('click',()=>promptNew('folder'));
  $('btn-search').addEventListener('click',openSearch);
  $('btn-path-go').addEventListener('click',async()=>{$('path-error').style.display='none';await openRoot($('path-input').value);});
  $('path-input').addEventListener('keydown',async e=>{if(e.key==='Enter'){$('path-error').style.display='none';await openRoot($('path-input').value);}});
  $('btn-logout').addEventListener('click',async()=>{await api.logout();location.reload();});
}

function bindLang(){
  $('btn-lang').addEventListener('click',()=>{
    toggleLang();
    if(S.activeFile)$('editor-filename').textContent=S.activeFile.name;
    if(S.root)$('toolbar-root-label').textContent=S.root;
  });
}

function openFolderModal(){
  $('path-error').style.display='none';
  if(S.root)$('path-input').value=S.root;
  renderRecentList(); openModal('modal-open');
  setTimeout(()=>$('path-input').select(),50);
}

function renderRecentList(){
  const list=$('recent-list');
  $('recent-count').textContent=S.recentFolders.length?`(${S.recentFolders.length})`:'';
  list.innerHTML='';
  if(!S.recentFolders.length){list.innerHTML=`<div class="no-recent">${t('noRecent')}</div>`;return;}
  S.recentFolders.forEach((rp,idx)=>{
    const item=document.createElement('div');
    item.className='recent-item';
    item.innerHTML=`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg><span class="recent-path" title="${esc(rp)}">${esc(rp)}</span><button class="recent-del" data-idx="${idx}">✕</button>`;
    item.querySelector('.recent-path').addEventListener('click',()=>openRoot(rp));
    item.querySelector('.recent-del').addEventListener('click',e=>{e.stopPropagation();S.recentFolders.splice(idx,1);saveRecent();renderRecentList();});
    list.appendChild(item);
  });
}

/* ── Context menu ─────────────────────────────────────────────── */
function bindContextMenu(){
  document.addEventListener('click',hideCtx);
  document.addEventListener('scroll',hideCtx,true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){hideCtx();closeAllModals();}});
  qsa('.ctx-item').forEach(item=>item.addEventListener('click',e=>{e.stopPropagation();handleCtx(item.dataset.action);hideCtx();}));
}

function showCtxMenu(e,node){
  const menu=$('ctx-menu');
  menu.querySelector('.ctx-text-only').style.display=(node.kind==='file'&&node.isText)?'flex':'none';
  menu.querySelector('.ctx-dir-only').style.display=node.kind==='directory'?'flex':'none';
  menu.style.display='block';
  requestAnimationFrame(()=>{
    const x=Math.min(e.clientX,innerWidth-menu.offsetWidth-8);
    const y=Math.min(e.clientY,innerHeight-menu.offsetHeight-8);
    menu.style.left=x+'px';menu.style.top=y+'px';
  });
}
function hideCtx(){$('ctx-menu').style.display='none';}

function handleCtx(action){
  const node=S.selected;
  switch(action){
    case 'open':       if(node)openFileNode(node); break;
    case 'edit':       if(node)openTextFile(node).then(()=>{S.isEditing=true;applyEditMode();}); break;
    case 'set-root':   if(node&&node.kind==='directory')openRoot(node.path); break;
    case 'new-file':   S.newItemContext=node; promptNew('file'); break;
    case 'new-folder': S.newItemContext=node; promptNew('folder'); break;
    case 'cut':        doCut(); break;
    case 'copy':       doCopy(); break;
    case 'paste':      doPaste(); break;
    case 'rename':     startRename(); break;
    case 'delete':     confirmDelete(); break;
  }
}

/* ── Clipboard ────────────────────────────────────────────────── */
function doCopy(){if(!S.selected)return;S.clipboard={action:'copy',node:S.selected};statusMsg(t('ctxCopy')+': '+S.selected.name);}
function doCut() {if(!S.selected)return;S.clipboard={action:'cut', node:S.selected};statusMsg(t('ctxCut')+': '+S.selected.name);}
async function doPaste(){
  if(!S.clipboard){statusMsg(t('msgPasteEmpty'));return;}
  const{action,node}=S.clipboard;
  let destDir=S.root;
  if(S.selected)destDir=S.selected.kind==='directory'?S.selected.path:parentPath(S.selected.path);
  const dest=destDir+S.sep+node.name;
  try{
    if(action==='copy'){const r=await api.copy(node.path,dest);if(r.error)throw new Error(r.error);statusMsg(t('msgCopied')+': '+node.name);}
    else{const r=await api.rename(node.path,dest);if(r.error)throw new Error(r.error);S.clipboard=null;statusMsg(t('msgMoved')+': '+node.name);}
    await openRoot(S.root);
  }catch(e){statusMsg(t('msgError')+': '+e.message);}
}
function parentPath(p){const pts=p.split(S.sep);pts.pop();return pts.join(S.sep)||S.root;}

/* ── Rename ───────────────────────────────────────────────────── */
function startRename(){
  if(!S.selected)return;
  const input=$('rename-input');input.value=S.selected.name;
  openModal('modal-rename');setTimeout(()=>{input.select();input.focus();},50);
  const doRename=async()=>{
    const newName=input.value.trim();
    if(!newName||newName===S.selected.name){closeModal('modal-rename');return;}
    const pts=S.selected.path.split(S.sep);pts[pts.length-1]=newName;
    const newPath=pts.join(S.sep);
    try{const r=await api.rename(S.selected.path,newPath);if(r.error)throw new Error(r.error);closeModal('modal-rename');statusMsg(t('msgRenamed')+': '+newName);await openRoot(S.root);}
    catch(e){statusMsg(t('msgError')+': '+e.message);}
  };
  $('btn-rename-ok').onclick=doRename;
  $('btn-rename-no').onclick=()=>closeModal('modal-rename');
  input.onkeydown=e=>{if(e.key==='Enter')doRename();if(e.key==='Escape')closeModal('modal-rename');};
}

/* ── Delete ───────────────────────────────────────────────────── */
function confirmDelete(){
  if(!S.selected)return;
  const node=S.selected;
  $('confirm-msg').textContent=`"${node.name}" ${currentLang==='ja'?'を削除しますか？この操作は取り消せません。':'will be deleted permanently. Are you sure?'}`;
  openModal('modal-confirm');
  $('btn-confirm-ok').onclick=async()=>{
    try{const r=await api.delete(node.path);if(r.error)throw new Error(r.error);closeModal('modal-confirm');S.selected=null;statusMsg(t('msgDeleted')+': '+node.name);await openRoot(S.root);}
    catch(e){statusMsg(t('msgError')+': '+e.message);}
  };
  $('btn-confirm-no').onclick=()=>closeModal('modal-confirm');
}

/* ── New item ─────────────────────────────────────────────────── */
function promptNew(type){
  const ctx=S.newItemContext||S.selected;S.newItemContext=null;
  $('new-modal-title').textContent=type==='file'?t('newFile'):t('newFolder');
  const input=$('new-name-input');
  input.value=type==='file'?'untitled.md':'NewFolder';
  openModal('modal-new');setTimeout(()=>{input.select();input.focus();},50);
  const doCreate=async()=>{
    const name=input.value.trim();if(!name)return;
    let parentDir=S.root;
    if(ctx)parentDir=ctx.kind==='directory'?ctx.path:parentPath(ctx.path);
    const newPath=parentDir+S.sep+name;
    try{
      const r=type==='file'?await api.create(newPath,''):await api.mkdir(newPath);
      if(r.error)throw new Error(r.error);
      closeModal('modal-new');statusMsg(t('msgCreated')+': '+name);
      S.openDirs.add(parentDir);
      await openRoot(S.root);
      setTimeout(()=>highlightInTree(newPath),200);
    }catch(e){statusMsg(t('msgError')+': '+e.message);}
  };
  $('btn-new-ok').onclick=doCreate;
  $('btn-new-no').onclick=()=>closeModal('modal-new');
  input.onkeydown=e=>{if(e.key==='Enter')doCreate();if(e.key==='Escape')closeModal('modal-new');};
}

/* ── Search ───────────────────────────────────────────────────── */
function bindSearch(){
  $('search-content-chk').addEventListener('change',e=>{$('search-content').style.display=e.target.checked?'block':'none';});
  $('btn-search-go').addEventListener('click',doSearch);
  $('btn-search-clear').addEventListener('click',()=>{
    $('search-name').value='';$('search-content').value='';
    $('search-content-chk').checked=false;$('search-content').style.display='none';
    $('search-results').innerHTML='';$('search-status').textContent='';
  });
  $('search-name').addEventListener('keydown',e=>{if(e.key==='Enter')doSearch();});
  $('search-content').addEventListener('keydown',e=>{if(e.key==='Enter')doSearch();});
}

function openSearch(){if(!S.root){statusMsg(t('msgNoRoot'));return;}openModal('modal-search');setTimeout(()=>$('search-name').focus(),50);}

async function doSearch(){
  if(!S.root)return;
  const name=$('search-name').value.trim();
  const useContent=$('search-content-chk').checked;
  const content=useContent?$('search-content').value.trim():'';
  $('search-status').textContent=t('msgSearching');
  $('search-results').innerHTML='';
  try{
    const res=await api.search(S.root,name,content);
    if(res.error){$('search-status').textContent=t('msgError')+': '+res.error;return;}
    const results=res.results||[];
    $('search-status').textContent=results.length?results.length+' '+t('msgSearchDone'):t('msgSearchNone');
    renderSearchResults(results);
  }catch(e){$('search-status').textContent=t('msgConnErr')+': '+e.message;}
}

function renderSearchResults(results){
  const container=$('search-results');container.innerHTML='';
  results.forEach(item=>{
    const el=document.createElement('div');el.className='search-result-item';
    const relPath=item.path.startsWith(S.root)?item.path.slice(S.root.length+1):item.path;
    el.innerHTML=`<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6z"/><polyline points="9,2 9,6 13,6"/></svg><div class="search-result-info"><span class="search-result-name">${esc(item.name)}</span><span class="search-result-path">${esc(relPath)}</span></div>`;
    el.addEventListener('click',async()=>{
      closeModal('modal-search');switchTab('folder');
      const pts=item.path.split(S.sep);
      for(let i=1;i<pts.length-1;i++) S.openDirs.add(pts.slice(0,i+1).join(S.sep));
      await openRoot(S.root);
      setTimeout(()=>{highlightInTree(item.path);S.selected=item;updateStatus(item.path,item.name);},200);
    });
    container.appendChild(el);
  });
}

/* ── Drag & drop ──────────────────────────────────────────────── */
function bindDragDrop(){
  const tree=$('file-tree');
  tree.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';tree.classList.add('drag-active');});
  tree.addEventListener('dragleave',e=>{if(!tree.contains(e.relatedTarget))tree.classList.remove('drag-active');});
  tree.addEventListener('drop',async e=>{
    e.preventDefault();tree.classList.remove('drag-active');
    if(!S.root){statusMsg(t('msgNoRoot'));return;}
    let destDir=S.root;
    if(S.selected&&S.selected.kind==='directory')destDir=S.selected.path;
    const files=Array.from(e.dataTransfer.files);
    let count=0;
    for(const f of files){
      const dest=destDir+S.sep+f.name;
      try{const txt=isText(f.name)?await f.text():'';const r=await api.create(dest,txt);if(!r.error)count++;}catch(ex){}
    }
    statusMsg(count+' '+t('msgAdded'));await openRoot(S.root);
  });
}

/* ── WebSocket ────────────────────────────────────────────────── */
function connectWS(){
  try{
    S.ws=new WebSocket(`ws://${location.host}`);
    S.ws.addEventListener('message',async e=>{
      try{const msg=JSON.parse(e.data);if(msg.type==='change'&&S.root){clearTimeout(S._wsTimer);S._wsTimer=setTimeout(()=>openRoot(S.root),400);}}catch(ex){}
    });
    S.ws.addEventListener('error',()=>{});
  }catch(e){}
}
function watchRoot(p){if(S.ws&&S.ws.readyState===WebSocket.OPEN)S.ws.send(JSON.stringify({type:'watch',path:p}));}

/* ── Modals ───────────────────────────────────────────────────── */
function bindModalBackdrops(){
  qsa('.modal-bg').forEach(bg=>bg.addEventListener('click',()=>closeModal(bg.dataset.close)));
  qsa('[data-close].modal-x').forEach(btn=>btn.addEventListener('click',()=>closeModal(btn.dataset.close)));
}
function openModal(id){$(id).style.display='flex';}
function closeModal(id){if($(id))$(id).style.display='none';}
function closeAllModals(){qsa('.modal').forEach(m=>m.style.display='none');}

/* ── Status bar ───────────────────────────────────────────────── */
function updateStatus(pathStr,file){
  $('status-path').textContent=pathStr||'—';
  $('status-file').textContent=file||'';
  $('status-sep').style.display=file?'inline':'none';
}
let _msgT;
function statusMsg(msg){$('status-msg').textContent=msg;clearTimeout(_msgT);_msgT=setTimeout(()=>{$('status-msg').textContent='';},4500);}

/* ── Keyboard shortcuts ───────────────────────────────────────── */
function bindShortcuts(){
  document.addEventListener('keydown',e=>{
    const ctrl=e.ctrlKey||e.metaKey;
    const inInput=!!document.activeElement?.matches('input,textarea');
    if(ctrl&&e.key==='o'){e.preventDefault();openFolderModal();return;}
    if(ctrl&&e.key==='s'){e.preventDefault();saveFile();return;}
    if(!inInput){
      if(ctrl&&e.key==='c'){e.preventDefault();doCopy();return;}
      if(ctrl&&e.key==='x'){e.preventDefault();doCut();return;}
      if(ctrl&&e.key==='v'){e.preventDefault();doPaste();return;}
      if(ctrl&&e.key==='Delete'){e.preventDefault();confirmDelete();return;}
    }
    if(e.key==='F2'){e.preventDefault();startRename();return;}
    if(e.key==='F3'){e.preventDefault();openSearch();return;}
    if(e.key==='F9'){
      e.preventDefault();
      if(S.tab==='editor'){if(S.isEditing)saveFile().then(()=>switchTab('folder'));else switchTab('folder');}
      return;
    }
    if(e.key==='F10'){
      e.preventDefault();
      if(S.tab==='editor'&&S.activeFile)toggleEdit();
      else if(S.tab==='folder'&&S.selected?.kind==='file'&&S.selected.isText)
        openTextFile(S.selected).then(()=>{S.isEditing=true;applyEditMode();});
      return;
    }
    if(!inInput&&S.tab==='folder')arrowNav(e);
  });
}

function arrowNav(e){
  if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;
  e.preventDefault();
  const items=qsa('.tree-item',$('file-tree'));if(!items.length)return;
  const cur=$('file-tree').querySelector('.tree-item.selected');
  let idx=cur?items.indexOf(cur):-1;
  if(e.key==='ArrowDown')idx=Math.min(idx+1,items.length-1);
  else if(e.key==='ArrowUp')idx=Math.max(idx-1,0);
  else if(e.key==='ArrowRight'&&cur){cur.click();return;}
  else if(e.key==='ArrowLeft'&&cur){
    const up=cur.closest('.tree-children')?.closest('.tree-node')?.querySelector(':scope > .tree-item');
    if(up){up.click();return;}
  }
  if(idx>=0){items[idx].click();items[idx].scrollIntoView({block:'nearest'});}
}
