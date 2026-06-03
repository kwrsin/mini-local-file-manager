# Mini Local File Manager

**A lightweight browser-based local file manager built with Node.js.**  
Browse, edit, create, rename and delete files on your local PC via any browser.

> This application was created with the assistance of [Claude Code](https://claude.ai/code) by Anthropic.

---

## Features

- 📁 Folder tree with lazy loading and state persistence
- ✏️ Markdown & text editor with live preview
- 🔍 File search with optional content (GREP) search
- 🌐 Japanese / English localization (EN/JP toggle)
- 🔐 Optional HTTP Basic-style authentication (env variables)
- 📡 WebSocket live reload via [chokidar](https://github.com/paulmillr/chokidar)
- 🖼️ Image / SVG / PDF / JSON viewer (modal)
- 📱 Responsive design (mobile-friendly)
- 🌍 mDNS `.local` domain support (optional)
- 💾 USB-portable – no global installs needed

---


## New in v2.5

### conf.json — Full Reference

```jsonc
{
  "port": 3000,              // optional; CLI port or PORT env takes priority

  // --- Feature flags (default: true when no conf, false when conf present but key absent) ---
  "enabledDownload": true,   // allow file/folder download (Ctrl+D)
  "enabledUnzip":    true,   // allow .zip extraction
  "filesize":        20,     // max upload size in MB (default 20; 0 or negative = use default)

  // --- Path access control (optional; absent = all paths allowed) ---
  "access": [
    { "deny":  "/*" },                              // deny everything (implicit default)
    { "allow": "/users/alice/documents/*" },
    { "deny":  "/users/alice/documents/secrets/*" } // more specific rule wins
  ]
}
```

| Feature flag | Absent from conf | `false` | `true` |
|---|---|---|---|
| `enabledDownload` | allowed (no conf) / **blocked** (conf) | blocked | allowed |
| `enabledUnzip`    | allowed (no conf) / **blocked** (conf) | blocked | allowed |
| `filesize`        | 20 MB | — | N MB |

### Audit Log (stderr)

All file operations are logged to **stderr** in CSV format:

```
date,action,path,ip address
20260101 10:10:00.222,opened,/users/alice/downloads,192.168.1.10
20260101 10:11:00.333,uploaded,/users/alice/downloads/photo.jpg,192.168.1.10
```

**Actions:** `opened` · `created` · `saved` · `deleted` · `renamed` · `copied` · `uploaded` · `downloaded` · `unzipped`

```bash
# Redirect to log file
node server.js 2>>audit.log
# Split stdout and stderr
node server.js 1>server.log 2>audit.log
```

### Status Bar File Info
When a file is selected in the tree, the status bar shows:
- File size (B / KB / MB / GB)
- Last modified date/time
- Created date/time (when different from modified)

---
## Quick Start

```bash
# 1. Install dependencies (first time only)
npm install

# 2. Start on default port 3000
node server.js

# 3. Specify a port
node server.js 4000

# 4. Via environment variable
PORT=8080 node server.js
```

Open **http://localhost:3000** in your browser, then type a folder path and click **Open**.

---
## Access Control (conf.json)

Restrict which folders are visible/accessible.

```bash
node server.js -conf=./conf.json
node server.js 4000 -conf=./conf.json
```

See `conf.example.json` for a template. The `conf.json` format:

```jsonc
{
  "port": 3000,           // optional port (overridden by CLI arg or PORT env)
  "access": [
    { "deny":  "/*" },                            // deny everything (implicit default, can omit)
    { "allow": "/users/alice/documents/*" },       // allow this subtree
    { "allow": "/users/alice/downloads/*" },
    { "deny":  "/users/alice/documents/secrets/*" } // override: deny this subtree
  ]
}
```

**Rule matching:** The **most specific (longest-base) rule wins**, regardless of order.  
This means a more specific allow/deny always overrides a less specific one.

**Behavior when conf.json is absent or has no `access` key:** all paths are allowed (access control disabled).

**Comments:** `// line comments` are supported in conf.json.


## conf.json — Full Reference

```jsonc
{
  // Server port (optional; overridden by CLI arg or PORT env var)
  "port": 3000,

  // Download permission (optional; default: false when conf present, true when no conf)
  "enabledDownload": true,

  // Unzip permission (optional; default: false when conf present, true when no conf)
  "enabledUnzip": true,

  // Path access rules (optional; if absent, all paths are allowed)
  "access": [
    { "deny":  "/*" },                             // deny everything (implicit default)
    { "allow": "/users/alice/documents/*" },        // allow this subtree
    { "deny":  "/users/alice/documents/secrets/*" } // override: deny this subtree
  ]
}
```

### Feature flags behavior

| Scenario | `enabledDownload` | `enabledUnzip` |
|----------|-------------------|----------------|
| No conf.json | `true` (download allowed) | `true` (unzip allowed) |
| conf.json present, key absent | `false` (download disabled) | `false` (unzip disabled) |
| conf.json present, `true` | `true` | `true` |
| conf.json present, `false` | `false` | `false` |

When disabled, the context menu item is hidden and the API endpoint returns HTTP 403.

---

## Audit Log (stderr)

All file operations are written to **stderr** in CSV format:

```
date,action,path,ip address
20260101 10:10:00.222,opened,/users/alice/downloads,192.168.1.10
20260101 10:11:00.333,uploaded,/users/alice/downloads/photo.jpg,192.168.1.10
```

**Actions:** `opened` `created` `saved` `deleted` `renamed` `copied` `uploaded` `downloaded` `unzipped`

**Redirect to file:**

```bash
node server.js 2>> audit.log
# or separate stdout and stderr
node server.js 1>server.log 2>audit.log
```

---
## New Features (v2.4)

- 🎵 **Media player** — audio/video files open in a built-in player (mp3, m4a, wav, ogg, flac, mp4, webm, ogv…)
- 📦 **ZIP compress** — right-click a folder → "Compress to ZIP" → creates `<folder>.zip` alongside it
- 📦 **ZIP extract** — right-click a `.zip` file → "Extract ZIP" → extracts to a folder of the same name
- 📥 **Download** — right-click any file/folder → "Download" (Ctrl+D). Folders are zipped on-the-fly before download
- 📤 **File upload** — toolbar "Upload" button (Ctrl+U) — opens a modal with drag-and-drop zone, shows per-file status, highlights uploaded files after completion
- 🖱️ **Drag-to-move** — drag a file/folder onto another folder in the tree to move it (with visual drop-target highlight)
- 📱 **Long-press** (mobile/touch) — hold 500ms on any item to show its context menu; haptic vibration on Android
- 🖱️ **Drag-and-drop upload** — drop files from OS onto the file tree to upload them
- 🔑 **Access control** — path allow/deny rules via conf.json (longest-match algorithm)

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+O` | Open folder |
| `Ctrl+S` | Save file |
| `Ctrl+U` | Upload files |
| `Ctrl+D` | Download selected file/folder |
| `Ctrl+C` | Copy |
| `Ctrl+X` | Cut |
| `Ctrl+V` | Paste |
| `Ctrl+Delete` | Delete |
| `F2` | Rename |
| `F3` | Search |
| `F9` | Back to folder tree |
| `F10` | Toggle edit/preview |
| `↑↓←→` | Navigate tree |

---


## Requirements

- **Node.js** v16 or later
- Supported OS: **Windows**, **macOS**, **Linux**

---

## Authentication (Optional)

Set environment variables before starting:

```bash
# Generate a SHA-256 hash of your password
# Linux/macOS:
echo -n "mypassword" | sha256sum

# Windows PowerShell:
# [System.BitConverter]::ToString([System.Security.Cryptography.SHA256]::Create().ComputeHash([System.Text.Encoding]::UTF8.GetBytes("mypassword"))).Replace("-","").ToLower()

FM_USER=admin FM_PASS_HASH=<sha256-hex> node server.js
```

If `FM_USER` and `FM_PASS_HASH` are not set, authentication is disabled.  
Sessions expire after 8 hours.

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+O` | Open folder |
| `Ctrl+S` | Save file |
| `Ctrl+C` | Copy selected |
| `Ctrl+X` | Cut selected |
| `Ctrl+V` | Paste |
| `Ctrl+Delete` | Delete selected |
| `F2` | Rename |
| `F3` | File search |
| `F9` | Back to folder tree (saves if editing) |
| `F10` | Toggle Edit / Preview mode |
| `↑↓←→` | Navigate folder tree |

---

## URL Parameters

- `?root=/path/to/folder` — opens the specified folder on load
- The URL is updated automatically when you open a folder (bookmarkable)

---

## Install as a System Service

### Linux (systemd)
```bash
sudo node scripts/service.js install linux
# Uninstall:
sudo node scripts/service.js uninstall linux
```

### macOS (LaunchAgent)
```bash
node scripts/service.js install mac
# Uninstall:
node scripts/service.js uninstall mac
```

### Windows (Task Scheduler)
```cmd
node scripts/service.js install win
REM Uninstall:
node scripts/service.js uninstall win
```

---

## mDNS (.local Domain)

Install the optional `mdns` package to access the app as `http://mini-local-file-manager.local:3000`:

```bash
npm install mdns
```

> **Linux** may require `libavahi-compat-libdnssd-dev`:  
> `sudo apt install libavahi-compat-libdnssd-dev`
>
> **macOS** has mDNS built-in (Bonjour).

---

## USB-Portable Install

1. Copy this entire folder to a USB drive
2. Run `npm install` on the USB drive
3. Run `node server.js` from the USB drive

Pair with a portable Node.js binary for a fully self-contained setup.

---

## Project Structure

```
mini-local-file-manager/
├── server.js              # HTTP + WebSocket server
├── start.js               # Simple launcher
├── package.json
├── scripts/
│   └── service.js         # Cross-platform service installer
└── public/
    ├── index.html
    ├── img/
    │   └── favicon.svg
    ├── css/
    │   └── app.css
    └── js/
        ├── i18n.js        # Localization (ja/en)
        └── app.js         # Frontend application
```

---

## Open Source Libraries Used

| Library | Version | License | Purpose |
|---------|---------|---------|---------|
| [ws](https://github.com/websockets/ws) | ^8.17 | MIT | WebSocket server |
| [chokidar](https://github.com/paulmillr/chokidar) | ^3.6 | MIT | File system watcher |
| [mdns](https://github.com/agnat/node_mdns) | ^2.7 (optional) | MIT | mDNS / .local domain |

Frontend uses no external libraries — vanilla JS only.

Fonts served via [Google Fonts](https://fonts.google.com):
- [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) (Apache 2.0)
- [Noto Sans JP](https://fonts.google.com/noto/specimen/Noto+Sans+JP) (OFL)

---

## License

MIT

---

# Mini Local File Manager（日本語）

Node.js製の軽量ブラウザベース・ローカルファイルマネージャーです。

> このアプリケーションは Anthropic の [Claude Code](https://claude.ai/code) の支援のもとで作成されました。

## クイックスタート

```bash
npm install
node server.js           # ポート3000
node server.js 4000      # ポート指定
PORT=8080 node server.js # 環境変数
```

## 認証設定（任意）

```bash
# パスワードのSHA-256ハッシュを生成
echo -n "mypassword" | sha256sum

# 起動
FM_USER=admin FM_PASS_HASH=<ハッシュ値> node server.js
```

## ショートカットキー

| キー | 機能 |
|------|------|
| `Ctrl+O` | フォルダを開く |
| `Ctrl+S` | 保存 |
| `Ctrl+C` | コピー |
| `Ctrl+X` | 切り取り |
| `Ctrl+V` | 貼り付け |
| `Ctrl+Delete` | 削除 |
| `F2` | 名前変更 |
| `F3` | ファイル検索 |
| `F9` | フォルダ階層へ戻る（編集中は保存） |
| `F10` | 編集/プレビュー切替 |
| `↑↓←→` | フォルダ階層を移動 |

## 使用OSSライブラリ

| ライブラリ | バージョン | ライセンス | 用途 |
|-----------|-----------|-----------|------|
| [ws](https://github.com/websockets/ws) | ^8.17 | MIT | WebSocketサーバー |
| [chokidar](https://github.com/paulmillr/chokidar) | ^3.6 | MIT | ファイル変更監視 |
| [mdns](https://github.com/agnat/node_mdns) | ^2.7 (任意) | MIT | mDNS / .localドメイン |

フロントエンドは外部ライブラリ不使用（バニラJS）。
