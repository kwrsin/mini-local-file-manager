#!/usr/bin/env node
/**
 * scripts/service.js  — Cross-platform service installer
 *
 * Usage:
 *   node scripts/service.js install   [linux|mac|win] [options]
 *   node scripts/service.js uninstall [linux|mac|win]
 *
 * Options:
 *   -conf=PATH         Path to conf.json (absolute path strongly recommended)
 *   -ip_addr=ADDRESS   Listen address (e.g. 0.0.0.0, 127.0.0.1, 192.168.x.x)
 *   -port=NUMBER       Port number (default: 3000)
 *
 * Examples:
 *   node scripts/service.js install
 *   node scripts/service.js install mac -conf=/etc/filemanager/conf.json
 *   node scripts/service.js install linux -conf=/home/alice/fm.json -ip_addr=0.0.0.0 -port=8080
 *   node scripts/service.js uninstall
 *   node scripts/service.js uninstall mac
 */
'use strict';
const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ── Parse arguments ───────────────────────────────────────────────────────
const rawArgs  = process.argv.slice(2);
const action   = rawArgs.find(a => a === 'install' || a === 'uninstall') || 'install';
const platform = rawArgs.find(a => ['linux','mac','darwin','win','win32'].includes(a))
               || (os.platform() === 'darwin' ? 'mac'
                 : os.platform() === 'win32'  ? 'win'
                 :                              'linux');

let _conf   = null;
let _ipAddr = null;
let _port   = null;

for (const a of rawArgs) {
  if (/^-conf=/.test(a))    _conf   = a.slice('-conf='.length).trim();
  if (/^-ip_addr=/.test(a)) _ipAddr = a.slice('-ip_addr='.length).trim();
  if (/^-port=/.test(a))    _port   = a.slice('-port='.length).trim();
}

// ── Paths & constants ─────────────────────────────────────────────────────
const APP_DIR   = path.resolve(__dirname, '..');
const WORK_DIR  = path.dirname(APP_DIR);   // parent of app (for CWD security)
const NODE_BIN  = process.execPath;
const PORT      = _port || process.env.PORT || '3000';
const SVC_NAME  = 'mini-local-file-manager';

// ── Validate options early ────────────────────────────────────────────────
if (_conf) {
  const absConf = path.resolve(_conf);
  if (!fs.existsSync(absConf)) {
    console.error(`\n⚠  conf file not found: ${absConf}`);
    console.error('   Provide an absolute path and make sure the file exists.');
    process.exit(1);
  }
  _conf = absConf;  // normalise to absolute
}

// ── Build server argument list ────────────────────────────────────────────
function buildServerArgs() {
  const args = [PORT];
  if (_conf)   args.push(`-conf=${_conf}`);
  if (_ipAddr) args.push(`-ip_addr=${_ipAddr}`);
  return args;
}
const SERVER_ARGS = buildServerArgs();

// ── Startup summary ───────────────────────────────────────────────────────
function printSummary() {
  console.log(`\n  App dir   : ${APP_DIR}`);
  console.log(`  Work dir  : ${WORK_DIR}`);
  console.log(`  Node      : ${NODE_BIN}`);
  console.log(`  Port      : ${PORT}`);
  if (_conf)   console.log(`  conf.json : ${_conf}`);
  if (_ipAddr) console.log(`  ip_addr   : ${_ipAddr}`);
}

// ── Helpers ───────────────────────────────────────────────────────────────
function run(cmd) {
  try { execSync(cmd, { stdio: 'inherit' }); return true; }
  catch(e) { console.error('  ✗', e.message); return false; }
}

// ── Linux systemd ─────────────────────────────────────────────────────────
function installLinux() {
  printSummary();
  const execCmd = [NODE_BIN, `${APP_DIR}/server.js`, ...SERVER_ARGS].join(' ');
  const unit = `[Unit]
Description=Mini Local File Manager
After=network.target

[Service]
Type=simple
User=${os.userInfo().username}
WorkingDirectory=${WORK_DIR}
ExecStart=${execCmd}
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
`;
  try {
    fs.writeFileSync(`/etc/systemd/system/${SVC_NAME}.service`, unit);
    run('systemctl daemon-reload');
    run(`systemctl enable ${SVC_NAME}`);
    run(`systemctl start  ${SVC_NAME}`);
    console.log(`\n✓ systemd service installed and started`);
    console.log(`  Check status : systemctl status ${SVC_NAME}`);
    console.log(`  Audit log    : journalctl -u ${SVC_NAME} -f`);
  } catch(e) {
    console.error('  ✗ Run with sudo:', e.message);
  }
}

