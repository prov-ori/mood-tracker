import test from 'node:test';
import assert from 'node:assert/strict';
const mem=new Map();globalThis.window={MOOD_CONFIG:{supabaseUrl:'https://example.supabase.co',supabaseKey:'sb_publishable_example'}};globalThis.sessionStorage={getItem:k=>mem.get(k),setItem:(k,v)=>mem.set(k,v),removeItem:k=>mem.delete(k)};
let calls=[];globalThis.fetch=async(url,options)=>{calls.push({url,options});if(url.includes('/token'))return new Response(JSON.stringify({access_token:'token',refresh_token:'refresh',expires_in:3600,user:{id:'a'}}));if(url.includes('offset=0'))return new Response(JSON.stringify(Array.from({length:1000},()=>({date:'2026-01-01'}))));if(url.includes('offset=1000'))return new Response(JSON.stringify([{date:'2026-01-02'}]));return new Response('',{status:204});};
const {api}=await import('../public/api.js');
test('REST paginates past default 1000 limit and uses user bearer token',async()=>{await api.login('a@example.test','not-a-real-password');const rows=await api.all('entries');assert.equal(rows.length,1001);assert.equal(calls.at(-1).options.headers.Authorization,'Bearer token');assert.equal(calls.at(-1).options.headers.apikey,'sb_publishable_example');});
test('Failed writes are surfaced to caller',async()=>{globalThis.fetch=async()=>new Response(JSON.stringify({message:'RLS denied'}),{status:403});await assert.rejects(()=>api.insert('entries',{}),/RLS denied/);});
test('Logout clears tab session even if network fails',async()=>{await assert.rejects(()=>api.logout());assert.equal(mem.has('mood-session'),false);});
