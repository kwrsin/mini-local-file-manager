#!/usr/bin/env node
const {spawn}=require('child_process'),path=require('path');
const port=process.argv[2]||process.env.PORT||3000;
spawn(process.execPath,[path.join(__dirname,'server.js'),port],{stdio:'inherit',env:{...process.env,PORT:String(port)}}).on('exit',c=>process.exit(c??0));