function uninstallLinux() {
  try {
    run(`systemctl stop    ${SVC_NAME} 2>/dev/null || true`);
    run(`systemctl disable ${SVC_NAME} 2>/dev/null || true`);
    fs.unlinkSync(`/etc/systemd/system/${SVC_NAME}.service`);
    run('systemctl daemon-reload');
    console.log('✓ systemd service removed');
  } catch(e) { console.error('✗', e.message); }
}

// ── macOS LaunchAgent ─────────────────────────────────────────────────────
function installMac() {
  printSummary();
  const dir = path.join(os.homedir(), 'Library', 'LaunchAgents');
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(APP_DIR, 'logs'), { recursive: true });

  const allArgs = [NODE_BIN, `${APP_DIR}/server.js`, ...SERVER_ARGS];
  const xmlArgs = allArgs.map(a => `    <string>${a}</string>`).join('\n');

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.${SVC_NAME}</string>
  <key>ProgramArguments</key><array>
${xmlArgs}
  </array>
  <key>WorkingDirectory</key><string>${WORK_DIR}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>EnvironmentVariables</key><dict>
    <key>NODE_ENV</key><string>production</string>
  </dict>
  <key>StandardOutPath</key><string>${APP_DIR}/logs/stdout.log</string>
  <key>StandardErrorPath</key><string>${APP_DIR}/logs/stderr.log</string>
</dict></plist>`;

  const p = path.join(dir, `com.${SVC_NAME}.plist`);
  fs.writeFileSync(p, plist);
  run(`launchctl load -w "${p}"`);
  console.log(`\n✓ LaunchAgent installed: ${p}`);
  console.log(`  Server log : ${APP_DIR}/logs/stdout.log`);
  console.log(`  Audit log  : ${APP_DIR}/logs/stderr.log`);
}

function uninstallMac() {
  const p = path.join(os.homedir(), 'Library', 'LaunchAgents', `com.${SVC_NAME}.plist`);
  try {
    run(`launchctl unload "${p}" 2>/dev/null || true`);
    fs.unlinkSync(p);
    console.log('✓ LaunchAgent removed');
  } catch(e) { console.error('✗', e.message); }
}

// ── Windows Task Scheduler ────────────────────────────────────────────────
function installWin() {
  printSummary();
  const winArgs = [`"${APP_DIR}\\server.js"`, ...SERVER_ARGS].join(' ');
  const bat = `@echo off
cd /d "${WORK_DIR}"
"${NODE_BIN}" ${winArgs}
`;
  const batPath = path.join(APP_DIR, `${SVC_NAME}.bat`);
  fs.writeFileSync(batPath, bat);
  if (run(`schtasks /create /tn "${SVC_NAME}" /tr "${batPath}" /sc onlogon /rl highest /f`)) {
    console.log(`\n✓ Scheduled task created: ${SVC_NAME}`);
    run(`schtasks /run /tn "${SVC_NAME}"`);
  }
}

function uninstallWin() {
  run(`schtasks /end    /tn "${SVC_NAME}" 2>nul`);
  run(`schtasks /delete /tn "${SVC_NAME}" /f`);
  try { fs.unlinkSync(path.join(APP_DIR, `${SVC_NAME}.bat`)); } catch(e) {}
  console.log('✓ Scheduled task removed');
}

// ── Dispatch ──────────────────────────────────────────────────────────────
const handlers = {
  linux:  { install: installLinux,  uninstall: uninstallLinux  },
  mac:    { install: installMac,    uninstall: uninstallMac    },
  darwin: { install: installMac,    uninstall: uninstallMac    },
  win:    { install: installWin,    uninstall: uninstallWin    },
  win32:  { install: installWin,    uninstall: uninstallWin    },
};

const h = handlers[platform];
if (!h) {
  console.error(`Unsupported platform: ${platform}. Use: linux, mac, win`);
  process.exit(1);
}

console.log(`\nMini Local File Manager – Service ${action} (${platform})`);
if (action === 'install')        h.install();
else if (action === 'uninstall') h.uninstall();
else {
  console.error('Usage: node scripts/service.js [install|uninstall] [linux|mac|win] [options]');
  process.exit(1);
}
