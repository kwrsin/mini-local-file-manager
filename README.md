# Mini Local File Manager - *Build your Markdown knowledge network.*

**A lightweight browser-based local file manager built with Node.js.**  
Browse, edit Markdown, create, rename, copy, move and delete files on your local machine via any browser — including mobile.

> This application was created with the assistance of [Claude](https://claude.ai) by Anthropic.

---

> ⚠️ **Notice:** Files deleted in this app are permanently removed and are **not** moved to a trash or recycle bin. If you need the ability to restore deleted files, we recommend syncing with a cloud storage service that provides a trash or recycle bin feature. Deleted files may be recoverable from the cloud storage's trash, depending on the service.

---

## Features

- 📁 Folder tree with lazy loading, keyboard navigation, and expansion-state persistence
- ✏️ Markdown editor with preview — new files default to `.md`, editor opens on creation
- 🔄 Manual reload button in the editor toolbar to refresh from disk
- 🔍 File search (by name or content) with deep-path expansion in results
- 🌐 Japanese / English auto-detection (browser language)
- 🔐 Optional HTTP Basic-style authentication (environment variables)
- 🖼️ Image / SVG / PDF / JSON viewer (modal)
- 🎵 Audio / Video player (mp3, m4a, wav, ogg, flac, aac, mp4, webm, ogv…)
- 📤 File upload via context menu or drag-and-drop (size-limited by conf)
- 📥 File / folder download (folders zipped on the fly)
- 📦 ZIP extract for `.zip` files (if `enabledUnzip: true`)
- 🖱️ Drag-to-move files and folders within the tree
- 📱 Long-press context menu for mobile/touch devices
- 🔗 URL parameter support: `?root=...&file=...` to open a specific file directly
- 📋 Copy-paste with automatic rename on conflict (`file_2.md`, `file_3.md`, …)
- 📝 Audit log (all file operations logged to stderr in CSV format)
- 🔒 Path-based access control via `conf.json`
- 🛡️ App self-protection: the directory containing `server.js` is always hidden and read-only regardless of any conf settings
- 🌍 Optional mDNS `.local` domain support
- 💾 USB-portable — no global installs needed
- 📦 No runtime dependencies in production (pure Node.js built-ins)
- 🌐 Supports virtual private networks (VPNs) such as Tailscale.

---

## Requirements

- **Node.js** v16 or later
- **OS:** Windows, macOS, Linux

---

## Quick Start

> **Important:** Because the app protects its own directory from access, always run the server from **outside** the app folder, or open a folder that is not the app directory itself.

```bash
# 1. Install (first time only — optional mdns only)
cd mini-local-file-manager
npm install

# 2. Run from the PARENT directory so your working folder is accessible
cd ..
node mini-local-file-manager/server.js

# 3. Specify a port
node mini-local-file-manager/server.js 4000

# 4. Via environment variable
PORT=8080 node mini-local-file-manager/server.js

# 5. With a conf.json (recommended for production use)
node mini-local-file-manager/server.js -conf=/path/to/conf.json

# 6. Override the listen address via CLI (takes priority over conf.json)
node mini-local-file-manager/server.js -ip_addr=0.0.0.0
node mini-local-file-manager/server.js -conf=/path/to/conf.json -ip_addr=192.168.1.50
```

Open **http://127.0.0.1:3000** in your browser, then enter a folder path and click **Open**.

> **Default listen address:** `127.0.0.1` (localhost only). Set `ip_addr` in `conf.json`, or pass `-ip_addr=ADDRESS` on the command line (see below).

---

## conf.json — Full Reference

```jsonc
{
  // Listening address (optional; default: 127.0.0.1)
  // Must be a valid IPv4 address. Invalid values cause startup to abort.
  "ip_addr": "127.0.0.1",    // localhost only (default)
  // "ip_addr": "0.0.0.0",  // all network interfaces (LAN-accessible)
  // "ip_addr": "192.168.11.2",  // specific interface only

  // Port (optional; CLI argument or PORT env var takes priority)
  "port": 3000,

  // Download permission (default: false when conf present, true when no conf)
  "enabledDownload": true,

  // Unzip permission (default: false when conf present, true when no conf)
  "enabledUnzip": true,

  // Max upload file size in MB (default: 20; must be > 0)
  "filesize": 20,

  // Path access rules (optional; if absent, all paths are allowed)
  // Rule matching: longest (most specific) base path wins, regardless of order.
  "access": [
    { "deny":  "/*" },                              // deny everything by default
    { "allow": "/users/alice/documents/*" },        // allow this subtree
    { "allow": "/users/alice/downloads/*" },
    { "deny":  "/users/alice/documents/secrets/*" } // more specific → overrides allow above
  ]
}
```

> **Comments:** `// line comments` are supported in `conf.json`.

### Feature flag behavior

| Setting | No `conf.json` | Key absent in conf | `false` | `true` |
|---|---|---|---|---|
| `enabledDownload` | ✅ allowed | ❌ blocked | ❌ blocked | ✅ allowed |
| `enabledUnzip`    | ✅ allowed | ❌ blocked | ❌ blocked | ✅ allowed |
| `filesize`        | 20 MB | 20 MB | — | N MB |

### Listening address (`ip_addr`)

**Priority:** `-ip_addr=` CLI argument **>** `conf.json` `ip_addr` **>** `HOST` env var **>** default (`127.0.0.1`)

```bash
# CLI argument (highest priority — overrides conf.json)
node mini-local-file-manager/server.js -ip_addr=0.0.0.0
```

| `ip_addr` value | Effect |
|---|---|
| absent / no conf | `127.0.0.1` — localhost only (secure default) |
| `"127.0.0.1"` | localhost only |
| `"0.0.0.0"` | all network interfaces (LAN-accessible) |
| `"192.168.x.x"` | specific NIC only |
| invalid value | startup aborted with error message (whether from conf.json or `-ip_addr=`) |

### Secure defaults (no conf.json)

When started **without** a conf.json:
- Access is restricted to the **current working directory** only
- Download and unzip are **disabled**
- Listen address defaults to **127.0.0.1**

---

## App Self-Protection

The directory containing `server.js` (`__dirname`) is **always inaccessible**, regardless of:
- `conf.json` access rules (even `allow /*` cannot override this)
- URL parameters
- Direct API calls

This prevents the app's own source code and configuration from being read, modified, or deleted via the UI.

---

## Access Control Examples

Run with a `conf.json` from outside the app directory:

```bash
# Allow only a specific user's Documents and Downloads folders
cd /home/alice
node mini-local-file-manager/server.js -conf=mini-local-file-manager/conf.json
```

Example `conf.json`:
```jsonc
{
  "ip_addr": "0.0.0.0",
  "port": 3000,
  "enabledDownload": true,
  "enabledUnzip": true,
  "filesize": 50,
  "access": [
    { "deny":  "/*" },
    { "allow": "/home/alice/Documents/*" },
    { "allow": "/home/alice/Downloads/*" }
  ]
}
```

---

## Audit Log

All file operations are written to **stderr** in CSV format:

```
date,action,path,ip address
20260101 10:10:00.222,opened,/users/alice/downloads,192.168.1.10
20260101 10:11:00.333,uploaded,/users/alice/downloads/photo.jpg,192.168.1.10
20260101 10:12:00.444,deleted,/users/alice/downloads/old.txt,192.168.1.10
```

**Action types:** `opened` · `created` · `saved` · `deleted` · `renamed` · `copied` · `uploaded` · `downloaded` · `unzipped`

```bash
# Append audit events to a log file
node mini-local-file-manager/server.js 2>>audit.log

# Split stdout (server info) and stderr (audit log)
node mini-local-file-manager/server.js 1>server.log 2>audit.log
```

---

## URL Parameters

| Parameter | Description |
|---|---|
| `?root=/path/to/folder` | Opens the specified folder on load |
| `?root=...&file=/path/to/file.md` | Opens folder, then opens the file in the appropriate viewer/editor |

The URL is updated automatically when you open a folder or file (bookmarkable links).

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Ctrl+O` | Open folder |
| `Ctrl+S` | Save file |
| `Ctrl+U` | Upload files (context menu) |
| `Ctrl+D` | Download selected file/folder |
| `Ctrl+C` | Copy selected |
| `Ctrl+X` | Cut selected |
| `Ctrl+V` | Paste (auto-renames on conflict: `_2`, `_3`, …) |
| `Ctrl+Delete` | Delete selected |
| `F2` | Rename |
| `F3` | Search |
| `F9` | Back to folder tree (auto-saves if editing) |
| `F10` | Toggle Edit / Preview mode |
| `Shift+Enter` | Open selected file in viewer/editor |
| `↑` / `↓` | Move focus in tree (no expand/collapse) |
| `→` | Open folder / move into first child if open |
| `←` | Close folder / move to parent |

---

## Authentication (Optional)

```bash
# Generate a SHA-256 hash of your password
# macOS / Linux:
echo -n "mypassword" | sha256sum

# Windows PowerShell:
[System.BitConverter]::ToString(
  [System.Security.Cryptography.SHA256]::Create().ComputeHash(
    [System.Text.Encoding]::UTF8.GetBytes("mypassword")
  )
).Replace("-","").ToLower()

# Start with authentication enabled
FM_USER=admin FM_PASS_HASH=<sha256-hex> node mini-local-file-manager/server.js
```

Sessions expire after 8 hours. If `FM_USER` / `FM_PASS_HASH` are not set, authentication is disabled.

---

## Install as a System Service
```bash
node scripts/service.js [install|uninstall] [linux|mac|win] [options]

Options:
  -conf=PATH         Path to conf.json (Absolute path recommended)
  -ip_addr=ADDRESS   Listening IP address (e.g., 0.0.0.0, 127.0.0.1, 192.168.x.x)
  -port=NUMBER       Port number (Default: 3000)
```
  
### Linux (systemd)
```bash
sudo node scripts/service.js install linux \
  -conf=/etc/filemanager/conf.json \
  -ip_addr=0.0.0.0 \
  -port=8080
sudo node scripts/service.js uninstall  # remove
```

### macOS (LaunchAgent)
```bash
node scripts/service.js install mac \
  -conf=/Users/alice/filemanager-conf.json
node scripts/service.js uninstall       # remove
```

### Windows (Task Scheduler)
```cmd
node scripts/service.js install win \
  -conf=c:\\mini_local_file_manager_settings\\conf.json
node scripts/service.js uninstall
```

---

## mDNS (.local Domain)

Install the optional `mdns` package to access the app as `http://mini-local-file-manager.local:3000`:

```bash
npm install mdns
```

> **Linux** may require: `sudo apt install libavahi-compat-libdnssd-dev`  
> **macOS** has mDNS built-in (Bonjour).

---

## USB-Portable Install

1. Copy the entire `mini-local-file-manager/` folder to a USB drive
2. Run `npm install` on the USB drive (first time only)
3. From the USB drive root: `node mini-local-file-manager/server.js`

Pair with a portable Node.js binary for a fully self-contained setup.

---

## Project Structure

```
mini-local-file-manager/
├── server.js              # HTTP server (Node.js built-ins only)
├── start.js               # Simple launcher
├── package.json
├── conf.example.json      # Configuration template
├── scripts/
│   └── service.js         # Cross-platform service installer
└── public/
    ├── index.html
    ├── manifest.json
    ├── sw.js              # Service Worker (PWA)
    ├── img/
    │   └── favicon.svg
    ├── css/
    │   └── app.css
    └── js/
        ├── i18n.js        # Localization (ja/en)
        ├── polyfill.js    # iOS / legacy browser compatibility
        └── app.js         # Frontend application (vanilla JS)
```

---

## Open Source Libraries Used

| Library | License | Purpose |
|---|---|---|
| [mdns](https://github.com/agnat/node_mdns) (optional) | MIT | mDNS / `.local` domain |

Frontend uses **no external libraries** — vanilla JS only.

Fonts served via [Google Fonts](https://fonts.google.com):
- [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) (Apache 2.0)
- [Noto Sans JP](https://fonts.google.com/noto/specimen/Noto+Sans+JP) (OFL)

---

## Disclaimer

THIS SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR RESULTING FROM THE SOFTWARE.

Use of this software is entirely at your own risk. The authors accept no responsibility for any data loss, corruption, unauthorized access, or other damage caused by the use or misuse of this software, including but not limited to file deletion, file overwriting, or exposure of files through misconfiguration of access control settings.

---

## License

MIT License

Copyright (c) 2026 Mini Local File Manager contributors

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

---

# Mini Local File Manager（日本語）

Node.js 製の軽量ブラウザベース・ローカルファイルマネージャーです。  
PC 上のファイルをブラウザ（モバイル含む）から閲覧・編集・作成・削除できます。

> このアプリケーションは Anthropic の [Claude](https://claude.ai) の支援のもとで作成されました。

---

> ⚠️ **注意:** このアプリで削除したファイルは**完全に削除**されます。ゴミ箱には移動しません。削除したファイルを復元できるようにしたい場合は、ゴミ箱機能のあるクラウドストレージとの同期を推奨します。クラウドストレージのゴミ箱からファイルを復元できる場合があります（サービスによって異なります）。

---

## クイックスタート

```bash
# アプリフォルダの外から実行する（自己保護機能があるため）
cd ..
node mini-local-file-manager/server.js

# ポート指定
node mini-local-file-manager/server.js 4000

# conf.json 指定（推奨）
node mini-local-file-manager/server.js -conf=/path/to/conf.json

# 待受アドレスをCLIで指定（conf.jsonより優先）
node mini-local-file-manager/server.js -ip_addr=0.0.0.0
```

ブラウザで **http://127.0.0.1:3000** を開き、フォルダパスを入力して「開く」をクリック。

---

## conf.json 設定例

```jsonc
{
  "ip_addr": "0.0.0.0",      // 待受アドレス（省略時: 127.0.0.1）
  "port": 3000,               // ポート番号（省略時: 3000）
  "enabledDownload": true,    // ダウンロード許可
  "enabledUnzip": true,       // ZIP解凍許可
  "filesize": 20,             // アップロード上限 MB
  "access": [
    { "deny":  "/*" },
    { "allow": "/Users/alice/Documents/*" },
    { "allow": "/Users/alice/Downloads/*" }
  ]
}
```

---

## ショートカットキー

| キー | 機能 |
|---|---|
| `Ctrl+O` | フォルダを開く |
| `Ctrl+S` | 保存 |
| `Ctrl+U` | アップロード（コンテキストメニュー） |
| `Ctrl+D` | ダウンロード |
| `Ctrl+C` | コピー |
| `Ctrl+X` | 切り取り |
| `Ctrl+V` | 貼り付け（同名ファイルは自動連番） |
| `Ctrl+Delete` | 削除 |
| `F2` | 名前変更 |
| `F3` | ファイル検索 |
| `F9` | フォルダ階層へ戻る（編集中は保存） |
| `F10` | 編集／プレビュー切替 |
| `Shift+Enter` | 選択ファイルを開く |
| `↑` / `↓` | フォーカス移動（展開しない） |
| `→` | フォルダを開く |
| `←` | フォルダを閉じる／親へ移動 |

---

## 免責事項

本ソフトウェアは現状のまま提供されます。商品性、特定目的への適合性、非侵害性の保証を含む、明示または黙示のいかなる保証も行いません。

作者は、本ソフトウェアの使用、誤使用、設定ミスにより生じたデータ損失・破損・不正アクセス・その他いかなる損害についても、一切の責任を負いません。使用は完全に自己責任で行ってください。

---

## ライセンス

MIT ライセンス — 詳細は上記の英語セクションを参照してください。
