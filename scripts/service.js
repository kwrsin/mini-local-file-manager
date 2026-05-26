#!/usr/bin/env node
/**
 * scripts/service.js  — Cross-platform service installer
 * Usage:
 *   node scripts/service.js install [linux|mac|win]
 *   node scripts/service.js uninstall [linux|mac|win]
 */
'use strict';
const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const action   = process.argv[2] || 'install';
const platform = process.argv[3] || (os.platform()==='darwin'?'mac': os.platform()==='win32'?'win':'linux');
const APP_DIR  = path.resolve(__dirname, '..');
const NODE_BIN = process.execPath;
const PORT     = process.env.PORT || 3000;
const SVC_NAME = 'mini-local-file-manager';

function run(cmd){ try{execSync(cmd,{stdio:'inherit'});return true;}catch(e){console.error('  ✗',e.message);return false;} }

function installLinux(){
  const unit=`[Unit]\nDescription=Mini Local File Manager\nAfter=network.target\n\n[Service]\nType=simple\nUser=${os.userInfo().username}\nWorkingDirectory=${APP_DIR}\nExecStart=${NODE_BIN} ${APP_DIR}/server.js ${PORT}\nRestart=on-failure\nRestartSec=5\nEnvironment=NODE_ENV=production PORT=${PORT}\n\n[Install]\nWantedBy=multi-user.target\n`;
  try{
    fs.writeFileSync(`/etc/systemd/system/${SVC_NAME}.service`,unit);
    run('systemctl daemon-reload');
    run(`systemctl enable ${SVC_NAME}`);
    run(`systemctl start  ${SVC_NAME}`);
    console.log(`\n✓ systemd service installed`);
    console.log(`  systemctl status ${SVC_NAME}`);
  }catch(e){console.error('  ✗ Run with sudo:',e.message);}
}
function uninstallLinux(){
  try{run(`systemctl stop ${SVC_NAME} 2>/dev/null||true`);run(`systemctl disable ${SVC_NAME} 2>/dev/null||true`);fs.unlinkSync(`/etc/systemd/system/${SVC_NAME}.service`);run('systemctl daemon-reload');console.log('✓ Service removed');}catch(e){console.error('✗',e.message);}
}

function installMac(){
  const dir=path.join(os.homedir(),'Library','LaunchAgents');
  fs.mkdirSync(dir,{recursive:true});
  fs.mkdirSync(path.join(APP_DIR,'logs'),{recursive:true});
  const plist=`<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n  <key>Label</key><string>com.${SVC_NAME}</string>\n  <key>ProgramArguments</key><array><string>${NODE_BIN}</string><string>${APP_DIR}/server.js</string><string>${PORT}</string></array>\n  <key>WorkingDirectory</key><string>${APP_DIR}</string>\n  <key>RunAtLoad</key><true/>\n  <key>KeepAlive</key><true/>\n  <key>EnvironmentVariables</key><dict><key>PORT</key><string>${PORT}</string></dict>\n  <key>StandardOutPath</key><string>${APP_DIR}/logs/stdout.log</string>\n  <key>StandardErrorPath</key><string>${APP_DIR}/logs/stderr.log</string>\n</dict></plist>`;
  const p=path.join(dir,`com.${SVC_NAME}.plist`);
  fs.writeFileSync(p,plist);
  run(`launchctl load -w "${p}"`);
  console.log(`\n✓ LaunchAgent installed: ${p}`);
}
function uninstallMac(){
  const p=path.join(os.homedir(),'Library','LaunchAgents',`com.${SVC_NAME}.plist`);
  try{run(`launchctl unload "${p}" 2>/dev/null||true`);fs.unlinkSync(p);console.log('✓ LaunchAgent removed');}catch(e){console.error('✗',e.message);}
}

function installWin(){
  const bat=`@echo off\n"${NODE_BIN}" "${APP_DIR}\\server.js" ${PORT}`;
  const batPath=path.join(APP_DIR,`${SVC_NAME}.bat`);
  fs.writeFileSync(batPath,bat);
  if(run(`schtasks /create /tn "${SVC_NAME}" /tr "${batPath}" /sc onlogon /rl highest /f`)){
    console.log(`\n✓ Scheduled task created: ${SVC_NAME}`);
    run(`schtasks /run /tn "${SVC_NAME}"`);
  }
}
function uninstallWin(){
  run(`schtasks /end /tn "${SVC_NAME}" 2>nul`);
  run(`schtasks /delete /tn "${SVC_NAME}" /f`);
  try{fs.unlinkSync(path.join(APP_DIR,`${SVC_NAME}.bat`));}catch(e){}
  console.log('✓ Scheduled task removed');
}

const handlers={linux:{install:installLinux,uninstall:uninstallLinux},mac:{install:installMac,uninstall:uninstallMac},darwin:{install:installMac,uninstall:uninstallMac},win:{install:installWin,uninstall:uninstallWin},win32:{install:installWin,uninstall:uninstallWin}};
const h=handlers[platform];
if(!h){console.error(`Unsupported platform: ${platform}. Use: linux, mac, win`);process.exit(1);}
console.log(`\nMini Local File Manager – Service ${action} (${platform})`);
if(action==='install')h.install();
else if(action==='uninstall')h.uninstall();
else{console.error('Usage: node scripts/service.js [install|uninstall] [linux|mac|win]');}
