import {cp,rm,mkdir,readFile} from 'node:fs/promises';
import vm from 'node:vm';
const sandbox={window:{}};
vm.runInNewContext(await readFile('public/config.js','utf8'),sandbox,{timeout:100});
const config=sandbox.window.MOOD_CONFIG||{};
const key=config.supabaseKey||'';
let secret=key.startsWith('sb_secret_');
try{if(key.split('.').length===3)secret ||= JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role==='service_role';}catch{}
if(secret)throw Error('Refusing to publish a Supabase secret key. Use a publishable or anon key.');
if((config.supabaseUrl||key)&&(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(config.supabaseUrl||'')||!key))throw Error('Set a valid Supabase Project URL and public key in public/config.js.');
await rm('dist',{recursive:true,force:true});
await mkdir('dist');
await cp('public','dist',{recursive:true});
console.log('Built static application in dist/');
