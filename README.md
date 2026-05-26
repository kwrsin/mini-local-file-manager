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
